import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LernzeitDB } from '@/db/db'
import type { Card, Doc } from '@lernzeit/core/types'
import { createTestServer, type TestServer } from '@/test/syncServer'
import { OfflineError, SignedOutError, setFetch } from './api'
import { startSync, stopSync, syncNow } from './engine'
import { getSyncStatus } from './status'

let server: TestServer
let a: LernzeitDB
let b: LernzeitDB
let counter = 0

const card = (id: string, german = 'Hund'): Card => ({ id, deckId: 'd1', type: 'word', english: 'dog', german, createdAt: 1 }) as Card
const cursorOf = async (database: LernzeitDB) => (await database.meta.get('cursor'))?.value

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(1_000)
  server = createTestServer()
  setFetch(server.fetch)
  a = new LernzeitDB(`engine-a-${counter}`)
  b = new LernzeitDB(`engine-b-${counter++}`)
})

afterEach(async () => {
  stopSync()
  vi.unstubAllGlobals()
  vi.useRealTimers()
  setFetch()
  await Promise.all([a.delete(), b.delete()])
})

describe('syncNow', () => {
  it('a local card reaches the server and a second database pulls it', async () => {
    await a.cards.put(card('c1'))
    expect(await syncNow(a)).toEqual({ pushed: 1, pulled: 1 })
    expect(server.record('cards', 'c1')).toMatchObject({ data: card('c1'), updatedAt: 1_000, deleted: false })
    expect(await a.outbox.count()).toBe(0)

    expect(await syncNow(b)).toEqual({ pushed: 0, pulled: 1 })
    expect(await b.cards.get('c1')).toEqual(card('c1'))
    // What was pulled is not pushed back.
    expect(await b.outbox.count()).toBe(0)
    expect(getSyncStatus()).toMatchObject({ state: 'idle', lastSyncedAt: 1_000 })
  })

  it('a delete reaches the other database', async () => {
    await a.cards.put(card('c1'))
    await syncNow(a)
    await syncNow(b)
    vi.setSystemTime(2_000)
    await a.cards.delete('c1')
    await syncNow(a)
    expect(server.record('cards', 'c1')).toMatchObject({ data: null, deleted: true, updatedAt: 2_000 })
    await syncNow(b)
    expect(await b.cards.get('c1')).toBeUndefined()
    expect(await b.outbox.count()).toBe(0)
  })

  it('an edit made during an in-flight push stays in the outbox and is pushed next', async () => {
    await a.cards.put(card('c1', 'Hund'))
    server.beforeRequest = async (method, path) => {
      if (method !== 'POST' || path !== '/api/sync/push') return
      server.beforeRequest = undefined
      vi.setSystemTime(2_000)
      await a.cards.put(card('c1', 'Katze'))
    }
    await syncNow(a)
    // The push carried the first version; the edit stays, and the echo of the push did not undo it.
    expect(server.record('cards', 'c1')).toMatchObject({ data: card('c1', 'Hund'), updatedAt: 1_000 })
    expect(await a.outbox.toArray()).toEqual([{ tbl: 'cards', id: 'c1', at: 2_000 }])
    expect((await a.cards.get('c1'))?.german).toBe('Katze')

    await syncNow(a)
    expect(server.record('cards', 'c1')).toMatchObject({ data: card('c1', 'Katze'), updatedAt: 2_000 })
    expect(await a.outbox.count()).toBe(0)
    await syncNow(b)
    expect((await b.cards.get('c1'))?.german).toBe('Katze')
  })

  it('a pulled change older than a pending local edit is skipped, and the local edit wins on the server', async () => {
    await a.cards.put(card('c1', 'Hund'))
    await syncNow(a)
    await syncNow(b)

    vi.setSystemTime(2_000)
    await a.cards.put(card('c1', 'Katze'))
    await syncNow(a)

    // B edits the card while its own sync is under way, after A's older edit reached the server.
    vi.setSystemTime(2_500)
    await b.cards.put(card('c2'))
    server.beforeRequest = async (method, path) => {
      if (method !== 'POST' || path !== '/api/sync/push') return
      server.beforeRequest = undefined
      vi.setSystemTime(3_000)
      await b.cards.put(card('c1', 'Maus'))
    }
    await syncNow(b)
    expect((await b.cards.get('c1'))?.german).toBe('Maus')
    expect(await b.outbox.get(['cards', 'c1'])).toEqual({ tbl: 'cards', id: 'c1', at: 3_000 })

    await syncNow(b)
    expect(server.record('cards', 'c1')).toMatchObject({ data: card('c1', 'Maus'), updatedAt: 3_000 })
    await syncNow(a)
    expect((await a.cards.get('c1'))?.german).toBe('Maus')
  })

  it('a pending local edit older than a pulled change gives way on both sides', async () => {
    await a.cards.put(card('c1', 'Hund'))
    await syncNow(a)
    await syncNow(b)
    vi.setSystemTime(1_500)
    await b.cards.put(card('c1', 'Maus'))
    vi.setSystemTime(2_000)
    await a.cards.put(card('c1', 'Katze'))
    await syncNow(a)

    await syncNow(b)
    expect(server.record('cards', 'c1')).toMatchObject({ data: card('c1', 'Katze'), updatedAt: 2_000 })
    expect((await b.cards.get('c1'))?.german).toBe('Katze')
    expect(await b.outbox.count()).toBe(0)
  })

  it('an image is uploaded before its record and downloaded before it is applied', async () => {
    await a.images.put({ id: 'i1', blob: new Blob(['png bytes'], { type: 'image/png' }), width: 40, height: 30, fit: 'cover' })
    await syncNow(a)
    expect(server.requests.indexOf('PUT /api/images/i1')).toBeGreaterThanOrEqual(0)
    expect(server.requests.indexOf('PUT /api/images/i1')).toBeLessThan(server.requests.indexOf('POST /api/sync/push'))
    expect(server.record('images', 'i1')?.data).toEqual({ id: 'i1', width: 40, height: 30, fit: 'cover', type: 'image/png' })
    // A already has the bytes, so the echo of its push downloads nothing.
    expect(server.requests).not.toContain('GET /api/images/i1')

    await syncNow(b)
    expect(server.requests.filter((r) => r === 'GET /api/images/i1')).toHaveLength(1)
    const image = await b.images.get('i1')
    expect(image).toMatchObject({ id: 'i1', width: 40, height: 30, fit: 'cover' })
    expect(image?.blob.type).toBe('image/png')
    expect(await image?.blob.text()).toBe('png bytes')
  })

  it('a failed image download leaves the cursor unchanged', async () => {
    await a.cards.put(card('c0'))
    await syncNow(a)
    await syncNow(b)
    const cursor = await cursorOf(b)
    expect(cursor).toBeTruthy()

    await a.images.put({ id: 'i1', blob: new Blob(['png bytes'], { type: 'image/png' }), width: 40, height: 30, fit: 'cover' })
    await a.cards.put(card('c1'))
    await syncNow(a)
    const bytes = server.blobs.get('i1')!
    server.blobs.delete('i1')

    await expect(syncNow(b)).rejects.toThrow()
    expect(await cursorOf(b)).toBe(cursor)
    expect(await b.images.get('i1')).toBeUndefined()
    expect(await b.cards.get('c1')).toBeUndefined()
    expect(getSyncStatus().state).toBe('error')

    server.blobs.set('i1', bytes)
    expect(await syncNow(b)).toMatchObject({ pulled: 2 })
    expect(await b.images.get('i1')).toBeDefined()
    expect(await b.cards.get('c1')).toBeDefined()
  })

  it('401 sets the status to signedOut', async () => {
    server.signOut()
    await a.cards.put(card('c1'))
    await expect(syncNow(a)).rejects.toBeInstanceOf(SignedOutError)
    expect(getSyncStatus().state).toBe('signedOut')
    expect(await a.outbox.count()).toBe(1)
  })

  it('a fetch failure sets offline and keeps the outbox', async () => {
    server.offline = true
    await a.cards.put(card('c1'))
    await expect(syncNow(a)).rejects.toBeInstanceOf(OfflineError)
    expect(getSyncStatus().state).toBe('offline')
    expect(await a.outbox.count()).toBe(1)

    server.offline = false
    vi.setSystemTime(9_000)
    await syncNow(a)
    expect(getSyncStatus()).toMatchObject({ state: 'idle', lastSyncedAt: 9_000 })
    expect(await a.outbox.count()).toBe(0)
  })

  it('pulls every page and saves the cursor after each', async () => {
    await a.cards.bulkPut(['c1', 'c2', 'c3', 'c4', 'c5'].map((id) => card(id)))
    await syncNow(a)
    server.pageSize = 2
    const cursors: unknown[] = []
    server.beforeRequest = async (_method, path) => {
      if (path === '/api/sync/pull') cursors.push(await cursorOf(b))
    }
    expect(await syncNow(b)).toEqual({ pushed: 0, pulled: 5 })
    expect(await b.cards.count()).toBe(5)
    expect(cursors).toHaveLength(3)
    expect(new Set(cursors).size).toBe(3)
  })

  it('pushes a large outbox in batches of at most 500 changes', async () => {
    await a.cards.bulkPut(Array.from({ length: 501 }, (_, i) => card(`c${i}`)))
    expect(await syncNow(a)).toMatchObject({ pushed: 501 })
    expect(server.requests.filter((r) => r === 'POST /api/sync/push')).toHaveLength(2)
    expect(server.records.size).toBe(501)
    expect(await a.outbox.count()).toBe(0)
  })

  it('pushes large records in batches of at most 1.5 MB', async () => {
    const doc = (id: string): Doc => ({ id, folderId: 'root', title: id, body: 'x'.repeat(600_000), tags: [], status: 'toRead', pinned: false, createdAt: 1, updatedAt: 1 }) as Doc
    await a.docs.bulkPut(['d1', 'd2', 'd3', 'd4'].map(doc))
    await syncNow(a)
    expect(server.requests.filter((r) => r === 'POST /api/sync/push')).toHaveLength(2)
    expect(server.records.size).toBe(4)
  })

  it('runs one sync at a time and one more after it when asked again', async () => {
    await a.cards.put(card('c1'))
    const first = syncNow(a)
    const second = syncNow(a)
    const third = syncNow(a)
    expect(second).toBe(third)
    await Promise.all([first, second])
    expect(server.requests.filter((r) => r === 'POST /api/sync/push')).toHaveLength(1)
    expect(server.requests.filter((r) => r === 'GET /api/sync/pull')).toHaveLength(2)
  })

  it('without Web Locks, syncs still run one at a time', async () => {
    vi.stubGlobal('navigator', {})
    await a.cards.put(card('c1'))
    let release = () => {}
    const held = new Promise<void>((resolve) => (release = resolve))
    server.beforeRequest = async (_method, path) => {
      if (path !== '/api/sync/push') return
      server.beforeRequest = undefined
      await held
    }
    const first = syncNow(a)
    const second = syncNow(b)
    await vi.waitFor(() => expect(server.requests).toContain('POST /api/sync/push'))
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(server.requests).toEqual(['POST /api/sync/push'])
    release()
    await Promise.all([first, second])
    expect(await b.cards.get('c1')).toEqual(card('c1'))
  })
})

describe('startSync', () => {
  it('syncs at start and 2 s after the last local change', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })
    startSync(a)
    await vi.waitFor(() => expect(server.requests).toContain('GET /api/sync/pull'))
    await vi.waitFor(() => expect(getSyncStatus().state).toBe('idle'))
    await a.cards.put(card('c1'))
    await vi.advanceTimersByTimeAsync(1_000)
    await a.cards.put(card('c2'))
    await vi.advanceTimersByTimeAsync(1_500)
    expect(server.requests).not.toContain('POST /api/sync/push')
    await vi.advanceTimersByTimeAsync(600)
    await vi.waitFor(() => expect(server.records.size).toBe(2))
    expect(server.requests.filter((r) => r === 'POST /api/sync/push')).toHaveLength(1)
  })
})
