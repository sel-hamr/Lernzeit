/*
 * The sync engine: pushes the outbox, then pulls everything the server has after this device's
 * cursor. Newest `updatedAt` wins per record on both sides: the server keeps the newer of what it
 * has and what is pushed, and a pulled change never replaces a local edit that is still waiting in
 * the outbox with a later `at`.
 *
 * One sync runs at a time per browser: in this tab by a queue, across tabs by the Web Locks API.
 */
import { db, type LernzeitDB, type OutboxEntry } from '@/db/db'
import { MAX_PUSH_BYTES, MAX_PUSH_CHANGES, SYNC_TABLES, imageMeta, type ImageMeta, type PullResponse, type SyncChange, type SyncTable } from '@lernzeit/core/sync'
import { acceptablePulled, batchChanges, changeBytes, pendingNewer, refusal, splitOnRefusal } from '@lernzeit/core/syncRules'
import type { StoredImage } from '@lernzeit/core/types'
import { ApiError, OfflineError, ResyncNeededError, SignedOutError, getImage, pull, push, putImage } from './api'
import { MERGED_KEY, mergeIntoCloud } from './firstSignIn'
import { applyRemote, onLocalChange } from './outbox'
import { setSyncStatus, type SyncStatus } from './status'

export interface SyncResult {
  /** Changes the server took from this device. */
  pushed: number
  /** Changes from the server written here. */
  pulled: number
}

const LOCK = 'lernzeit-sync'
/** `meta` key of the position in the server's changes this device has pulled up to. */
export const CURSOR_KEY = 'cursor'
/**
 * Pulled image records whose bytes the server no longer had, so they could not be shown here: each
 * as its record (`ImageMeta`), so it can be applied once the bytes are back. Older versions kept only
 * the id, which stays as it is.
 */
export const MISSING_IMAGES_KEY = 'missingImages'
export type MissingImage = ImageMeta | string
const missingId = (image: MissingImage) => (typeof image === 'string' ? image : image.id)
/** A sync starts this long after the last local change, so a burst of edits goes up together. */
const LOCAL_CHANGE_DELAY = 2_000
/** How often a visible tab syncs to pick up other devices' changes. */
const INTERVAL = 60_000

const syncTables = new Set<string>(SYNC_TABLES)
const noop = () => {}

interface Outgoing {
  entry: OutboxEntry
  change: SyncChange
  bytes: number
  /** An image's bytes, uploaded before its record is pushed. */
  blob?: Blob
}

// ---- Push ----

/** A change the cloud will not take as it is, and why. */
interface Refused {
  entry: OutboxEntry
  reason: string
}

/** Server answers that refuse what was sent, not the request: 400 names a bad change, 413 is too large, 415 not an image. */
export const PUSH_REFUSALS = [400, 413]
export const IMAGE_REFUSALS = [400, 413, 415]

export function refusedBy(error: unknown, statuses: number[]): error is ApiError {
  return error instanceof ApiError && statuses.includes(error.status)
}

/**
 * Pushes the outbox as it is now; entries written while this runs go up next time. A change the
 * cloud refuses is parked in the outbox and the rest still go. Returns how many changes went up.
 */
async function pushOutbox(database: LernzeitDB): Promise<number> {
  // Oldest first.
  const queued = (await database.outbox.toArray()).sort((x, y) => x.at - y.at)
  let pushed = 0
  for (let i = 0; i < queued.length; i += MAX_PUSH_CHANGES) {
    const { outgoing, refused } = await readOutgoing(database, queued.slice(i, i + MAX_PUSH_CHANGES))
    await park(database, refused)
    for (const batch of batchChanges(outgoing, MAX_PUSH_CHANGES, MAX_PUSH_BYTES)) pushed += await send(database, await uploadImages(database, batch))
  }
  return pushed
}

