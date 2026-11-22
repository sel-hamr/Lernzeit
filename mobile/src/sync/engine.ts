/*
 * The phone's sync engine, the web's (src/sync/engine.ts) over the SQLite store and image files:
 * pushes the outbox, then pulls everything the cloud has after this phone's cursor. The rules are
 * core's (@lernzeit/core/syncRules) and the same as the web's: newest `updatedAt` wins, the push
 * goes oldest first in batches of count and bytes, an image's bytes go up before its record, a
 * refused change is parked in the outbox (never dropped), and a pulled change never replaces a
 * local edit still waiting in the outbox with a later stamp.
 *
 * A pull page is applied in one store transaction with its cursor, after the bytes of its images
 * are in files: a phone killed mid-pull resumes from the last page it applied. A failed download
 * stops the pull before its page; an image the cloud no longer has (404) is skipped and noted in
 * `meta.missingImages`. A 409 resync forgets the cursor and merges this phone's library in again.
 *
 * One sync runs at a time in this process (a module-level lock), and the app makes one engine.
 * The first sync of an engine (once per app start) also unparks the refused changes and fetches the
 * noted images again.
 */
import { MAX_PUSH_BYTES, MAX_PUSH_CHANGES, type ImageMeta, type PullResponse, type SyncChange } from '@lernzeit/core/sync'
import { acceptablePulled, batchChanges, changeBytes, pendingNewer, refusal, splitOnRefusal } from '@lernzeit/core/syncRules'
import { ACCOUNT_KEY } from '../account'
import { ApiError, OfflineError, ResyncNeededError, SignedOutError, type Api } from '../api'
import type { ImageFile, LocalLibrary, OutboxEntry } from '../store/library'
import type { ImageFiles } from './imageFiles'
import { firstSync } from './merge'
import { LAST_SYNCED_KEY, setSyncStatus, type SyncStatus } from './status'

export interface SyncResult {
  /** Changes the cloud took from this phone. */
  pushed: number
  /** Changes from the cloud written here. */
  pulled: number
}

/** `meta` key of the position in the cloud's changes this phone has pulled up to. */
export const CURSOR_KEY = 'cursor'
/** `meta` key set once this phone's library is in the cloud (merged, or pulled into an empty phone). */
export const MERGED_KEY = 'merged'
/** `meta` key of the pulled image records whose bytes the cloud no longer had, to apply once they are back. */
export const MISSING_IMAGES_KEY = 'missingImages'

export interface MissingImage {
  data: ImageMeta
  updatedAt: number
}

/** Server answers that refuse what was sent, not the request: 400 names a bad change, 413 is too large, 415 not an image. */
export const PUSH_REFUSALS = [400, 413]
export const IMAGE_REFUSALS = [400, 413, 415]

export function refusedBy(error: unknown, statuses: number[]): error is ApiError {
  return error instanceof ApiError && statuses.includes(error.status)
}

export type SyncApi = Pick<Api, 'push' | 'pull' | 'putImage' | 'getImage'>

export interface SyncEngineOptions {
  library: LocalLibrary
  api: SyncApi
  files: ImageFiles
}

export interface SyncEngine {
  /**
   * Pushes local changes and pulls the cloud's. While a sync runs, calling again queues one more
   * after it (shared by every caller meanwhile). Rejects with SignedOutError (also without an
   * account, without asking the cloud), OfflineError or another error; the sync status says the same.
   */
  syncNow(): Promise<SyncResult>
}

/** What the engine works with, for its helpers here and in merge.ts. */
export interface SyncContext {
  library: LocalLibrary
  api: SyncApi
  files: ImageFiles
}

interface Outgoing {
  entry: OutboxEntry
  change: SyncChange
  bytes: number
  /** An image's file, uploaded before its record is pushed. */
  file?: ImageFile
}

interface Refused {
  entry: OutboxEntry
  reason: string
}

const MISSING_FILE = 'The image file is missing on this phone, so it cannot sync.'

// ---- Push ----

