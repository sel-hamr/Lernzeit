/*
 * The cloud and phones for the sync tests. The cloud is the web's in-memory Worker
 * (src/test/syncServer.ts, imported as it is: it needs only fetch's Request/Response/Blob, which
 * Jest's environment has) with the device tokens the Worker gives a phone: login hands out a token,
 * every other call needs it as `Authorization: Bearer`, and a revoked token is answered 401. A
 * phone is the real library on node:sqlite, the real API client and account service over that
 * cloud's fetch, files in memory, and a sync engine.
 */
import type { SyncChange, SyncTable } from '@lernzeit/core/sync'
import { createTestServer, type TestServer } from '../../../src/test/syncServer'
import { ACCOUNT_KEY, createAccountService } from '../../src/account'
import { createApi } from '../../src/api'
import type { SqlAdapter } from '../../src/store/adapter'
import { createLocalLibrary, type LocalLibrary } from '../../src/store/library'
import { createSyncEngine } from '../../src/sync/engine'
import { deleteImageFiles } from '../../src/sync/imageFiles'
import { createMemoryFiles, type MemoryFiles } from './memoryFiles'
import { nodeSqliteAdapter } from '../store/nodeSqlite'

export const BASE_URL = 'https://cloud.test'

export interface Cloud {
  server: TestServer
  fetch: typeof fetch
  /** A new valid device token, as a sign-in on another phone would get. */
  issue(): string
  /** Removes every device (Settings → devices on the web): their next call is answered 401. */
  revokeAll(): void
  /** Pushes `changes` as another device would. */
  push(changes: SyncChange[]): Promise<void>
  /** Puts an image's bytes on the cloud, as another device's upload. */
  putImage(id: string, bytes: Uint8Array, type?: string): Promise<void>
  /** The record's data on the cloud, undefined when it has none or a tombstone. */
  data(tbl: SyncTable, id: string): unknown
  /** How many requests of `METHOD /path` (a path prefix) the cloud answered. */
  count(route: string): number
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

export function createCloud(): Cloud {
  const server = createTestServer()
  const tokens = new Set<string>()
  let issued = 0
  const issue = () => {
    const token = `device-token-${++issued}`
    tokens.add(token)
    return token
  }

  const cloudFetch: typeof fetch = async (input, init) => {
    const request = new Request(input instanceof Request ? input.url : String(input), init)
    const path = new URL(request.url).pathname
    if (path === '/api/auth/login') {
      const response = await server.fetch(input, init)
      if (!response.ok) return response
      const { email } = (await response.json()) as { email: string }
      return json({ email, token: issue() })
    }
    const bearer = /^Bearer (.+)$/.exec(request.headers.get('Authorization') ?? '')?.[1]
    if (!bearer || !tokens.has(bearer)) {
      if (server.offline) throw new TypeError('fetch failed')
      server.requests.push(`${request.method} ${path}`)
      server.statuses.push(401)
      return json({ error: 'Signed out' }, 401)
    }
    if (path === '/api/auth/logout') {
      tokens.delete(bearer)
      return json({ ok: true })
    }
    return server.fetch(input, init)
  }

  const owner = issue()
  const call = async (path: string, init: RequestInit) => {
    const response = await cloudFetch(`${BASE_URL}/api${path}`, { ...init, headers: { ...(init.headers as object), Authorization: `Bearer ${owner}` } })
    if (!response.ok) throw new Error(`The cloud answered ${response.status}: ${await response.text()}`)
  }

  return {
    server,
    fetch: cloudFetch,
    issue,
    revokeAll: () => tokens.clear(),
    push: (changes) => call('/sync/push', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ changes }) }),
    putImage: (id, bytes, type = 'image/png') => call(`/images/${encodeURIComponent(id)}`, { method: 'PUT', headers: { 'Content-Type': type }, body: bytes as BodyInit }),
    data(tbl, id) {
      const record = server.record(tbl, id)
      return record && !record.deleted ? record.data : undefined
    },
    count: (route) => server.requests.filter((request) => request.startsWith(route)).length,
  }
}

export interface PhoneOptions {
  /** The database of an earlier start of the same phone. */
  sql?: SqlAdapter
  files?: MemoryFiles
  /** The token of an earlier start; a new one is issued otherwise. Null: not signed in. */
  token?: string | null
  /** Wraps the library the engine works on, to fail it at a chosen moment. */
  wrap?: (library: LocalLibrary) => LocalLibrary
  now?: () => number
  /** The phone's time zone; none by default, so tests see only their own writes in the outbox. */
  timeZone?: () => string | undefined
}

export interface Phone {
  sql: SqlAdapter
  files: MemoryFiles
  library: LocalLibrary
  account: ReturnType<typeof createAccountService>
  engine: ReturnType<typeof createSyncEngine>
  token(): string | null
  /** The app starting again on the same database, files and token: a new engine. */
  restart(options?: Pick<PhoneOptions, 'wrap' | 'timeZone'>): Phone
}

/** A phone signed in to `cloud` (unless `token` is null). */
export function createPhone(cloud: Cloud, options: PhoneOptions = {}): Phone {
  const sql = options.sql ?? nodeSqliteAdapter()
  const files = options.files ?? createMemoryFiles()
  let token = options.token === undefined ? cloud.issue() : options.token
  const tokens = { get: async () => token, set: async (t: string) => void (token = t), clear: async () => void (token = null) }
  const library = createLocalLibrary(sql, { now: options.now, onImageFilesRemoved: (removed) => void deleteImageFiles(files, removed) })
  if (token && library.getMeta(ACCOUNT_KEY) === undefined) library.setMeta(ACCOUNT_KEY, { email: cloud.server.email })
  const api = createApi({ baseUrl: BASE_URL, getToken: tokens.get, onSignedOut: (sent) => void account.signedOut(sent), fetch: cloud.fetch })
  const account = createAccountService({ library, api, tokens, deleteImageFiles: (removed) => deleteImageFiles(files, removed) })
  const engine = createSyncEngine({ library: options.wrap ? options.wrap(library) : library, api, files, timeZone: options.timeZone ?? (() => undefined) })
  return {
    sql,
    files,
    library,
    account,
    engine,
    token: () => token,
    restart: (again = {}) => createPhone(cloud, { sql, files, token, now: options.now, timeZone: options.timeZone, ...again }),
  }
}

/** Lets the promise callbacks queued so far run (the account service's async 401 handling). */
export const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

/** An image written on this phone: its bytes in a file, the file row, and the synced record. */
export async function addImage(phone: Phone, id: string, bytes: Uint8Array, type = 'image/png') {
  const path = phone.files.pathFor(id)
  await phone.files.write(path, bytes)
  phone.library.write(() => {
    phone.library.putImageFile({ id, path, type, width: 4, height: 3, fit: 'cover' })
    phone.library.put('images', { id, width: 4, height: 3, fit: 'cover', type })
  })
}
