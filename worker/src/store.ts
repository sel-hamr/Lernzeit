/**
 * The owner's library in D1, as the AI tools read and write it (`LibraryStore` in core
 * library.ts, whose memory store has the same behaviour; library.contract.test-utils.ts tests both).
 *
 * Reads go to the live `records` rows with the filter compiled to SQL, so a tool reads only the
 * rows it asks for; the filters the tools use have partial indexes (migrations/0002_json_indexes.sql).
 * The reads a tool asks for together (a `Promise.all`, or a handler's reads before its first
 * await) go to D1 as one batch. The design relies on D1 counting a batch as one query against a
 * request's limit, which is 50 on the Free plan (https://developers.cloudflare.com/d1/platform/limits/),
 * so a call's query count must not grow with the number of cards it touches.
 *
 * Writes are staged, readable at once, and stored by `commit()` through `applyChanges`, the same
 * path a device's push takes: newest `updatedAt` wins, so a browser edit stamped after the tool's
 * write still wins when it is pushed.
 *
 * A store reads the owner's change counter when it opens, and `commit()` stores its writes only if
 * nothing (another tool call, a device's push) was written since: otherwise it throws BusyError
 * and stores none of them, and the call is run again on a new store (mcp/tools.ts). Without this,
 * two calls at once would each rewrite a record from what they read, and one's changes would vanish.
 */
import { checkFilter, stageWrites, type Filter, type LibraryReader, type LibraryStore } from '@lernzeit/core/library'
import { MAX_PUSH_CHANGES, SYNC_TABLES, type SyncChange, type SyncTable } from '@lernzeit/core/sync'
import { applyChanges, validateChanges } from './changes.ts'

/** A filter field goes into the SQL as a JSON path, so it must be a plain name. */
const FIELD_NAME = /^[A-Za-z][A-Za-z0-9]*$/

const tables = new Set<string>(SYNC_TABLES)

/**
 * The SQL that picks the owner's live rows of `tbl` matching `filter`, with its parameters.
 *
 * Its text is what the partial indexes of migrations/0002_json_indexes.sql match, so keep the two
 * in step: the table as a literal (`tbl = 'reviews'`, so SQLite can tell an index's `WHERE tbl =
 * 'reviews' AND deleted = 0` applies), `deleted = 0`, and each field as `json_extract(data, '$.x')`.
 *
 * Each filter value compares with the field's own JSON type: strings and numbers are bound as they
 * are and booleans as 1 and 0, which is how json_extract returns JSON true and false. `null`
 * matches a missing field too.
 */
export function whereClause(owner: string, tbl: SyncTable, filter: Filter = {}): { sql: string; params: (string | number)[] } {
  if (!tables.has(tbl)) throw new Error(`There is no table ${JSON.stringify(tbl)}.`)
  checkFilter(filter)
  const params: (string | number)[] = [owner]
  const parts = ['owner = ?1', `tbl = '${tbl}'`, 'deleted = 0']
  for (const [field, value] of Object.entries(filter)) {
    if (!FIELD_NAME.test(field)) throw new Error(`Cannot filter on the field ${JSON.stringify(field)}: use letters and digits only.`)
    const path = `json_extract(data, '$.${field}')`
    if (value === null) {
      parts.push(`${path} IS NULL`)
    } else {
      params.push(typeof value === 'boolean' ? (value ? 1 : 0) : value)
      parts.push(`${path} = ?${params.length}`)
    }
  }
  return { sql: parts.join(' AND '), params }
}

/** Runs the statements asked for in one go as one D1 batch, each caller getting its own rows. */
function batcher(db: D1Database) {
  let queue: { statement: D1PreparedStatement; resolve: (rows: unknown[]) => void; reject: (error: unknown) => void }[] = []

  async function flush() {
    const batch = queue
    queue = []
    try {
      const results = await db.batch(batch.map((q) => q.statement))
      batch.forEach((q, i) => q.resolve(results[i].results))
    } catch (error) {
      for (const q of batch) q.reject(error)
    }
  }

  return function query<T>(sql: string, params: unknown[]): Promise<T[]> {
    const statement = db.prepare(sql).bind(...params)
    return new Promise<unknown[]>((resolve, reject) => {
      if (queue.length === 0) queueMicrotask(() => void flush())
      queue.push({ statement, resolve, reject })
    }) as Promise<T[]>
  }
}

