/**
 * Sync: devices push their changed records and pull everyone else's. Newest `updatedAt` wins per
 * record, a tie going to the later arrival. Deletes are tombstones (`deleted = 1`, `data = NULL`) so
 * other devices learn about them; a `records` row is never removed.
 *
 * Every push takes the next number from the owner's counter and stamps it as `seq` on each record it
 * changes. Pulling walks the records in `(seq, tbl, id)` order from a cursor, so a device that keeps
 * its cursor gets each change once, and records sharing a `seq` still page cleanly.
 *
 * A cursor past the owner's counter means the database went back in time (a D1 Time Travel restore
 * puts the counter back with the records): that device would skip the changes numbered again below
 * its cursor. So does a cursor whose own record is gone or has an older `seq` (records are never
 * removed and their `seq` only grows), which still shows once other pushes moved the counter past
 * it again. Pull then answers 409 `{ resync: true }`, and the device merges its library in again.
 */
import { Hono } from 'hono'
import {
  MAX_PULL_CHANGES,
  MAX_PUSH_BYTES,
  type PullResponse,
  type PulledChange,
  type PushResponse,
  type SyncTable,
} from '@lernzeit/core/sync'
import { requireOwner } from './auth.ts'
import { BUMP_COUNTER, ChangeError, applyChanges, validateChanges } from './changes.ts'
import type { AppEnv } from './env.ts'
import { requireJson } from './http.ts'

const CURRENT_SEQ = '(SELECT seq FROM counters WHERE owner = ?1)'

const TOMBSTONE_ALL = `UPDATE records SET data = NULL, deleted = 1, updated_at = ?2, seq = ${CURRENT_SEQ}
WHERE owner = ?1 AND deleted = 0`

/** The owner's counter and the `seq` of the record a cursor points at; either is null when missing. */
const CURSOR_CHECK = `SELECT ${CURRENT_SEQ} AS counter, (SELECT seq FROM records WHERE owner = ?1 AND tbl = ?2 AND id = ?3) AS at`

const PULL = `SELECT tbl, id, data, updated_at AS updatedAt, deleted, seq FROM records
WHERE owner = ?1 AND (seq, tbl, id) > (?2, ?3, ?4) ORDER BY seq, tbl, id LIMIT ?5`

type Cursor = [seq: number, tbl: string, id: string]
const START: Cursor = [0, '', '']

const encoder = new TextEncoder()

class BadRequest extends Error {}

/** base64url of the JSON of `[seq, tbl, id]`, without padding. */
function encodeCursor(cursor: Cursor): string {
  let binary = ''
  for (const byte of encoder.encode(JSON.stringify(cursor))) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

function decodeCursor(text: string): Cursor {
  if (text === '') return START
  const bad = new BadRequest('That cursor is not one this server handed out.')
  const base64 = text.replace(/=+$/, '')
  if (!/^[A-Za-z0-9_-]+$/.test(base64)) throw bad
  let value: unknown
  try {
    const binary = atob(base64.replaceAll('-', '+').replaceAll('_', '/'))
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
    value = JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes))
  } catch {
    throw bad
  }
  if (!Array.isArray(value) || value.length !== 3) throw bad
  const [seq, tbl, id] = value as unknown[]
  if (typeof seq !== 'number' || !Number.isSafeInteger(seq) || seq < 0 || typeof tbl !== 'string' || typeof id !== 'string') throw bad
  return [seq, tbl, id]
}

function parseLimit(text: string | undefined): number {
  if (text === undefined || text === '') return MAX_PULL_CHANGES
  if (!/^\d+$/.test(text) || Number(text) < 1) throw new BadRequest('limit must be a whole number, 1 or more.')
  return Math.min(Number(text), MAX_PULL_CHANGES)
}

export const sync = new Hono<AppEnv>()

sync.use('*', requireOwner)

sync.onError((error, c) => {
  if (error instanceof BadRequest) return c.json({ error: error.message }, 400)
  if (error instanceof ChangeError) return c.json({ error: error.message }, error.status)
  throw error
})

sync.post('/push', requireJson, async (c) => {
  const tooLarge = () => c.json({ error: `A push can be at most ${MAX_PUSH_BYTES} bytes.` }, 413)
  if (Number(c.req.header('Content-Length') ?? 0) > MAX_PUSH_BYTES) return tooLarge()
  const bytes = await c.req.arrayBuffer()
  if (bytes.byteLength > MAX_PUSH_BYTES) return tooLarge()

  let body: unknown
  try {
    body = JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    throw new BadRequest('That is not valid JSON.')
  }
  if (typeof body !== 'object' || body === null || !Array.isArray((body as { changes?: unknown }).changes)) {
    throw new BadRequest('Send { changes: [...] }.')
  }
  const changes = validateChanges((body as { changes: unknown }).changes)
  const { applied } = await applyChanges(c.env.DB, c.get('ownerId'), changes)
  return c.json({ applied } satisfies PushResponse)
})

sync.get('/pull', async (c) => {
  const given = c.req.query('cursor') ?? ''
  const [seq, tbl, id] = decodeCursor(given)
  const limit = parseLimit(c.req.query('limit'))

  const db = c.env.DB
  const owner = c.get('ownerId')
  const [check, page] = await db.batch<unknown>([db.prepare(CURSOR_CHECK).bind(owner, tbl, id), db.prepare(PULL).bind(owner, seq, tbl, id, limit + 1)])
  const { counter, at } = check.results[0] as { counter: number | null; at: number | null }
  // No counter counts as 0: nothing was pushed, so no cursor past the start is valid.
  if (seq > 0 && (seq > (counter ?? 0) || at === null || at < seq)) return c.json({ error: 'Resync needed', resync: true }, 409)
  const results = page.results as { tbl: SyncTable; id: string; data: string | null; updatedAt: number; deleted: number; seq: number }[]
  const rows = results.slice(0, limit)
  const changes: PulledChange[] = rows.map((row) => ({
    tbl: row.tbl,
    id: row.id,
    data: row.data === null ? null : JSON.parse(row.data),
    updatedAt: row.updatedAt,
    deleted: row.deleted === 1,
    seq: row.seq,
  }))
  const last = rows.at(-1)
  const cursor = last ? encodeCursor([last.seq, last.tbl, last.id]) : given
  return c.json({ changes, cursor, more: results.length > limit } satisfies PullResponse)
})

/** Starts the cloud copy over: every record becomes a tombstone and every image's bytes go. */
sync.post('/reset', requireJson, async (c) => {
  const db = c.env.DB
  const owner = c.get('ownerId')
  const at = Date.now()
  await db.batch([
    db.prepare(BUMP_COUNTER).bind(owner),
    db.prepare(TOMBSTONE_ALL).bind(owner, at),
    db.prepare('DELETE FROM blobs WHERE owner = ?1').bind(owner),
  ])
  return c.json({ at })
})
