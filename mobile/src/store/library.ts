/*
 * The phone's library: synced records in SQLite (db.ts), read and written as the JSON the cloud
 * syncs, with the outbox the sync engine pushes from.
 *
 * Like the web (src/sync/outbox.ts), every local write to a synced record records an outbox entry
 * `{ tbl, id, at }` in the same transaction: the push sends the record as it is then, and a record
 * that is gone as a tombstone. `at` comes from `nextAt`, so it always moves forward and a write
 * during a push in flight is never acknowledged away. kv rows are recorded only for the synced keys;
 * the others stay on this phone. Writes inside `applyRemote` (the changes a pull brings) are not
 * recorded, or every pulled change would be pushed straight back.
 *
 * Every call is synchronous (see adapter.ts). A write outside `write`/`applyRemote` is its own
 * transaction; inside, they share one. After each committed transaction the subscribers of the
 * tables it wrote hear of it once (bus.ts).
 */
import { checkFilter, type Filter } from '@lernzeit/core/library'
import { isSynced, recordId, type SyncChange, type SyncTable } from '@lernzeit/core/sync'
import { nextAt } from '@lernzeit/core/syncRules'
import type { ImageFit } from '@lernzeit/core/types'
import type { SqlAdapter, SqlValue } from './adapter'
import { createChangeBus, type ChangeListener, type LiveTable } from './bus'
import { migrate } from './db'

export type { ChangeEvent, ChangeListener, LiveTable } from './bus'

/** A record changed on this phone and not yet in the cloud. */
export interface OutboxEntry {
  tbl: SyncTable
  id: string
  /** The time of its latest write, always later than the one before. */
  at: number
  /** Why the cloud refused it, while it is parked: the push skips it until it is written again or unparked. */
  stuck?: string
}

/** Where an image's file is on this phone, and what showing it needs. */
export interface ImageFile {
  id: string
  /** The file's URI, e.g. under expo-file-system's document directory. */
  path: string
  type: string
  width: number
  height: number
  fit: ImageFit
}

/** The writes only a pull makes, inside `applyRemote`. */
export interface RemoteWriter {
  /** Stores a pulled change as it came, `updatedAt` its record time; a deleted one removes the record. Never recorded. */
  apply(change: SyncChange): void
}

export interface LocalLibrary {
  /** A copy of the record, undefined when there is none. */
  get<T = Record<string, unknown>>(tbl: SyncTable, id: string): T | undefined
  /** Copies of the records matching `filter` (see core's `Filter`), in no particular order. */
  list<T = Record<string, unknown>>(tbl: SyncTable, filter?: Filter): T[]
  /** The ids (a kv row's key) of the records `list` would return. */
  listIds(tbl: SyncTable, filter?: Filter): string[]
  count(tbl: SyncTable, filter?: Filter): number
  /** The record's time: the cloud's `updatedAt` for a pulled one, the outbox stamp for a local write. */
  updatedAt(tbl: SyncTable, id: string): number | undefined

  /** Stores a copy of `row` (undefined fields left out) and records it in the outbox. */
  put(tbl: SyncTable, row: object): void
  /** Deletes the record and records it in the outbox, so the push sends a tombstone. */
  remove(tbl: SyncTable, id: string): void
  /** Runs `fn`'s writes in one transaction with one change event; a throw undoes them all. `fn` must be synchronous. */
  write<T>(fn: () => T): T
  /**
   * Runs `fn` in one transaction whose writes are not recorded in the outbox: the changes a pull
   * brings, with the outbox entries they settle and the cursor. `fn` must be synchronous; fetch
   * what it needs first. Plain `put`/`remove` calls inside are not recorded either.
   */
  applyRemote<T>(fn: (remote: RemoteWriter) => T): T