function storedReader(db: D1Database, owner: string): LibraryReader & { seq(): Promise<number> } {
  const query = batcher(db)
  const parse = <T>(rows: { data: string }[]) => rows.map((row) => JSON.parse(row.data) as T)
  return {
    async list<T>(tbl: SyncTable, filter?: Filter) {
      const where = whereClause(owner, tbl, filter)
      return parse<T>(await query<{ data: string }>(`SELECT data FROM records WHERE ${where.sql}`, where.params))
    },
    // The same WHERE as list, so the same indexes serve it; the rows' JSON is never parsed.
    async listIds(tbl: SyncTable, filter?: Filter) {
      const where = whereClause(owner, tbl, filter)
      return (await query<{ id: string }>(`SELECT id FROM records WHERE ${where.sql}`, where.params)).map((row) => row.id)
    },
    async get<T>(tbl: SyncTable, id: string) {
      const rows = await query<{ data: string }>('SELECT data FROM records WHERE owner = ?1 AND tbl = ?2 AND id = ?3 AND deleted = 0', [owner, tbl, id])
      return parse<T>(rows)[0]
    },
    async count(tbl: SyncTable, filter?: Filter) {
      const where = whereClause(owner, tbl, filter)
      const [row] = await query<{ n: number }>(`SELECT COUNT(*) AS n FROM records WHERE ${where.sql}`, where.params)
      return row.n
    },
    /** The owner's change counter, 0 before the first write. */
    async seq() {
      const [row] = await query<{ seq: number | null }>('SELECT (SELECT seq FROM counters WHERE owner = ?1) AS seq', [owner])
      return row.seq ?? 0
    },
  }
}

/** The zone, when Intl knows it. */
function knownTimeZone(zone: unknown): string | undefined {
  if (typeof zone !== 'string' || zone === '') return undefined
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone })
    return zone
  } catch {
    return undefined
  }
}

/**
 * The owner's library in D1, for one tool call. Its `timeZone` is the synced `kv/timeZone`, or
 * the `timeZone` in `kv/settings` (where devices on an older build saved it), or UTC when there is
 * none Intl knows.
 *
 * Make one store per call, as `runAction` expects, and do not reuse it: `commit()` takes the staged
 * writes off the store before it writes them, so when it throws they are gone rather than left for
 * a later commit to store half a failed call. `commit()` stamps every change with `now()`, the
 * server's clock (`now` is there for tests), and writes nothing when nothing is staged. It throws
 * BusyError, having stored nothing, when the owner's counter moved since the store was made.
 */
export async function createD1Store(db: D1Database, owner: string, options: { now?: () => number } = {}): Promise<LibraryStore> {
  const stored = storedReader(db, owner)
  // One batch: the counter, then the zone records, so every read of the call comes after the counter's.
  const [seq, zone, settings] = await Promise.all([
    stored.seq(),
    stored.get<{ value?: unknown }>('kv', 'timeZone'),
    stored.get<{ value?: { timeZone?: unknown } | null }>('kv', 'settings'),
  ])
  const timeZone = knownTimeZone(zone?.value) ?? knownTimeZone(settings?.value?.timeZone) ?? 'UTC'
  const staging = stageWrites(stored)
  const now = options.now ?? (() => Date.now())

  return {
    list: staging.list,
    listIds: staging.listIds,
    get: staging.get,
    count: staging.count,
    put: staging.put,
    remove: staging.remove,
    async commit() {
      const staged = staging.changes()
      staging.clear()
      if (staged.length === 0) return
      const updatedAt = now()
      const changes: SyncChange[] = staged.map(({ tbl, id, data }) => ({ tbl, id, data, updatedAt, deleted: data === null }))
      // A push's rules for each record (its id, its size). A tool call may write more records than one push may carry.
      for (let i = 0; i < changes.length; i += MAX_PUSH_CHANGES) validateChanges(changes.slice(i, i + MAX_PUSH_CHANGES))
      await applyChanges(db, owner, changes, { expectSeq: seq })
    },
    timeZone,
    now,
  }
}
