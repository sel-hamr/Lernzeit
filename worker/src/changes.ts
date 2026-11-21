/**
 * Writing records: the one path every write takes, whether a device pushes it (`POST /api/sync/push`)
 * or the MCP server makes it. `validateChanges` checks what comes in; `applyChanges` stores it with
 * newest `updatedAt` winning per record (a tie goes to the later arrival), stamps every record it
 * changes with one new `seq` from the owner's counter, and drops the bytes of images it deleted.
 */
import {
  MAX_ID_LENGTH,
  MAX_PUSH_CHANGES,
  MAX_RECORD_BYTES,
  SYNC_TABLES,
  isSynced,
  recordId,
  type SyncChange,
  type SyncTable,
} from '@lernzeit/core/sync'

/**
 * D1 takes strings of at most 2 MB. The changes go to D1 as one JSON string in which each record's
 * data is a JSON string again, so its escapes are escaped twice and it can outgrow the body.
 */
const D1_MAX_VALUE_BYTES = 2_000_000

export const BUMP_COUNTER = 'INSERT INTO counters (owner, seq) VALUES (?1, 1) ON CONFLICT (owner) DO UPDATE SET seq = seq + 1'
const CURRENT_SEQ = '(SELECT seq FROM counters WHERE owner = ?1)'

const UPSERT_RECORDS = `INSERT INTO records (owner, tbl, id, data, updated_at, deleted, seq)
SELECT ?1, j.value ->> 'tbl', j.value ->> 'id', j.value ->> 'data', j.value ->> 'updatedAt', j.value ->> 'deleted',
       ${CURRENT_SEQ}
FROM json_each(?2) AS j WHERE true
ON CONFLICT (owner, tbl, id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at,
  deleted = excluded.deleted, seq = excluded.seq
WHERE excluded.updated_at >= records.updated_at`

/** The bytes of the images this write deleted go with them. */
const DELETE_TOMBSTONED_BLOBS = `DELETE FROM blobs WHERE owner = ?1 AND id IN (SELECT id FROM records WHERE owner = ?1 AND tbl = 'images'
  AND deleted = 1 AND seq = ${CURRENT_SEQ})`

const READ_SEQ = `SELECT ${CURRENT_SEQ} AS seq`

/** A change as statement UPSERT_RECORDS reads it from the JSON array. */
interface StoredChange {
  tbl: SyncTable
  id: string
  data: string | null
  updatedAt: number
  deleted: 0 | 1
}

const tables = new Set<string>(SYNC_TABLES)
const encoder = new TextEncoder()

/** What is wrong with a write, in words for whoever sent it. The push route answers it with `status`. */
export class ChangeError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 413 = 400,
  ) {
    super(message)
  }
}

/** The changes, checked. Throws ChangeError naming the first bad change. */
export function validateChanges(changes: unknown): SyncChange[] {
  if (!Array.isArray(changes)) throw new ChangeError('Send { changes: [...] }.')
  if (changes.length > MAX_PUSH_CHANGES) throw new ChangeError(`Push at most ${MAX_PUSH_CHANGES} changes at a time.`)
  return changes.map((change, i) => validateChange(change, i))
}

function validateChange(change: unknown, i: number): SyncChange {
  const bad = (problem: string) => new ChangeError(`Change ${i} ${problem}`)
  if (typeof change !== 'object' || change === null || Array.isArray(change)) throw bad('is not an object.')
  const { tbl, id, data, updatedAt, deleted } = change as Record<string, unknown>
  if (typeof tbl !== 'string' || !tables.has(tbl)) throw bad(`has an unknown table ${JSON.stringify(tbl)}.`)
  if (typeof id !== 'string' || id.length === 0 || id.length > MAX_ID_LENGTH) throw bad(`needs an id of 1 to ${MAX_ID_LENGTH} characters.`)
  if (!isSynced(tbl, id)) throw bad(`is the kv key "${id}", which does not sync.`)
  if (typeof updatedAt !== 'number' || !Number.isSafeInteger(updatedAt) || updatedAt < 0) {
    throw bad('needs updatedAt as a whole number of milliseconds, 0 or more.')
  }
  if (typeof deleted !== 'boolean') throw bad('needs deleted as true or false.')
  if (deleted) return { tbl: tbl as SyncTable, id, data: null, updatedAt, deleted: true }
  if (data === undefined || data === null) throw bad('needs data unless it is deleted.')
  if (typeof data !== 'object' || Array.isArray(data)) throw bad('needs data as an object.')
  const field = tbl === 'kv' ? 'key' : 'id'
  if (recordId(tbl as SyncTable, data) !== id) throw bad(`has data whose ${field} is not "${id}".`)
  if (encoder.encode(JSON.stringify(data)).byteLength > MAX_RECORD_BYTES) throw bad(`(${tbl}/${id}) is over ${MAX_RECORD_BYTES} bytes.`)
  return { tbl: tbl as SyncTable, id, data, updatedAt, deleted: false }
}

/**
 * Stores validated changes for the owner in one batch. Returns how many records changed and the
 * `seq` stamped on them (the owner's current counter when there was nothing to write).
 */
export async function applyChanges(db: D1Database, owner: string, changes: SyncChange[]): Promise<{ applied: number; seq: number }> {
  if (changes.length === 0) {
    const row = await db.prepare(READ_SEQ).bind(owner).first<{ seq: number | null }>()
    return { applied: 0, seq: row?.seq ?? 0 }
  }
  const stored: StoredChange[] = changes.map((change) => ({
    tbl: change.tbl,
    id: change.id,
    data: change.deleted ? null : JSON.stringify(change.data),
    updatedAt: change.updatedAt,
    deleted: change.deleted ? 1 : 0,
  }))
  const payload = JSON.stringify(stored)
  if (encoder.encode(payload).byteLength > D1_MAX_VALUE_BYTES) {
    throw new ChangeError('That push is too large to store at once. Push fewer changes at a time.', 413)
  }
  const [, upserted, , current] = await db.batch([
    db.prepare(BUMP_COUNTER).bind(owner),
    db.prepare(UPSERT_RECORDS).bind(owner, payload),
    db.prepare(DELETE_TOMBSTONED_BLOBS).bind(owner),
    db.prepare(READ_SEQ).bind(owner),
  ])
  return { applied: upserted.meta.changes, seq: (current.results[0] as { seq: number }).seq }
}