  /** The outbox, oldest write first. */
  outbox(): OutboxEntry[]
  outboxEntry(tbl: SyncTable, id: string): OutboxEntry | undefined
  outboxSize(): number
  /** Removes the pushed entries, except those written again since they were read: their `at` moved on. */
  acknowledge(pushed: readonly OutboxEntry[]): void
  /** Marks refused entries stuck with the reason, unless written again since they were read. */
  park(refused: readonly { entry: OutboxEntry; reason: string }[]): void
  /** Takes every parked mark off, so each refused change goes up once more. */
  unpark(): void
  removeOutboxEntry(tbl: SyncTable, id: string): void

  /** This device's own values (the pull cursor, say), stored as JSON. */
  getMeta<T = unknown>(key: string): T | undefined
  /** Stores `value` as JSON; undefined removes the key. */
  setMeta(key: string, value: unknown): void
  removeMeta(key: string): void

  imageFile(id: string): ImageFile | undefined
  imageFiles(): ImageFile[]
  putImageFile(file: ImageFile): void
  removeImageFile(id: string): void

  /** Calls `listener` after each committed transaction that wrote one of `tables`. Returns an unsubscribe. */
  subscribe(tables: readonly LiveTable[], listener: ChangeListener): () => void
  /** Grows with every committed write to one of `tables` (see bus.ts). */
  version(tables: readonly LiveTable[]): number
  /** The clock outbox stamps come from. */
  readonly now: () => number
}

export interface LocalLibraryOptions {
  now?: () => number
}

/** A filter field goes into the SQL as a JSON path, so it must be a plain name. */
const FIELD_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/

/**
 * The SQL that picks the records of `tbl` matching `filter`. Each value compares with the field's
 * own JSON type, as core's memory store does: `1` does not match `true` or `"1"`. `null` matches a
 * missing field too.
 */
function whereClause(tbl: SyncTable, filter?: Filter): { sql: string; params: SqlValue[] } {
  checkFilter(filter)
  const parts = ['tbl = ?']
  const params: SqlValue[] = [tbl]
  for (const [field, value] of Object.entries(filter ?? {})) {
    if (!FIELD_NAME.test(field)) throw new Error(`Cannot filter on the field ${JSON.stringify(field)}: use letters, digits and _ only.`)
    const path = `'$.${field}'`
    if (value === null) parts.push(`json_extract(data, ${path}) IS NULL`)
    else if (typeof value === 'boolean') parts.push(`json_type(data, ${path}) = '${value}'`)
    else {
      const types = typeof value === 'number' ? `IN ('integer', 'real')` : `= 'text'`
      parts.push(`json_type(data, ${path}) ${types} AND json_extract(data, ${path}) = ?`)
      params.push(value)
    }
  }
  return { sql: parts.join(' AND '), params }
}

const copy = (row: object): Record<string, unknown> => JSON.parse(JSON.stringify(row)) as Record<string, unknown>

function checkSynchronous(result: unknown): void {
  if (typeof (result as { then?: unknown } | null)?.then === 'function') {
    throw new Error('A local store transaction must be synchronous: do the async work (fetches, files) before it.')
  }
}

interface OutboxRow {
  tbl: SyncTable
  id: string
  at: number
  stuck: string | null
}
const entry = ({ tbl, id, at, stuck }: OutboxRow): OutboxEntry => (stuck === null ? { tbl, id, at } : { tbl, id, at, stuck })

