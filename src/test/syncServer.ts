/*
 * The Worker's sync API in memory, for tests: push, pull, reset, images and sign-in, with the same
 * rules as worker/src/sync.ts. Newest `updatedAt` wins (a tie goes to the later arrival), each push
 * takes one `seq` for every record it changes, and pulling walks `(seq, tbl, id)` from a cursor.
 */
import {
  MAX_IMAGE_BYTES,
  MAX_PULL_CHANGES,
  MAX_PUSH_BYTES,
  MAX_PUSH_CHANGES,
  MAX_RECORD_BYTES,
  SYNC_TABLES,
  isSynced,
  type PullResponse,
  type PulledChange,
  type SyncChange,
  type SyncTable,
} from '@lernzeit/core/sync'

export interface ServerRecord {
  tbl: SyncTable
  id: string
  data: unknown | null
  updatedAt: number
  deleted: boolean
  seq: number
}

export interface TestServer {
  /** Answers the app's `/api` requests. Hand it to `setFetch`. */
  fetch: typeof fetch
  /** Every record by `tbl/id`, tombstones included. */
  records: Map<string, ServerRecord>
  /** Image bytes by id. */
  blobs: Map<string, Blob>
  /** `METHOD /path` of every request answered, in order. */
  requests: string[]
  /** The status of each answer in `requests`, in the same order. */
  statuses: number[]
  email: string
  password: string
  /** While true, every request fails as if the network were down. */
  offline: boolean
  /** The most changes one pull hands out; lower it to test paging. */
  pageSize: number
  /**
   * Runs before each request is answered, so a test can act while a request is in flight. A
   * Response it returns is the answer instead.
   */
  beforeRequest?: (method: string, path: string) => void | Response | Promise<void | Response>
  /** A reason to refuse one pushed change with 400, as the Worker refuses a change it cannot store. */
  refuseChange?: (change: SyncChange) => string | undefined
  /** Tombstones every record and drops every image, as `POST /api/sync/reset` does. */
  reset(): number
  signOut(): void
  signIn(): void
  record(tbl: SyncTable, id: string): ServerRecord | undefined
}

const tables = new Set<string>(SYNC_TABLES)
const encoder = new TextEncoder()

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const isJson = (request: Request) => (request.headers.get('Content-Type') ?? '').split(';')[0].trim().toLowerCase() === 'application/json'
const keyOf = (tbl: string, id: string) => `${tbl}/${id}`

type Cursor = [seq: number, tbl: string, id: string]

function encodeCursor(cursor: Cursor): string {
  return btoa(encodeURIComponent(JSON.stringify(cursor)))
}

function decodeCursor(text: string): Cursor {
  return text === '' ? [0, '', ''] : (JSON.parse(decodeURIComponent(atob(text))) as Cursor)
}

function after(record: ServerRecord, [seq, tbl, id]: Cursor): boolean {
  if (record.seq !== seq) return record.seq > seq
  if (record.tbl !== tbl) return record.tbl > tbl
  return record.id > id
}

