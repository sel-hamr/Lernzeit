/*
 * The sync engine: pushes the outbox, then pulls everything the server has after this device's
 * cursor. Newest `updatedAt` wins per record on both sides: the server keeps the newer of what it
 * has and what is pushed, and a pulled change never replaces a local edit that is still waiting in
 * the outbox with a later `at`.
 *
 * One sync runs at a time per browser: in this tab by a queue, across tabs by the Web Locks API.
 */
import { db, type LernzeitDB, type OutboxEntry } from '@/db/db'
import {
  MAX_PUSH_BYTES,
  MAX_PUSH_CHANGES,
  SYNC_TABLES,
  imageMeta,
  isSynced,
  recordId,
  type ImageMeta,
  type PullResponse,
  type PulledChange,
  type SyncChange,
  type SyncTable,
} from '@lernzeit/core/sync'
import type { StoredImage } from '@lernzeit/core/types'
import { ApiError, OfflineError, SignedOutError, getImage, pull, push, putImage } from './api'
import { applyRemote, onLocalChange } from './outbox'
import { setSyncStatus, type SyncStatus } from './status'

export interface SyncResult {
  /** Changes the server took from this device. */
  pushed: number
  /** Changes from the server written here. */
  pulled: number
}

const LOCK = 'lernzeit-sync'
const CURSOR_KEY = 'cursor'
/** A sync starts this long after the last local change, so a burst of edits goes up together. */
const LOCAL_CHANGE_DELAY = 2_000
/** How often a visible tab syncs to pick up other devices' changes. */
const INTERVAL = 60_000
/** `{"changes":[]}` around the changes of a push. */
const PUSH_ENVELOPE_BYTES = 14

const syncTables = new Set<string>(SYNC_TABLES)
const encoder = new TextEncoder()
const noop = () => {}

interface Outgoing {
  entry: OutboxEntry
  change: SyncChange
  bytes: number
  /** An image's bytes, uploaded before its record is pushed. */
  blob?: Blob
}

// ---- Push ----