/** Opens the library on `sql`, creating its tables the first time. Open one per database. */
export function createLocalLibrary(sql: SqlAdapter, options: LocalLibraryOptions = {}): LocalLibrary {
  migrate(sql)
  const now = options.now ?? (() => Date.now())
  const bus = createChangeBus()

  /** Open transactions, outermost first; nested ones are savepoints. */
  let depth = 0
  /** Inside applyRemote: writes are not recorded. */
  let remote = false
  /** What the open transaction wrote, told to the subscribers once it commits. */
  let pending = { tables: new Set<LiveTable>(), local: false }

  function transaction<T>(fn: () => T): T {
    if (depth === 0) {
      pending = { tables: new Set(), local: false }
      depth++
      let result: T
      try {
        result = sql.transaction(() => {
          const value = fn()
          checkSynchronous(value)
          return value
        })
      } finally {
        depth--
      }
      const event = pending
      pending = { tables: new Set(), local: false }
      if (event.tables.size > 0) bus.emit(event)
      return result
    }
    // A nested write: a savepoint, so a throw the caller catches undoes only its own writes.
    const savepoint = `nested_${depth}`
    sql.exec(`SAVEPOINT ${savepoint}`)
    depth++
    try {
      const value = fn()
      checkSynchronous(value)
      sql.exec(`RELEASE ${savepoint}`)
      return value
    } catch (error) {
      sql.exec(`ROLLBACK TO ${savepoint}`)
      sql.exec(`RELEASE ${savepoint}`)
      throw error
    } finally {
      depth--
    }
  }

  /** The store's own few-statement writes: a transaction of their own, or part of the open one. */
  const atomic = <T>(fn: () => T): T => (depth > 0 ? fn() : transaction(fn))

  const touch = (table: LiveTable) => pending.tables.add(table)

  function outboxEntry(tbl: SyncTable, id: string): OutboxEntry | undefined {
    const row = sql.get<OutboxRow>('SELECT tbl, id, at, stuck FROM outbox WHERE tbl = ? AND id = ?', [tbl, id])
    return row && entry(row)
  }

  /** Records a local write in the outbox and returns its stamp; undefined when the record does not sync. */
  function record(tbl: SyncTable, id: string): number | undefined {
    if (remote || !isSynced(tbl, id)) return undefined
    const at = nextAt(outboxEntry(tbl, id)?.at, now())
    // A rewrite also takes off a parked mark: the changed record gets its own try.
    sql.run('INSERT INTO outbox (tbl, id, at, stuck) VALUES (?, ?, ?, NULL) ON CONFLICT (tbl, id) DO UPDATE SET at = excluded.at, stuck = NULL', [tbl, id, at])
    touch('outbox')
    pending.local = true
    return at
  }

  function store(tbl: SyncTable, id: string, data: unknown, updatedAt: number) {
    sql.run(
      'INSERT INTO records (tbl, id, data, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT (tbl, id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at',
      [tbl, id, JSON.stringify(data), updatedAt],
    )
    touch(tbl)
  }

  function erase(tbl: SyncTable, id: string) {
    sql.run('DELETE FROM records WHERE tbl = ? AND id = ?', [tbl, id])
    touch(tbl)
  }

  const remoteWriter: RemoteWriter = {
    apply(change) {
      atomic(() => (change.deleted ? erase(change.tbl, change.id) : store(change.tbl, change.id, change.data, change.updatedAt)))
    },
  }

  const parse = <T>(rows: { data: string }[]) => rows.map((row) => JSON.parse(row.data) as T)

  return {
    get<T>(tbl: SyncTable, id: string) {
      const row = sql.get<{ data: string }>('SELECT data FROM records WHERE tbl = ? AND id = ?', [tbl, id])
      return row ? (JSON.parse(row.data) as T) : undefined
    },
    list<T>(tbl: SyncTable, filter?: Filter) {
      const where = whereClause(tbl, filter)
      return parse<T>(sql.all<{ data: string }>(`SELECT data FROM records WHERE ${where.sql}`, where.params))
    },
    listIds(tbl, filter) {
      const where = whereClause(tbl, filter)
      return sql.all<{ id: string }>(`SELECT id FROM records WHERE ${where.sql}`, where.params).map((row) => row.id)
    },
    count(tbl, filter) {
      const where = whereClause(tbl, filter)
      return sql.get<{ n: number }>(`SELECT COUNT(*) AS n FROM records WHERE ${where.sql}`, where.params)?.n ?? 0
    },
    updatedAt(tbl, id) {
      return sql.get<{ updated_at: number }>('SELECT updated_at FROM records WHERE tbl = ? AND id = ?', [tbl, id])?.updated_at
    },

    put(tbl, row) {
      const data = copy(row)
      const id = recordId(tbl, data)
      if (typeof id !== 'string' || id === '') throw new Error(`A ${tbl} row needs its ${tbl === 'kv' ? 'key' : 'id'} to be stored.`)
      atomic(() => {
        const at = record(tbl, id)
        store(tbl, id, data, at ?? now())
      })
    },
    remove(tbl, id) {
      atomic(() => {
        erase(tbl, id)
        record(tbl, id)
      })
    },
    write: transaction,
    applyRemote<T>(fn: (remote: RemoteWriter) => T): T {
      return transaction(() => {
        const outer = remote
        remote = true
        try {
          return fn(remoteWriter)
        } finally {
          remote = outer
        }
      })
    },

    outbox() {
      return sql.all<OutboxRow>('SELECT tbl, id, at, stuck FROM outbox ORDER BY at, tbl, id').map(entry)
    },
    outboxEntry,
    outboxSize() {
      return sql.get<{ n: number }>('SELECT COUNT(*) AS n FROM outbox')?.n ?? 0
    },
    acknowledge(pushed) {
      if (pushed.length === 0) return
      atomic(() => {
        for (const { tbl, id, at } of pushed) sql.run('DELETE FROM outbox WHERE tbl = ? AND id = ? AND at = ?', [tbl, id, at])
        touch('outbox')
      })
    },
    park(refused) {
      if (refused.length === 0) return
      atomic(() => {
        for (const { entry, reason } of refused) {
          sql.run('UPDATE outbox SET stuck = ? WHERE tbl = ? AND id = ? AND at = ?', [reason, entry.tbl, entry.id, entry.at])
        }
        touch('outbox')
      })
    },
    unpark() {
      atomic(() => {
        sql.run('UPDATE outbox SET stuck = NULL WHERE stuck IS NOT NULL')
        touch('outbox')
      })
    },
    removeOutboxEntry(tbl, id) {
      atomic(() => {
        sql.run('DELETE FROM outbox WHERE tbl = ? AND id = ?', [tbl, id])
        touch('outbox')
      })
    },

    getMeta<T>(key: string) {
      const row = sql.get<{ value: string }>('SELECT value FROM meta WHERE key = ?', [key])
      return row ? (JSON.parse(row.value) as T) : undefined
    },
    setMeta(key, value) {
      const json = JSON.stringify(value)
      atomic(() => {
        if (json === undefined) sql.run('DELETE FROM meta WHERE key = ?', [key])
        else sql.run('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value', [key, json])
        touch('meta')
      })
    },
    removeMeta(key) {
      atomic(() => {
        sql.run('DELETE FROM meta WHERE key = ?', [key])
        touch('meta')
      })
    },

    imageFile(id) {
      return sql.get<ImageFile>('SELECT id, path, type, width, height, fit FROM images WHERE id = ?', [id])
    },
    imageFiles() {
      return sql.all<ImageFile>('SELECT id, path, type, width, height, fit FROM images ORDER BY id')
    },
    putImageFile({ id, path, type, width, height, fit }) {
      atomic(() => {
        sql.run(
          'INSERT INTO images (id, path, type, width, height, fit) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO UPDATE SET path = excluded.path, type = excluded.type, width = excluded.width, height = excluded.height, fit = excluded.fit',
          [id, path, type, width, height, fit],
        )
        touch('imageFiles')
      })
    },
    removeImageFile(id) {
      atomic(() => {
        sql.run('DELETE FROM images WHERE id = ?', [id])
        touch('imageFiles')
      })
    },

    subscribe: bus.subscribe,
    version: bus.version,
    now,
  }
}