/** Pushes the outbox as it is now; entries written while this runs go up next time. Returns how many changes went up. */
async function pushOutbox(context: SyncContext): Promise<number> {
  const queued = context.library.outbox()
  let pushed = 0
  for (let i = 0; i < queued.length; i += MAX_PUSH_CHANGES) {
    const { outgoing, refused } = readOutgoing(context.library, queued.slice(i, i + MAX_PUSH_CHANGES))
    context.library.park(refused)
    for (const batch of batchChanges(outgoing, MAX_PUSH_CHANGES, MAX_PUSH_BYTES)) pushed += await send(context, await uploadImages(context, batch))
  }
  return pushed
}

/**
 * Each entry's record as it is now (synchronous reads, so no write lands in between), and the
 * entries the cloud would refuse. Entries settled since the outbox was read, or parked, are left out.
 */
function readOutgoing(library: LocalLibrary, queued: OutboxEntry[]): { outgoing: Outgoing[]; refused: Refused[] } {
  const outgoing: Outgoing[] = []
  const refused: Refused[] = []
  for (const { tbl, id } of queued) {
    const entry = library.outboxEntry(tbl, id)
    if (!entry || entry.stuck !== undefined) continue
    const row = library.get(tbl, id)
    const change: SyncChange = row === undefined ? { tbl, id, data: null, updatedAt: entry.at, deleted: true } : { tbl, id, data: row, updatedAt: entry.at, deleted: false }
    const file = tbl === 'images' && row !== undefined ? library.imageFile(id) : undefined
    const reason = tbl === 'images' && row !== undefined && !file ? MISSING_FILE : refusal(change)
    if (reason) refused.push({ entry, reason })
    else outgoing.push({ entry, change, file, bytes: changeBytes(change) })
  }
  return { outgoing, refused }
}

/**
 * Reads an image's bytes from its file, or answers why it cannot go up: the file is gone, or the
 * cloud would refuse the bytes. Any other read failure throws.
 */
export async function readImage(files: ImageFiles, change: SyncChange, file: ImageFile): Promise<{ bytes: Uint8Array } | { reason: string }> {
  if (!(await files.exists(file.path))) return { reason: MISSING_FILE }
  const bytes = await files.read(file.path)
  const reason = refusal(change, { type: file.type, size: bytes.byteLength })
  return reason ? { reason } : { bytes }
}

/** Uploads the batch's image bytes, one file at a time. An image the cloud refuses is parked, and its record stays out of the push. */
async function uploadImages({ library, api, files }: SyncContext, batch: Outgoing[]): Promise<Outgoing[]> {
  const ready: Outgoing[] = []
  for (const item of batch) {
    if (item.file) {
      const image = await readImage(files, item.change, item.file)
      if ('reason' in image) {
        library.park([{ entry: item.entry, reason: image.reason }])
        continue
      }
      try {
        await api.putImage(item.change.id, image.bytes, item.file.type)
      } catch (error) {
        if (!refusedBy(error, IMAGE_REFUSALS)) throw error
        library.park([{ entry: item.entry, reason: error.message }])
        continue
      }
    }
    ready.push(item)
  }
  return ready
}

/**
 * Pushes one batch and clears its entries (except those written again meanwhile). When the cloud
 * refuses it, the batch goes in halves down to the one change at fault, which is parked.
 */
async function send(context: SyncContext, batch: Outgoing[]): Promise<number> {
  if (batch.length === 0) return 0
  try {
    await context.api.push(batch.map((item) => item.change))
  } catch (error) {
    if (!refusedBy(error, PUSH_REFUSALS)) throw error
    const halves = splitOnRefusal(batch)
    if (!halves) {
      context.library.park([{ entry: batch[0].entry, reason: error.message }])
      return 0
    }
    return (await send(context, halves[0])) + (await send(context, halves[1]))
  }
  context.library.acknowledge(batch.map((item) => item.entry))
  return batch.length
}

// ---- Pull ----

/** Pulls page after page until the cloud has no more. Returns how many changes were written here. */
export async function pullAll(context: SyncContext): Promise<number> {
  let cursor = context.library.getMeta<string>(CURSOR_KEY) ?? ''
  let pulled = 0
  for (;;) {
    const page = await context.api.pull(cursor)
    // A failed download throws here, before the page is applied, so the cursor stays put.
    const { downloaded, missing } = await downloadImages(context, page)
    pulled += applyPage(context.library, page, downloaded, missing)
    // A page that did not move the cursor would only be asked for again.
    if (!page.more || page.cursor === cursor) return pulled
    cursor = page.cursor
  }
}