/** Pushes the outbox as it is now; entries written while this runs go up next time. Returns how many changes went up. */
async function pushOutbox(database: LernzeitDB): Promise<number> {
  // Oldest first.
  const queued = (await database.outbox.toArray()).sort((x, y) => x.at - y.at)
  let pushed = 0
  for (let i = 0; i < queued.length; i += MAX_PUSH_CHANGES) {
    const outgoing = await readOutgoing(database, queued.slice(i, i + MAX_PUSH_CHANGES))
    for (const batch of batches(outgoing)) {
      for (const item of batch) if (item.blob) await putImage(item.change.id, item.blob)
      pushed += await send(database, batch)
    }
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

/** Each entry's record as it is now, read with the entry in one transaction so the two agree. */
function readOutgoing(database: LernzeitDB, queued: OutboxEntry[]): Promise<Outgoing[]> {
  return database.transaction('r', [...SYNC_TABLES, database.outbox], async () => {
    const found = await database.outbox.bulkGet(queued.map((e) => [e.tbl, e.id]))
    // Gone: a pulled change settled it since the outbox was read.
    const entries = found.filter((entry): entry is OutboxEntry => entry !== undefined && syncTables.has(entry.tbl))
    const rows = await readRows(database, entries)
    const outgoing: Outgoing[] = []
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
      outgoing.push({ entry, change, blob, bytes: encoder.encode(JSON.stringify(change)).byteLength + 1 })
    }
    return outgoing
  })
}

/** Splits changes into pushes of at most MAX_PUSH_CHANGES and MAX_PUSH_BYTES. A change too large on its own goes alone. */
function batches(outgoing: Outgoing[]): Outgoing[][] {
  const result: Outgoing[][] = []
  let batch: Outgoing[] = []
  let bytes = PUSH_ENVELOPE_BYTES
  for (const item of outgoing) {
    if (batch.length > 0 && (batch.length === MAX_PUSH_CHANGES || bytes + item.bytes > MAX_PUSH_BYTES)) {
      result.push(batch)
      batch = []
      bytes = PUSH_ENVELOPE_BYTES
    }
    batch.push(item)
    bytes += item.bytes
  }
  if (batch.length > 0) result.push(batch)
  return result
}

/** Pushes one batch and clears its entries. The server refuses a push too large to store (413); it then goes in halves. */
async function send(database: LernzeitDB, batch: Outgoing[]): Promise<number> {
  try {
    await push(batch.map((item) => item.change))
  } catch (error) {
    if (!(error instanceof ApiError && error.status === 413 && batch.length > 1)) throw error
    const half = Math.ceil(batch.length / 2)
    return (await send(database, batch.slice(0, half))) + (await send(database, batch.slice(half)))
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

// ---- Pull ----

/** Pulls page after page until the server has no more. Returns how many changes were written here. */
async function pullAll(database: LernzeitDB): Promise<number> {
  let cursor = ((await database.meta.get(CURSOR_KEY))?.value as string | undefined) ?? ''
  let pulled = 0
  for (;;) {
    const page = await pull(cursor)
    // A failed download throws here, before the page is applied, so the cursor stays put.
    const blobs = await downloadImages(database, page)
    pulled += await applyPage(database, page, blobs)
    // A page that did not move the cursor would only be asked for again.
    if (!page.more || page.cursor === cursor) return pulled
    cursor = page.cursor
  }
}

/** Whether a pending local edit is newer than `change`, so the change must not replace it. */
function pendingNewer(entry: OutboxEntry | undefined, change: { updatedAt: number }): boolean {
  return entry !== undefined && entry.at > change.updatedAt
}

/** The bytes of the page's live images that are not here yet. */
async function downloadImages(database: LernzeitDB, page: PullResponse): Promise<Map<string, Blob>> {
  const blobs = new Map<string, Blob>()
  for (const change of page.changes) {
    if (change.tbl !== 'images' || change.deleted) continue
    if (pendingNewer(await database.outbox.get(['images', change.id]), change)) continue
    if ((await database.images.get(change.id))?.blob) continue
    blobs.set(change.id, await getImage(change.id))
  }
  return blobs
}

/** Only what this app syncs, whose data names its own id, so a bad answer cannot touch this device's own kv rows. */
function acceptable(change: PulledChange): boolean {
  if (!syncTables.has(change.tbl) || !isSynced(change.tbl, change.id)) return false
  return change.deleted || (typeof change.data === 'object' && change.data !== null && recordId(change.tbl, change.data) === change.id)
}

/** Writes one page and its cursor in one transaction. Returns how many changes it wrote. */
function applyPage(database: LernzeitDB, page: PullResponse, blobs: Map<string, Blob>): Promise<number> {
  return applyRemote(database, async () => {
    const changes = page.changes.filter(acceptable)
    const keys = changes.map((change): [string, string] => [change.tbl, change.id])
    const entries = await database.outbox.bulkGet(keys)
    const images = await database.images.bulkGet(changes.map((change) => (change.tbl === 'images' ? change.id : '')))

    const puts = new Map<string, unknown[]>()
    const deletes = new Map<string, string[]>()
    const settled: [string, string][] = []
    const add = <T>(map: Map<string, T[]>, tbl: string, item: T) => {
      const list = map.get(tbl)
      if (list) list.push(item)
      else map.set(tbl, [item])
    }
    changes.forEach((change, i) => {
      if (pendingNewer(entries[i], change)) return
      if (change.deleted) add(deletes, change.tbl, change.id)
      else if (change.tbl === 'images') {
        const meta = change.data as ImageMeta
        const downloaded = blobs.get(change.id)
        const blob = downloaded ? new Blob([downloaded], { type: meta.type }) : images[i]?.blob
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
    ])
    return [...puts.values(), ...deletes.values()].reduce((sum, list) => sum + list.length, 0)
  })
}

// ---- One sync at a time ----

let localTail: Promise<unknown> = Promise.resolve()

/** Runs `fn` holding the sync lock: the Web Lock across tabs, or a queue in this tab where there is none. */
function withLock<T>(fn: () => Promise<T>): Promise<T> {
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
  try {
    const pushed = await pushOutbox(database)
    const pulled = await pullAll(database)
    setSyncStatus({ state: 'idle', lastSyncedAt: Date.now() })
    return { pushed, pulled }
  } catch (error) {
    setSyncStatus(statusFor(error))
    throw error
  }
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

/** Syncs now, when the browser comes online, when the tab becomes visible, 2 s after the last local change and every 60 s while visible. */
export function startSync(database: LernzeitDB = db): void {
  if (stopTriggers) return
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
