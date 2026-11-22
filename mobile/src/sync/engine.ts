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
import { OfflineError, ResyncNeededError, SignedOutError } from '../api'
import { ACCOUNT_KEY, type ImageFile, type LocalLibrary, type OutboxEntry } from '../store/library'
import { platformTimeZone, recordTimeZone } from '../timeZone'
import { deleteImageFiles, type ImageFiles } from './imageFiles'
import { withSyncLock } from './lock'
import { firstSync } from './merge'
import {
  CURSOR_KEY,
  IMAGE_REFUSALS,
  MERGED_KEY,
  MISSING_FILE,
  MISSING_IMAGES_KEY,
  PUSH_REFUSALS,
  assertSignedIn,
  downloadImage,
  haveImage,
  imageFileFor,
  readImage,
  refusedBy,
  type MissingImage,
  type SyncApi,
  type SyncContext,
} from './shared'
import { LAST_SYNCED_KEY, setSyncStatus, type SyncStatus } from './status'

export interface SyncResult {
  /** Changes the cloud took from this phone. */
  pushed: number
  /** Changes from the cloud written here. */
  pulled: number
}

export { CURSOR_KEY, MERGED_KEY, MISSING_IMAGES_KEY } from './shared'
export { withSyncLock } from './lock'

export interface SyncEngineOptions {
  library: LocalLibrary
  api: SyncApi
  files: ImageFiles
  /** This phone's IANA time zone (the platform's by default), recorded in `kv/timeZone`. */
  timeZone?: () => string | undefined
}

export interface SyncEngine {
  /**
   * Pushes local changes and pulls the cloud's. While a sync runs, calling again queues one more
   * after it (shared by every caller meanwhile). Rejects with SignedOutError (also without an
   * account, without asking the cloud), OfflineError or another error; the sync status says the same.
   */
  syncNow(): Promise<SyncResult>
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
    const { written, strayFiles } = applyPage(context.library, context.files, page, downloaded, missing)
    pulled += written
    await deleteImageFiles(context.files, strayFiles.map((path) => ({ path })))
    // A page that did not move the cursor would only be asked for again.
    if (!page.more || page.cursor === cursor) return pulled
    cursor = page.cursor
  }
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

/**
 * Writes one page and its cursor in one transaction. An image whose bytes the cloud no longer has
 * is left out and noted in `meta.missingImages`. Returns how many changes it wrote, and the files of
 * deleted images that had no file row (a download whose page was undone left them) to delete.
 */
function applyPage(library: LocalLibrary, files: ImageFiles, page: PullResponse, downloaded: Map<string, string>, missing: Set<string>): { written: number; strayFiles: string[] } {
  return library.applyRemote((remote) => {
    // Signed out since this sync began: the library is about to be cleared, so write none of it back.
    assertSignedIn(library)
    const strayFiles: string[] = []
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
      } else {
        // The store deletes a file it has a row for; one without a row is deleted here.
        if (change.tbl === 'images' && library.imageFile(change.id) === undefined) strayFiles.push(files.pathFor(change.id))
        remote.apply(change)
      }
      if (entry) library.removeOutboxEntry(change.tbl, change.id)
      written++
    }
    library.setMeta(CURSOR_KEY, page.cursor)
    if (listed || missingImages.size > 0) library.setMeta(MISSING_IMAGES_KEY, [...missingImages.values()])
    return { written, strayFiles }
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
    assertSignedIn(library)
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

const noop = () => {}

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

export function createSyncEngine({ library, api, files, timeZone = platformTimeZone }: SyncEngineOptions): SyncEngine {
  const context: SyncContext = { library, api, files }
  // Once per app start: the parked changes get one more try, and the noted images are fetched again
  // (until that has worked once).
  let unparkDue = true
  let missingImagesDue = true
  // Once per app start and per sign-in, after a pull (so the cloud's value is known): this phone's time zone.
  let timeZoneDue = true
  let signedIn = library.getMeta(ACCOUNT_KEY) !== undefined
  library.subscribe(['meta'], () => {
    const now = library.getMeta(ACCOUNT_KEY) !== undefined
    if (now && !signedIn) timeZoneDue = true
    signedIn = now
  })

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
      if (timeZoneDue) {
        // A local write: the triggers push it 2 s later.
        recordTimeZone(library, timeZone())
        timeZoneDue = false
      }
      if (pushFailure !== undefined) throw pushFailure
      assertSignedIn(library)
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
