/**
 * Writing records: the one path every write takes, whether a device pushes it (`POST /api/sync/push`)
 * or the MCP server makes it. `validateChanges` checks what comes in; `applyChanges` stores it with
 * newest `updatedAt` winning per record (a tie goes to the later arrival), stamps every record it
 * changes with one new `seq` from the owner's counter, and drops the bytes of images it deleted.
 *
 * A tool call writes only if nothing else wrote since it started (`expectSeq`): D1 gives a call no
 * isolation, and an action rewrites whole records it read (a grammar topic with its exercises), so
 * two calls at once would otherwise lose one's work.
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

/**
 * BUMP_COUNTER for a write that expects the counter at ?2: anything else sets it to NULL, which
 * counters.seq refuses, so the batch fails and D1 rolls all of it back. With ?2 = 0 (an owner
 * nothing was written for) any row at all is a later write. When the counter row is missing while
 * a seq is expected, the records' NOT NULL seq refuses the write the same way.
 */
const BUMP_COUNTER_FROM_NOTHING = 'INSERT INTO counters (owner, seq) VALUES (?1, 1) ON CONFLICT (owner) DO UPDATE SET seq = NULL'
const BUMP_COUNTER_FROM = 'UPDATE counters SET seq = CASE WHEN seq = ?2 THEN seq + 1 ELSE NULL END WHERE owner = ?1'
const MOVED_ON = /NOT NULL constraint failed: (counters|records)\.seq/

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

/** Something else wrote for the owner after `expectSeq`, so nothing of this write was stored. */
export class BusyError extends Error {
  constructor() {
    super('The library changed while the call ran.')
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
 *
 * With `expectSeq` (the owner's counter when the caller read the library, 0 for none), it stores
 * them only if the counter is still there, and otherwise throws BusyError having stored nothing.
 * A device's push leaves it out: newest `updatedAt` wins per record.
 */
export async function applyChanges(
  db: D1Database,
  owner: string,
  changes: SyncChange[],
  options: { expectSeq?: number } = {},
): Promise<{ applied: number; seq: number }> {
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
  const { expectSeq } = options
  const bump =
    expectSeq === undefined
      ? db.prepare(BUMP_COUNTER).bind(owner)
      : expectSeq === 0
        ? db.prepare(BUMP_COUNTER_FROM_NOTHING).bind(owner)
        : db.prepare(BUMP_COUNTER_FROM).bind(owner, expectSeq)
  let results: D1Result[]
  try {
    results = await db.batch([bump, db.prepare(UPSERT_RECORDS).bind(owner, payload), db.prepare(DELETE_TOMBSTONED_BLOBS).bind(owner), db.prepare(READ_SEQ).bind(owner)])
  } catch (error) {
    if (expectSeq !== undefined) {
      if (error instanceof Error && MOVED_ON.test(error.message)) throw new BusyError()
      // D1 may word the refusal differently: whatever failed, a moved counter means someone else wrote first.
      // A failure that did commit (a timeout, say) shows a moved counter and is retried as busy: the safe direction.
      // If the re-read fails too, the batch's own error is the root cause and is the one thrown.
      let current: number | undefined
      try {
        current = (await db.prepare(READ_SEQ).bind(owner).first<{ seq: number | null }>())?.seq ?? 0
      } catch {
        throw error
      }
      if (current !== expectSeq) throw new BusyError()
    }
    throw error
  }
  const [, upserted, , current] = results
  return { applied: upserted.meta.changes, seq: (current.results[0] as { seq: number }).seq }
}