/** Whether this phone already has the image's bytes in a file. */
export async function haveImage({ library, files }: SyncContext, id: string): Promise<boolean> {
  const file = library.imageFile(id)
  return file !== undefined && (await files.exists(file.path))
}

/**
 * Downloads an image's bytes into its file. Returns the file's path, or undefined when the cloud no
 * longer has them (404). Any other failure throws.
 */
export async function downloadImage({ api, files }: SyncContext, id: string): Promise<string | undefined> {
  let bytes: ArrayBuffer
  try {
    bytes = (await api.getImage(id)).bytes
  } catch (error) {
    // Waiting would not bring them back, and would stop this phone pulling for good.
    if (refusedBy(error, [404])) return undefined
    throw error
  }
  const path = files.pathFor(id)
  await files.write(path, new Uint8Array(bytes))
  return path
}

/** Puts the bytes of the page's live images that are not here yet into files; notes the ones the cloud no longer has. */
async function downloadImages(context: SyncContext, page: PullResponse): Promise<{ downloaded: Map<string, string>; missing: Set<string> }> {
  const downloaded = new Map<string, string>()
  const missing = new Set<string>()
  for (const change of page.changes) {
    if (change.tbl !== 'images' || change.deleted || !acceptablePulled(change)) continue
    if (pendingNewer(context.library.outboxEntry('images', change.id)?.at, change)) continue
    if (await haveImage(context, change.id)) continue
    const path = await downloadImage(context, change.id)
    if (path === undefined) missing.add(change.id)
    else downloaded.set(change.id, path)
  }
  return { downloaded, missing }
}

/** The file row of a pulled image record whose bytes are at `path`. */
export const imageFileFor = (meta: ImageMeta, path: string): ImageFile => ({ id: meta.id, path, type: meta.type, width: meta.width, height: meta.height, fit: meta.fit })

/**
 * Writes one page and its cursor in one transaction. An image whose bytes the cloud no longer has
 * is left out and noted in `meta.missingImages`. Returns how many changes it wrote.
 */
function applyPage(library: LocalLibrary, page: PullResponse, downloaded: Map<string, string>, missing: Set<string>): number {
  return library.applyRemote((remote) => {
    const listed = library.getMeta<MissingImage[]>(MISSING_IMAGES_KEY)
    const missingImages = new Map(listed?.map((image) => [image.data.id, image]))
    let written = 0
    for (const change of page.changes) {
      if (!acceptablePulled(change)) continue
      const entry = library.outboxEntry(change.tbl, change.id)
      if (pendingNewer(entry?.at, change)) continue
      if (change.tbl === 'images') missingImages.delete(change.id)
      if (change.tbl === 'images' && !change.deleted) {
        const meta = change.data as ImageMeta
        // A file row whose file is gone does not count: the bytes were looked for and are missing.
        const path = downloaded.get(change.id) ?? (missing.has(change.id) ? undefined : library.imageFile(change.id)?.path)
        if (path === undefined && missing.has(change.id)) {
          missingImages.set(change.id, { data: meta, updatedAt: change.updatedAt })
          continue
        }
        // Nothing to show: undo the page, so it is pulled again next time.
        if (path === undefined) throw new Error(`The bytes of image ${change.id} are missing.`)
        remote.apply(change)
        library.putImageFile(imageFileFor(meta, path))
      } else remote.apply(change)
      if (entry) library.removeOutboxEntry(change.tbl, change.id)
      written++
    }
    library.setMeta(CURSOR_KEY, page.cursor)
    if (listed || missingImages.size > 0) library.setMeta(MISSING_IMAGES_KEY, [...missingImages.values()])
    return written
  })
}

// ---- Once per start ----

/**
 * Fetches the bytes of the images noted in `meta.missingImages` again and applies the records whose
 * bytes are back. An image this phone has written or deleted since (it is here, or waits in the
 * outbox) is no longer noted: this phone's version stands.
 */