/** The rows of `records`, in their order, with one bulkGet per table. */
async function readRows(database: LernzeitDB, records: { tbl: string; id: string }[]): Promise<unknown[]> {
  const byTable = new Map<string, number[]>()
  records.forEach((record, i) => {
    const indexes = byTable.get(record.tbl)
    if (indexes) indexes.push(i)
    else byTable.set(record.tbl, [i])
  })
  const rows: unknown[] = new Array(records.length)
  await Promise.all(
    [...byTable].map(async ([tbl, indexes]) => {
      const found = await database.table(tbl).bulkGet(indexes.map((i) => records[i].id))
      indexes.forEach((index, j) => (rows[index] = found[j]))
    }),
  )
  return rows
}

/**
 * Each entry's record as it is now, read with the entry in one transaction so the two agree, and
 * the entries the cloud would refuse. Entries parked before are left out until their record changes or the app starts again.
 */
function readOutgoing(database: LernzeitDB, queued: OutboxEntry[]): Promise<{ outgoing: Outgoing[]; refused: Refused[] }> {
  return database.transaction('r', [...SYNC_TABLES, database.outbox], async () => {
    const found = await database.outbox.bulkGet(queued.map((e) => [e.tbl, e.id]))
    // Gone: a pulled change settled it since the outbox was read.
    const entries = found.filter((entry): entry is OutboxEntry => entry !== undefined && entry.stuck === undefined && syncTables.has(entry.tbl))
    const rows = await readRows(database, entries)
    const outgoing: Outgoing[] = []
    const refused: Refused[] = []
    for (const [i, entry] of entries.entries()) {
      const tbl = entry.tbl as SyncTable
      const row = rows[i]
      let change: SyncChange
      let blob: Blob | undefined
      if (row === undefined) change = { tbl, id: entry.id, data: null, updatedAt: entry.at, deleted: true }
      else if (tbl === 'images') {
        blob = (row as StoredImage).blob
        change = { tbl, id: entry.id, data: imageMeta(row as StoredImage), updatedAt: entry.at, deleted: false }
      } else change = { tbl, id: entry.id, data: row, updatedAt: entry.at, deleted: false }
      const reason = refusal(change, blob)
      if (reason) refused.push({ entry, reason })
      else outgoing.push({ entry, change, blob, bytes: changeBytes(change) })
    }
    return { outgoing, refused }
  })
}

/** Uploads the batch's image bytes. An image the server refuses is parked, and its record stays out of the push. */
async function uploadImages(database: LernzeitDB, batch: Outgoing[]): Promise<Outgoing[]> {
  const ready: Outgoing[] = []
  for (const item of batch) {
    if (item.blob) {
      try {
        await putImage(item.change.id, item.blob)
      } catch (error) {
        if (!refusedBy(error, IMAGE_REFUSALS)) throw error
        await park(database, [{ entry: item.entry, reason: error.message }])
        continue
      }
    }
    ready.push(item)
  }
  return ready
}

/**
 * Pushes one batch and clears its entries. When the server refuses it (a change it cannot store,
 * or a push too large to store at once), the batch goes in halves down to the one change at fault,
 * which is parked; the others still go up.
 */
async function send(database: LernzeitDB, batch: Outgoing[]): Promise<number> {
  if (batch.length === 0) return 0
  try {
    await push(batch.map((item) => item.change))
  } catch (error) {
    if (!refusedBy(error, PUSH_REFUSALS)) throw error
    const halves = splitOnRefusal(batch)
    if (!halves) {
      await park(database, [{ entry: batch[0].entry, reason: error.message }])
      return 0
    }
    return (await send(database, halves[0])) + (await send(database, halves[1]))
  }
  await acknowledge(database, batch.map((item) => item.entry))
  return batch.length
}

/** Removes the pushed entries, except those written again while the push was in flight: their `at` moved on. */
function acknowledge(database: LernzeitDB, pushed: OutboxEntry[]): Promise<void> {
  return database.transaction('rw', database.outbox, async () => {
    const current = await database.outbox.bulkGet(pushed.map((e) => [e.tbl, e.id]))
    const done = pushed.filter((entry, i) => current[i]?.at === entry.at)
    await database.outbox.bulkDelete(done.map((e) => [e.tbl, e.id]))
  })
}