function byPosition(a: ServerRecord, b: ServerRecord): number {
  if (a.seq !== b.seq) return a.seq - b.seq
  if (a.tbl !== b.tbl) return a.tbl < b.tbl ? -1 : 1
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

export function createTestServer(): TestServer {
  let seq = 0
  let signedIn = true

  const server: TestServer = {
    records: new Map(),
    blobs: new Map(),
    requests: [],
    statuses: [],
    email: 'owner@lernzeit.test',
    password: 'test-password',
    offline: false,
    pageSize: MAX_PULL_CHANGES,
    reset() {
      const at = Date.now()
      seq++
      for (const record of server.records.values()) {
        if (!record.deleted) Object.assign(record, { data: null, deleted: true, updatedAt: at, seq })
      }
      server.blobs.clear()
      return at
    },
    signOut() {
      signedIn = false
    },
    signIn() {
      signedIn = true
    },
    record(tbl, id) {
      return server.records.get(keyOf(tbl, id))
    },
    fetch: async (input, init) => {
      if (server.offline) throw new TypeError('fetch failed')
      const request = new Request(new URL(input instanceof Request ? input.url : String(input), 'http://lernzeit.test'), init)
      const url = new URL(request.url)
      server.requests.push(`${request.method} ${url.pathname}`)
      const response = (await server.beforeRequest?.(request.method, url.pathname)) || (await handle(request, url))
      server.statuses.push(response.status)
      return response
    },
  }

  async function handle(request: Request, url: URL): Promise<Response> {
    const route = `${request.method} ${url.pathname}`
    if (route === 'GET /api/auth/status') return json(signedIn ? { signedIn: true, email: server.email } : { signedIn: false })
    if (route === 'POST /api/auth/login') {
      if (!isJson(request)) return json({ error: 'Send JSON (Content-Type: application/json).' }, 415)
      const body = (await request.json()) as { email?: string; password?: string }
      if (body.email?.trim().toLowerCase() !== server.email || body.password !== server.password) return json({ error: 'Wrong email or password' }, 401)
      signedIn = true
      return json({ email: server.email })
    }
    if (route === 'POST /api/auth/logout') {
      signedIn = false
      return json({ ok: true })
    }
    if (!signedIn) return json({ error: 'Signed out' }, 401)

    if (route === 'POST /api/sync/push') {
      if (!isJson(request)) return json({ error: 'Send JSON (Content-Type: application/json).' }, 415)
      const bytes = await request.arrayBuffer()
      if (bytes.byteLength > MAX_PUSH_BYTES) return json({ error: `A push can be at most ${MAX_PUSH_BYTES} bytes.` }, 413)
      return push(JSON.parse(new TextDecoder().decode(bytes)))
    }
    if (route === 'GET /api/sync/pull') return pull(url)
    if (route === 'POST /api/sync/reset') {
      if (!isJson(request)) return json({ error: 'Send JSON (Content-Type: application/json).' }, 415)
      return json({ at: server.reset() })
    }
    const image = /^\/api\/images\/([^/]+)$/.exec(url.pathname)
    if (image && request.method === 'PUT') {
      const type = (request.headers.get('Content-Type') ?? '').split(';')[0].trim().toLowerCase()
      if (!type.startsWith('image/')) return json({ error: 'Send the image with its type, such as Content-Type: image/png.' }, 415)
      const bytes = await request.arrayBuffer()
      if (bytes.byteLength > MAX_IMAGE_BYTES) return json({ error: `An image can be at most ${MAX_IMAGE_BYTES} bytes.` }, 413)
      if (bytes.byteLength === 0) return json({ error: 'Send the image bytes.' }, 400)
      server.blobs.set(decodeURIComponent(image[1]), new Blob([bytes], { type }))
      return new Response(null, { status: 204 })
    }
    if (image && request.method === 'GET') {
      const blob = server.blobs.get(decodeURIComponent(image[1]))
      if (!blob) return json({ error: 'No such image' }, 404)
      return new Response(blob, { headers: { 'Content-Type': blob.type } })
    }
    return json({ error: 'Not found' }, 404)
  }

  function push(body: unknown): Response {
    const changes = (body as { changes?: unknown }).changes
    if (!Array.isArray(changes)) return json({ error: 'Send { changes: [...] }.' }, 400)
    if (changes.length > MAX_PUSH_CHANGES) return json({ error: `Push at most ${MAX_PUSH_CHANGES} changes at a time.` }, 400)
    for (const [i, change] of changes.entries()) {
      const { tbl, id, data, updatedAt, deleted } = change as Record<string, unknown>
      if (typeof tbl !== 'string' || !tables.has(tbl) || typeof id !== 'string' || !isSynced(tbl, id)) return json({ error: `Change ${i} is not synced.` }, 400)
      if (typeof updatedAt !== 'number' || typeof deleted !== 'boolean' || (!deleted && data == null)) return json({ error: `Change ${i} is malformed.` }, 400)
      if (!deleted && encoder.encode(JSON.stringify(data)).byteLength > MAX_RECORD_BYTES) {
        return json({ error: `Change ${i} (${tbl}/${id}) is over ${MAX_RECORD_BYTES} bytes.` }, 400)
      }
      const refused = server.refuseChange?.(change as SyncChange)
      if (refused) return json({ error: `Change ${i} (${tbl}/${id}) ${refused}` }, 400)
    }
    if (changes.length === 0) return json({ applied: 0 })
    seq++
    let applied = 0
    for (const change of changes as PulledChange[]) {
      const key = keyOf(change.tbl, change.id)
      const stored = server.records.get(key)
      if (stored && change.updatedAt < stored.updatedAt) continue
      server.records.set(key, { tbl: change.tbl, id: change.id, data: change.deleted ? null : change.data, updatedAt: change.updatedAt, deleted: change.deleted, seq })
      if (change.tbl === 'images' && change.deleted) server.blobs.delete(change.id)
      applied++
    }
    return json({ applied })
  }

  function pull(url: URL): Response {
    const given = url.searchParams.get('cursor') ?? ''
    const cursor = decodeCursor(given)
    const limit = Math.min(Number(url.searchParams.get('limit') ?? MAX_PULL_CHANGES), server.pageSize)
    const rest = [...server.records.values()].filter((record) => after(record, cursor)).sort(byPosition)
    const page = rest.slice(0, limit)
    const last = page.at(-1)
    const response: PullResponse = {
      changes: page.map((record) => ({ ...record, data: structuredClone(record.data) })),
      cursor: last ? encodeCursor([last.seq, last.tbl, last.id]) : given,
      more: rest.length > limit,
    }
    return json(response)
  }

  return server
}