async function retryMissingImages(context: SyncContext): Promise<void> {
  const { library } = context
  const noted = library.getMeta<MissingImage[]>(MISSING_IMAGES_KEY) ?? []
  if (noted.length === 0) return
  const changedHere = (id: string) => library.get('images', id) !== undefined || library.outboxEntry('images', id) !== undefined
  const found = new Map<string, string>()
  for (const image of noted) {
    if (changedHere(image.data.id)) continue
    const path = await downloadImage(context, image.data.id)
    if (path !== undefined) found.set(image.data.id, path)
  }
  library.applyRemote((remote) => {
    const keep: MissingImage[] = []
    for (const image of noted) {
      const { id } = image.data
      if (changedHere(id)) continue
      const path = found.get(id)
      if (path === undefined) {
        keep.push(image)
        continue
      }
      remote.apply({ tbl: 'images', id, data: image.data, updatedAt: image.updatedAt, deleted: false })
      library.putImageFile(imageFileFor(image.data, path))
    }
    library.setMeta(MISSING_IMAGES_KEY, keep)
  })
}

// ---- One sync at a time ----

let tail: Promise<unknown> = Promise.resolve()
const noop = () => {}

/** Runs `fn` after every sync started before it in this process has finished. */
function withSyncLock<T>(fn: () => Promise<T>): Promise<T> {
  const result = tail.then(fn)
  tail = result.catch(noop)
  return result
}

function statusFor(error: unknown): SyncStatus {
  if (error instanceof SignedOutError) return { state: 'signedOut' }
  if (error instanceof OfflineError) return { state: 'offline' }
  return { state: 'error', error: error instanceof Error ? error.message : String(error) }
}

/**
 * The cloud went back past this phone's cursor (ResyncNeededError): forgets the cursor and that
 * this phone merged, then syncs from the beginning, merging its library in when it has one, which
 * uploads what the cloud lost. Returns 0: the merge replaced the library rather than pulling into it.
 */
async function resync(context: SyncContext): Promise<number> {
  context.library.write(() => {
    context.library.removeMeta(CURSOR_KEY)
    context.library.removeMeta(MERGED_KEY)
  })
  const merged = await firstSync(context)
  return merged ? 0 : pullAll(context)
}

export function createSyncEngine({ library, api, files }: SyncEngineOptions): SyncEngine {
  const context: SyncContext = { library, api, files }
  // Once per app start: the parked changes get one more try, and the noted images are fetched again
  // (until that has worked once).
  let unparkDue = true
  let missingImagesDue = true

  async function run(): Promise<SyncResult> {
    if (library.getMeta(ACCOUNT_KEY) === undefined) {
      setSyncStatus({ state: 'signedOut' })
      throw new SignedOutError()
    }
    setSyncStatus({ state: 'syncing' })
    try {
      if (unparkDue) {
        library.unpark()
        unparkDue = false
      }
      if (library.getMeta(MERGED_KEY) !== true) await firstSync(context)
      let pushed = 0
      let pushFailure: unknown
      try {
        pushed = await pushOutbox(context)
      } catch (error) {
        // Offline or signed out, a pull would fail the same way. After any other failure this
        // phone still takes in the other devices' changes.
        if (error instanceof OfflineError || error instanceof SignedOutError) throw error
        pushFailure = error ?? new Error('The push failed.')
      }
      const pulled = await pullAll(context).catch((error) => (error instanceof ResyncNeededError ? resync(context) : Promise.reject(error)))
      if (missingImagesDue) {
        await retryMissingImages(context)
        missingImagesDue = false
      }
      if (pushFailure !== undefined) throw pushFailure
      library.setMeta(LAST_SYNCED_KEY, library.now())
      setSyncStatus({ state: 'idle' })
      return { pushed, pulled }
    } catch (error) {
      setSyncStatus(statusFor(error))
      throw error
    }
  }

  let running: Promise<SyncResult> | undefined
  let queued: Promise<SyncResult> | undefined

  function begin(): Promise<SyncResult> {
    const flight = withSyncLock(run).finally(() => {
      if (running === flight) running = undefined
    })
    running = flight
    return flight
  }

  return {
    syncNow() {
      if (queued) return queued
      if (!running) return begin()
      const after = running.then(noop, noop).then(() => {
        queued = undefined
        return begin()
      })
      queued = after
      return after
    },
  }
}