/**
 * Marks refused entries stuck, so push skips them while their record stays as it is. They stay in
 * the outbox: the change is the owner's data. An entry written again meanwhile gets its own try.
 */
function park(database: LernzeitDB, refused: Refused[]): Promise<void> {
  if (refused.length === 0) return Promise.resolve()
  return database.transaction('rw', database.outbox, async () => {
    const current = await database.outbox.bulkGet(refused.map(({ entry }) => [entry.tbl, entry.id]))
    const still = refused.filter(({ entry }, i) => current[i]?.at === entry.at)
    await database.outbox.bulkPut(still.map(({ entry, reason }) => ({ tbl: entry.tbl, id: entry.id, at: entry.at, stuck: reason })))
  })
}

// ---- Pull ----

/** Pulls page after page until the server has no more. Returns how many changes were written here. */
async function pullAll(database: LernzeitDB): Promise<number> {
  let cursor = ((await database.meta.get(CURSOR_KEY))?.value as string | undefined) ?? ''
  let pulled = 0
  for (;;) {
    const page = await pull(cursor)
    // A failed download throws here, before the page is applied, so the cursor stays put.
    const { blobs, missing } = await downloadImages(database, page)
    pulled += await applyPage(database, page, blobs, missing)
    // A page that did not move the cursor would only be asked for again.
    if (!page.more || page.cursor === cursor) return pulled
    cursor = page.cursor
  }
}

/**
 * The bytes of the page's live images that are not here yet, and the ids whose bytes the server no
 * longer has (404). Any other failure throws, so the page is not applied.
 */
async function downloadImages(database: LernzeitDB, page: PullResponse): Promise<{ blobs: Map<string, Blob>; missing: Set<string> }> {
  const blobs = new Map<string, Blob>()
  const missing = new Set<string>()
  for (const change of page.changes) {
    if (change.tbl !== 'images' || change.deleted) continue
    if (pendingNewer((await database.outbox.get(['images', change.id]))?.at, change)) continue
    if ((await database.images.get(change.id))?.blob) continue
    try {
      blobs.set(change.id, await getImage(change.id))
    } catch (error) {
      // Waiting would not bring them back, and would stop this device pulling for good.
      if (!refusedBy(error, [404])) throw error
      missing.add(change.id)
    }
  }
  return { blobs, missing }
}

/**
 * Writes one page and its cursor in one transaction. An image whose bytes the server no longer has
 * is left out and its record kept in `meta.missingImages`. Returns how many changes it wrote.
 */
function applyPage(database: LernzeitDB, page: PullResponse, blobs: Map<string, Blob>, missing: Set<string>): Promise<number> {
  return applyRemote(database, async () => {
    const changes = page.changes.filter(acceptablePulled)
    const keys = changes.map((change): [string, string] => [change.tbl, change.id])
    const entries = await database.outbox.bulkGet(keys)
    const images = await database.images.bulkGet(changes.map((change) => (change.tbl === 'images' ? change.id : '')))
    const listed = (await database.meta.get(MISSING_IMAGES_KEY))?.value as MissingImage[] | undefined
    const missingImages = new Map(listed?.map((image) => [missingId(image), image]))

    const puts = new Map<string, unknown[]>()
    const deletes = new Map<string, string[]>()
    const settled: [string, string][] = []
    const add = <T>(map: Map<string, T[]>, tbl: string, item: T) => {
      const list = map.get(tbl)
      if (list) list.push(item)
      else map.set(tbl, [item])
    }
    changes.forEach((change, i) => {
      if (pendingNewer(entries[i]?.at, change)) return
      if (change.tbl === 'images') missingImages.delete(change.id)
      if (change.deleted) add(deletes, change.tbl, change.id)
      else if (change.tbl === 'images') {
        const meta = change.data as ImageMeta
        const downloaded = blobs.get(change.id)
        const blob = downloaded ? new Blob([downloaded], { type: meta.type }) : images[i]?.blob
        if (!blob && missing.has(change.id)) {
          missingImages.set(change.id, meta)
          return
        }
        // Nothing to show: undo the page, so it is pulled again next time.
        if (!blob) throw new Error(`The bytes of image ${change.id} are missing.`)
        add(puts, 'images', { id: meta.id, width: meta.width, height: meta.height, fit: meta.fit, blob } satisfies StoredImage)
      } else add(puts, change.tbl, change.data)
      if (entries[i]) settled.push(keys[i])
    })

    // A page holds each record at most once, so the order of these writes does not matter.
    await Promise.all([
      ...[...puts].map(([tbl, rows]) => database.table(tbl).bulkPut(rows)),
      ...[...deletes].map(([tbl, ids]) => database.table(tbl).bulkDelete(ids)),
      database.outbox.bulkDelete(settled),
      database.meta.put({ key: CURSOR_KEY, value: page.cursor }),
      listed || missingImages.size ? database.meta.put({ key: MISSING_IMAGES_KEY, value: [...missingImages.values()] }) : undefined,
    ])
    return [...puts.values(), ...deletes.values()].reduce((sum, list) => sum + list.length, 0)
  })
}

