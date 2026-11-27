import { SELF } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import type { Library } from '@lernzeit/core/fold'
import { recordId, type SyncTable } from '@lernzeit/core/sync'
import { applyChanges } from '../src/changes.ts'
import { hashPassword } from '../src/password.ts'

export const EMAIL = 'owner@example.com'
export const PASSWORD = 'correct horse 1'
export const FIXED_SALT = 'AAECAwQFBgcICQoLDA0ODw==' // the bytes 0..15

let nextIp = 1
/** Each sign-in comes from its own address, so the rate limit of one test never trips another. */
export function freshIp(): string {
  return `203.0.113.${nextIp++}`
}

export function login(body: unknown, ip = freshIp()): Promise<Response> {
  return SELF.fetch('https://x/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip },
    body: JSON.stringify(body),
  })
}

/** `lz_session=<value>` from a Set-Cookie header, ready to send back as a Cookie header. */
export function sessionCookie(response: Response): string {
  const header = response.headers.get('Set-Cookie') ?? ''
  const match = /lz_session=([^;]*)/.exec(header)
  if (!match) throw new Error(`no lz_session cookie in "${header}"`)
  return `lz_session=${match[1]}`
}

/** Replaces the owner (id 'owner', EMAIL, PASSWORD) and signs every browser and device out. */
export async function seedOwner(): Promise<void> {
  const stored = await hashPassword(PASSWORD, FIXED_SALT)
  await env.DB.batch([
    env.DB.prepare('DELETE FROM owner'),
    env.DB.prepare('DELETE FROM auth_tokens'),
    env.DB.prepare('INSERT INTO owner (id, email, pass_hash, pass_salt, iterations, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(
      'owner',
      EMAIL,
      stored.hash,
      stored.salt,
      stored.iterations,
      Date.now(),
    ),
  ])
}

/** Signs a device in and returns its Bearer token. */
export async function deviceToken(name = 'Pixel 8'): Promise<string> {
  const response = await login({ email: EMAIL, password: PASSWORD, device: { name } })
  if (response.status !== 200) throw new Error(`device login failed with ${response.status}`)
  return (await response.json<{ token: string }>()).token
}

/** Empties the synced data: records, blobs and the change counter. */
export async function clearSyncData(): Promise<void> {
  await env.DB.batch([env.DB.prepare('DELETE FROM records'), env.DB.prepare('DELETE FROM blobs'), env.DB.prepare('DELETE FROM counters')])
}

/** Stores `library` for `owner` as one push would, every record stamped `updatedAt`. */
export async function seedLibrary(owner: string, library: Library, updatedAt = 1): Promise<void> {
  const changes = (Object.entries(library) as [SyncTable, object[]][]).flatMap(([tbl, rows]) =>
    rows.map((row) => ({ tbl, id: recordId(tbl, row), data: row, updatedAt, deleted: false })),
  )
  await applyChanges(env.DB, owner, changes)
}

/**
 * The D1 binding, counting the queries made through it as D1 counts them against a request's
 * limit: each `batch` is one, and so is each statement run on its own (`first`, `all`, `run`, `raw`).
 */
export function countingDb(db: D1Database = env.DB): { db: D1Database; queries: () => number } {
  let queries = 0
  const counted = (statement: D1PreparedStatement): D1PreparedStatement => {
    const methods = statement as unknown as Record<string, (...args: unknown[]) => unknown>
    for (const method of ['first', 'all', 'run', 'raw']) {
      const run = methods[method].bind(statement)
      methods[method] = (...args) => {
        queries++
        return run(...args)
      }
    }
    const bind = statement.bind.bind(statement)
    statement.bind = (...values) => counted(bind(...values))
    return statement
  }
  const wrapped = {
    prepare: (sql: string) => counted(db.prepare(sql)),
    batch: (statements: D1PreparedStatement[]) => {
      queries++
      return db.batch(statements)
    },
  }
  return { db: wrapped as unknown as D1Database, queries: () => queries }
}