// ---- Once per start ----

/**
 * Takes the parked marks off the outbox, so each change the cloud refused goes up once more; one it
 * still refuses is parked again. The cloud's limits can change, and the change is the owner's data.
 */
async function unpark(database: LernzeitDB): Promise<void> {
  await database.outbox.filter((entry) => entry.stuck !== undefined).modify((entry) => void delete entry.stuck)
}

/**
 * Fetches the bytes of the images noted in `meta.missingImages` again and applies the records whose
 * bytes are back. An image this device has written or deleted since (it is here, or waits in the
 * outbox) is no longer noted: this device's version stands. Ids without their record stay noted.
 */
async function retryMissingImages(database: LernzeitDB): Promise<void> {
  const noted = ((await database.meta.get(MISSING_IMAGES_KEY))?.value as MissingImage[] | undefined) ?? []
  if (noted.length === 0) return
  const ids = noted.map(missingId)
  const [here, pending] = await Promise.all([database.images.bulkGet(ids), database.outbox.bulkGet(ids.map((id) => ['images', id]))])
  const changedHere = new Set(ids.filter((_, i) => here[i] !== undefined || pending[i] !== undefined))
  const found = new Map<string, Blob>()
  for (const image of noted) {
    if (typeof image === 'string' || changedHere.has(image.id)) continue
    try {
      found.set(image.id, await getImage(image.id))
    } catch (error) {
      if (!refusedBy(error, [404])) throw error
    }
  }
  await applyRemote(database, async () => {
    const keep: MissingImage[] = []
    const puts: StoredImage[] = []
    for (const image of noted) {
      if (changedHere.has(missingId(image))) continue
      const bytes = typeof image === 'string' ? undefined : found.get(image.id)
      if (typeof image === 'string' || !bytes) keep.push(image)
      else puts.push({ id: image.id, width: image.width, height: image.height, fit: image.fit, blob: new Blob([bytes], { type: image.type }) })
    }
    await database.images.bulkPut(puts)
    await database.meta.put({ key: MISSING_IMAGES_KEY, value: keep })
  })
}

/** The databases whose next sync is the first since startSync. */
const firstSinceStart = new Set<string>()

// ---- One sync at a time ----

let localTail: Promise<unknown> = Promise.resolve()

/** Runs `fn` holding the sync lock: the Web Lock across tabs, or a queue in this tab where there is none. */
export function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const locks = typeof navigator === 'undefined' ? undefined : navigator.locks
  if (locks) return locks.request(LOCK, fn)
  const result = localTail.then(fn)
  localTail = result.catch(noop)
  return result
}

function statusFor(error: unknown): SyncStatus {
  if (error instanceof SignedOutError) return { state: 'signedOut' }
  if (error instanceof OfflineError) return { state: 'offline' }
  return { state: 'error', error: error instanceof Error ? error.message : String(error) }
}

async function run(database: LernzeitDB): Promise<SyncResult> {
  setSyncStatus({ state: 'syncing' })
  const first = firstSinceStart.delete(database.name)
  try {
    if (first) await unpark(database)
    let pushed = 0
    let pushFailure: unknown
    try {
      pushed = await pushOutbox(database)
    } catch (error) {
      // Offline or signed out, a pull would fail the same way. After any other failure this
      // device still takes in the other devices' changes.
      if (error instanceof OfflineError || error instanceof SignedOutError) throw error
      pushFailure = error ?? new Error('The push failed.')
    }
    const pulled = await pullAll(database).catch((error) => (error instanceof ResyncNeededError ? resync(database) : Promise.reject(error)))
    if (first) {
      try {
        await retryMissingImages(database)
      } catch (error) {
        // Tried again on the next sync.
        firstSinceStart.add(database.name)
        throw error
      }
    }
    if (pushFailure !== undefined) throw pushFailure
    setSyncStatus({ state: 'idle', lastSyncedAt: Date.now() })
    return { pushed, pulled }
  } catch (error) {
    setSyncStatus(statusFor(error))
    throw error
  }
}

/**
 * The cloud went back past this device's cursor (see ResyncNeededError): forgets the cursor and that
 * this browser merged, then merges again, which uploads what the cloud lost and takes in the rest.
 * Without `merged`, a merge cut short here runs again on the next start (the merge dialog) rather
 * than a sync from the beginning, which would leave the records the cloud lost only on this device.
 * Returns 0: the merge replaced the library rather than pulling changes into it.
 */
async function resync(database: LernzeitDB): Promise<number> {
  await database.meta.bulkDelete([CURSOR_KEY, MERGED_KEY])
  await mergeIntoCloud(database)
  return 0
}

const running = new Map<string, Promise<SyncResult>>()
const queued = new Map<string, Promise<SyncResult>>()

function begin(database: LernzeitDB): Promise<SyncResult> {
  const name = database.name
  const flight = withLock(() => run(database)).finally(() => {
    if (running.get(name) === flight) running.delete(name)
  })
  running.set(name, flight)
  return flight
}

/**
 * Pushes local changes and pulls the server's. While a sync runs, calling again queues one more
 * after it (shared by every caller meanwhile), so a change made during a sync is not left waiting.
 * Rejects with SignedOutError, OfflineError or ApiError; the sync status says the same.
 */
export function syncNow(database: LernzeitDB = db): Promise<SyncResult> {
  const name = database.name
  const next = queued.get(name)
  if (next) return next
  const current = running.get(name)
  if (!current) return begin(database)
  const after = current.then(noop, noop).then(() => {
    queued.delete(name)
    return begin(database)
  })
  queued.set(name, after)
  return after
}

// ---- Triggers ----

let stopTriggers: (() => void) | undefined

/**
 * Syncs now, when the browser comes online, when the tab becomes visible, 2 s after the last local
 * change and every 60 s while visible. The first sync also retries what earlier syncs set aside:
 * changes the cloud refused, and images whose bytes it did not have.
 */
export function startSync(database: LernzeitDB = db): void {
  if (stopTriggers) return
  firstSinceStart.add(database.name)
  // Failures show in the sync status.
  const sync = () => void syncNow(database).catch(noop)
  const visible = () => typeof document === 'undefined' || document.visibilityState === 'visible'
  const onVisibilityChange = () => {
    if (visible()) sync()
  }
  const onOffline = () => setSyncStatus({ state: 'offline' })

  let delay: ReturnType<typeof setTimeout> | undefined
  const stopListening = onLocalChange((name) => {
    if (name !== database.name) return
    clearTimeout(delay)
    delay = setTimeout(sync, LOCAL_CHANGE_DELAY)
  })
  const interval = setInterval(onVisibilityChange, INTERVAL)
  if (typeof window !== 'undefined') {
    window.addEventListener('online', sync)
    window.addEventListener('offline', onOffline)
  }
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibilityChange)

  stopTriggers = () => {
    stopListening()
    clearTimeout(delay)
    clearInterval(interval)
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', sync)
      window.removeEventListener('offline', onOffline)
    }
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibilityChange)
  }
  sync()
}

/** Stops the triggers. A sync already running finishes. */
export function stopSync(): void {
  stopTriggers?.()
  stopTriggers = undefined
}
