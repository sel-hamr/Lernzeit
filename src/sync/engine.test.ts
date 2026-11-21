import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getSettings, LernzeitDB } from '@/db/db'
import { resetAllData, restoreBackup, type Backup } from '@/data/io'
import { signedIn } from '@/test/cloud'
import { getDeviceId } from './device'
import type { Card, Doc } from '@lernzeit/core/types'
import { createTestServer, type TestServer } from '@/test/syncServer'
import { OfflineError, SignedOutError, setFetch } from './api'
import { startSync, stopSync, syncNow } from './engine'
import { getSyncStatus, stuckChanges } from './status'

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

  it('image bytes missing on the server (404) skip that image, move the cursor and note its id', async () => {
    await a.images.put({ id: 'i1', blob: new Blob(['png bytes'], { type: 'image/png' }), width: 40, height: 30, fit: 'cover' })
    await a.cards.put(card('c1'))
    await syncNow(a)
    server.blobs.delete('i1')

    expect(await syncNow(b)).toEqual({ pushed: 0, pulled: 1 })
    expect(await b.cards.get('c1')).toBeDefined()
    expect(await b.images.get('i1')).toBeUndefined()
    expect(await b.meta.get('missingImages')).toEqual({ key: 'missingImages', value: ['i1'] })
    expect(await cursorOf(b)).toBe((await server.fetch('/api/sync/pull?cursor=').then((r) => r.json())).cursor)
    expect(getSyncStatus().state).toBe('idle')
    // Pulled again later, with its bytes back, it is applied and no longer missing.
    vi.setSystemTime(2_000)
    await a.images.update('i1', { fit: 'contain' })
    await syncNow(a)
    await syncNow(b)
    expect(await b.images.get('i1')).toMatchObject({ fit: 'contain' })
    expect((await b.meta.get('missingImages'))?.value).toEqual([])
  })

  it('a failed image download (5xx) leaves the cursor unchanged', async () => {
    await a.cards.put(card('c0'))
    await syncNow(a)
    await syncNow(b)
    const cursor = await cursorOf(b)
    expect(cursor).toBeTruthy()

    await a.images.put({ id: 'i1', blob: new Blob(['png bytes'], { type: 'image/png' }), width: 40, height: 30, fit: 'cover' })
    await a.cards.put(card('c1'))
    await syncNow(a)
    server.beforeRequest = (_method, path) => (path === '/api/images/i1' ? new Response('{"error":"D1 is down"}', { status: 503 }) : undefined)

    await expect(syncNow(b)).rejects.toThrow('D1 is down')
    expect(await cursorOf(b)).toBe(cursor)
    expect(await b.images.get('i1')).toBeUndefined()
    expect(await b.cards.get('c1')).toBeUndefined()
    expect(await b.meta.get('missingImages')).toBeUndefined()
    expect(getSyncStatus().state).toBe('error')

    server.beforeRequest = undefined
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
    // None was refused and retried in halves.
    expect(server.statuses.every((status) => status < 400)).toBe(true)
    expect(server.records.size).toBe(501)
    expect(await a.outbox.count()).toBe(0)
  })

  it('pushes large records in batches of at most 1.5 MB', async () => {
    const doc = (id: string): Doc => ({ id, folderId: 'root', title: id, body: 'x'.repeat(600_000), tags: [], status: 'toRead', pinned: false, createdAt: 1, updatedAt: 1 }) as Doc
    await a.docs.bulkPut(['d1', 'd2', 'd3', 'd4'].map(doc))
    await syncNow(a)
    expect(server.requests.filter((r) => r === 'POST /api/sync/push')).toHaveLength(2)
    // The batches were cut to size here: none was refused (413) and retried in halves.
    expect(server.statuses.every((status) => status < 400)).toBe(true)
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

describe('changes the cloud refuses', () => {
  const doc = (id: string, bytes: number): Doc =>
    ({ id, folderId: 'root', title: id, body: 'x'.repeat(bytes), tags: [], status: 'toRead', pinned: false, createdAt: 1, updatedAt: 1 }) as Doc
  const pushes = () => server.requests.filter((r) => r === 'POST /api/sync/push').length

  it('an oversized doc stays in the outbox, other changes push, and pull still brings a remote change', async () => {
    await b.cards.put(card('remote'))
    await syncNow(b)

    await a.docs.put(doc('big', 1_200_000))
    await a.cards.put(card('c1'))
    expect(await syncNow(a)).toEqual({ pushed: 1, pulled: 2 })
    expect(server.record('docs', 'big')).toBeUndefined()
    expect(server.record('cards', 'c1')).toBeDefined()
    expect(await a.cards.get('remote')).toBeDefined()
    expect(await a.outbox.count()).toBe(1)
    expect(await stuckChanges(a)).toEqual([{ tbl: 'docs', id: 'big', reason: expect.stringContaining('too large') }])
    expect(getSyncStatus().state).toBe('idle')

    // It is not sent again while it stays as it is.
    const before = pushes()
    await syncNow(a)
    expect(pushes()).toBe(before)
    expect(await stuckChanges(a)).toHaveLength(1)
  })

  it('a parked entry is retried after it changes to a valid size', async () => {
    await a.docs.put(doc('big', 1_200_000))
    await syncNow(a)
    expect(await stuckChanges(a)).toHaveLength(1)

    vi.setSystemTime(2_000)
    await a.docs.update('big', { body: 'short now' })
    expect(await stuckChanges(a)).toEqual([])
    expect(await syncNow(a)).toMatchObject({ pushed: 1 })
    expect(server.record('docs', 'big')).toMatchObject({ data: { body: 'short now' }, updatedAt: 2_000 })
    expect(await a.outbox.count()).toBe(0)
  })

  it('a 400 for one change in a batch of 10 pushes the other 9', async () => {
    server.refuseChange = (change) => (change.id === 'c7' ? 'is not something the server can store.' : undefined)
    await a.cards.bulkPut(Array.from({ length: 10 }, (_, i) => card(`c${i}`)))
    expect(await syncNow(a)).toMatchObject({ pushed: 9 })
    expect(server.records.size).toBe(9)
    expect(server.record('cards', 'c7')).toBeUndefined()
    expect(await a.outbox.toArray()).toMatchObject([{ tbl: 'cards', id: 'c7' }])
    expect(await stuckChanges(a)).toEqual([{ tbl: 'cards', id: 'c7', reason: expect.stringContaining('is not something the server can store') }])
    expect(server.requests).toContain('GET /api/sync/pull')

    // Parked, it is not sent again until it changes.
    const before = pushes()
    await syncNow(a)
    expect(pushes()).toBe(before)
  })

  it('an oversized SVG image entry is parked and reported, and so is a file that is not an image', async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg">' + ' '.repeat(1_600_000) + '</svg>'
    await a.images.put({ id: 'big', blob: new Blob([svg], { type: 'image/svg+xml' }), width: 40, height: 30, fit: 'contain' })
    await a.images.put({ id: 'odd', blob: new Blob(['text'], { type: 'text/plain' }), width: 40, height: 30, fit: 'contain' })
    await a.cards.put(card('c1'))
    expect(await syncNow(a)).toMatchObject({ pushed: 1 })
    expect(server.requests.filter((r) => r.startsWith('PUT /api/images/'))).toEqual([])
    expect(server.record('images', 'big')).toBeUndefined()
    expect(server.record('images', 'odd')).toBeUndefined()
    const reasons = Object.fromEntries((await stuckChanges(a)).map((change) => [change.id, change.reason]))
    expect(reasons.big).toContain('too large')
    expect(reasons.odd).toContain('not an image')
  })

  it('an image the server refuses is parked and its record is not pushed', async () => {
    server.beforeRequest = (method, path) =>
      method === 'PUT' && path === '/api/images/i1' ? new Response('{"error":"Not this one."}', { status: 415 }) : undefined
    await a.images.put({ id: 'i1', blob: new Blob(['png'], { type: 'image/png' }), width: 40, height: 30, fit: 'cover' })
    await a.cards.put(card('c1'))
    expect(await syncNow(a)).toMatchObject({ pushed: 1 })
    expect(server.record('images', 'i1')).toBeUndefined()
    expect(await stuckChanges(a)).toEqual([{ tbl: 'images', id: 'i1', reason: 'Not this one.' }])
  })

  it('still pulls after a push fails on the server, and reports the failure', async () => {
    await b.cards.put(card('remote'))
    await syncNow(b)
    server.beforeRequest = (_method, path) => (path === '/api/sync/push' ? new Response('{"error":"D1 is down"}', { status: 503 }) : undefined)
    await a.cards.put(card('c1'))
    await expect(syncNow(a)).rejects.toThrow('D1 is down')
    expect(await a.cards.get('remote')).toBeDefined()
    expect(await a.outbox.count()).toBe(1)
    expect(await stuckChanges(a)).toEqual([])
    expect(getSyncStatus()).toMatchObject({ state: 'error', error: 'D1 is down' })
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

describe('restore and reset across devices', () => {
  const backupOf = async (cards: Card[], speechRate = 0.5): Promise<Backup> => ({
    app: 'lernzeit',
    version: 1,
    exportedAt: 1,
    topics: [],
    sessions: [],
    decks: [],
    cards,
    reviews: [],
    reviewLogs: [],
    tasks: [],
    images: [],
    settings: { ...(await getSettings(a)), speechRate },
  })

  beforeEach(async () => {
    await Promise.all([signedIn(a), signedIn(b)])
  })

  it('reset on one database empties the other after it syncs', async () => {
    await a.cards.bulkPut([card('c1'), card('c2')])
    await a.kv.put({ key: 'seeded', value: 1 })
    await syncNow(a)
    await syncNow(b)
    expect(await b.cards.count()).toBe(2)

    vi.setSystemTime(2_000)
    await resetAllData(a)
    expect(await a.cards.count()).toBe(0)
    expect(await a.outbox.count()).toBe(0)
    expect(server.record('cards', 'c1')).toMatchObject({ deleted: true })

    await syncNow(b)
    expect(await b.cards.count()).toBe(0)
    expect(await b.kv.get('seeded')).toBeUndefined()
    expect(await b.outbox.count()).toBe(0)
  })

  it('reset keeps the device id, the account, the cursor and this device settings', async () => {
    const deviceId = await getDeviceId(a)
    await a.cards.put(card('c1'))
    await a.kv.bulkPut([
      { key: 'deviceSettings', value: { speechRate: 0.7 } },
      { key: 'bridge', value: { key: 'bridge', value: 'x' } },
      { key: 'settings', value: { dailyGoal: 1 } },
    ])
    await syncNow(a)
    const cursor = await cursorOf(a)
    await resetAllData(a)

    expect(await getDeviceId(a)).toBe(deviceId)
    expect(await a.meta.get('account')).toEqual({ key: 'account', value: { email: 'owner@lernzeit.test' } })
    expect((await a.meta.get('merged'))?.value).toBe(true)
    expect((await cursorOf(a)) ?? '').not.toBe('')
    expect(cursor).toBeTruthy()
    expect((await a.kv.toArray()).map((row) => row.key).sort()).toEqual(['bridge', 'deviceSettings'])
    expect((await a.kv.get('deviceSettings'))?.value).toEqual({ speechRate: 0.7 })
  })

  it('restore uploads every backup record and the other database receives them', async () => {
    await b.cards.put(card('old'))
    await syncNow(b)
    vi.setSystemTime(2_000)
    const result = await restoreBackup(await backupOf([card('c1'), card('c2')]), a)
    expect(result).toEqual({ cards: 2, sessions: 0, tasks: 0 })
    // Restoring returns once the backup is stored here; the upload runs on its own.
    await syncNow(a)
    expect(await a.outbox.count()).toBe(0)
    expect(server.record('cards', 'c1')).toMatchObject({ data: card('c1'), deleted: false })
    expect(server.record('cards', 'old')).toMatchObject({ deleted: true })

    await syncNow(b)
    expect((await b.cards.toArray()).map((c) => c.id).sort()).toEqual(['c1', 'c2'])
  })

  it('restore leaves the backup in the outbox when the sync fails, and keeps this device settings', async () => {
    await a.kv.put({ key: 'deviceSettings', value: { speechRate: 0.9 } })
    server.beforeRequest = (_method, path) => (path === '/api/sync/push' ? new Response('{"error":"D1 is down"}', { status: 503 }) : undefined)
    await restoreBackup(await backupOf([card('c1')], 0.5), a)
    expect(await a.cards.count()).toBe(1)
    expect((await a.outbox.toArray()).map((e) => `${e.tbl}/${e.id}`)).toContain('cards/c1')
    expect((await a.kv.get('deviceSettings'))?.value).toEqual({ speechRate: 0.9 })
    // Shared settings still come from the backup.
    expect(await a.kv.get('settings')).toBeDefined()

    server.beforeRequest = undefined
    await syncNow(a)
    expect(server.record('cards', 'c1')).toMatchObject({ deleted: false })
  })

  it('restore seeds device settings only where this device has none', async () => {
    await restoreBackup(await backupOf([card('c1')], 0.5), a)
    expect((await a.kv.get('deviceSettings'))?.value).toMatchObject({ speechRate: 0.5 })
  })

  it('a failed cloud reset changes nothing locally, and says why', async () => {
    await a.cards.put(card('c1'))
    await syncNow(a)
    await a.cards.put(card('c2'))
    const outbox = await a.outbox.toArray()

    server.offline = true
    await expect(resetAllData(a)).rejects.toThrow("You're offline. Connect to reset your library.")
    await expect(restoreBackup(await backupOf([card('z')]), a)).rejects.toThrow("You're offline. Connect to restore a backup.")
    server.offline = false
    server.signOut()
    await expect(resetAllData(a)).rejects.toThrow('Sign in to reset your library.')
    server.signIn()
    server.beforeRequest = () => new Response('{"error":"D1 is down"}', { status: 503 })
    await expect(resetAllData(a)).rejects.toThrow('D1 is down')

    expect((await a.cards.toArray()).map((c) => c.id).sort()).toEqual(['c1', 'c2'])
    expect(await a.outbox.toArray()).toEqual(outbox)
  })

  it('refuses without asking the server when nobody is signed in', async () => {
    await a.meta.delete('account')
    await a.cards.put(card('c1'))
    server.requests.length = 0
    await expect(resetAllData(a)).rejects.toThrow('Sign in to reset your library.')
    await expect(restoreBackup(await backupOf([]), a)).rejects.toThrow('Sign in to restore a backup.')
    expect(server.requests).toEqual([])
    expect(await a.cards.count()).toBe(1)
  })
  it('restored rows beat the reset even when this clock runs an hour behind the server', async () => {
    await b.cards.bulkPut([card('c1', 'Hund'), card('c2', 'Katze')])
    await syncNow(b)
    server.clockOffset = 3_600_000
    await restoreBackup(await backupOf([card('c1', 'Pferd'), card('c3', 'Maus')]), a)
    await syncNow(a)
    expect(server.record('cards', 'c1')).toMatchObject({ data: card('c1', 'Pferd'), deleted: false })
    expect(server.record('cards', 'c2')).toMatchObject({ deleted: true })

    await syncNow(b)
    await syncNow(a)
    for (const database of [a, b]) {
      expect((await database.cards.toArray()).map((c) => c.id).sort()).toEqual(['c1', 'c3'])
    }
    expect((await b.cards.get('c1'))?.german).toBe('Pferd')
  })

  it('refuses a backup with an id twice before touching the cloud', async () => {
    await a.cards.put(card('keep'))
    server.requests.length = 0
    await expect(restoreBackup(await backupOf([card('c1'), card('c1')]), a)).rejects.toThrow('"cards" with the same id twice (c1)')
    expect(server.requests).toEqual([])
    expect(await a.cards.count()).toBe(1)
  })

  it('puts the old library back into the cloud when the local write fails after the cloud reset', async () => {
    await a.cards.bulkPut([card('old1'), card('old2')])
    await syncNow(a)
    vi.setSystemTime(2_000)
    const spy = vi.spyOn(a.docs, 'bulkAdd').mockRejectedValue(new Error('quota'))
    await expect(restoreBackup(await backupOf([card('new')]), a)).rejects.toThrow('Restore failed. Your library was kept.')
    spy.mockRestore()
    expect(server.record('cards', 'old1')).toMatchObject({ deleted: true })
    expect((await a.cards.toArray()).map((c) => c.id).sort()).toEqual(['old1', 'old2'])
    expect((await a.outbox.toArray()).map((e) => `${e.tbl}/${e.id}`)).toEqual(expect.arrayContaining(['cards/old1', 'cards/old2']))

    await syncNow(a)
    expect(server.record('cards', 'old1')).toMatchObject({ data: card('old1'), deleted: false })
    await syncNow(b)
    expect((await b.cards.toArray()).map((c) => c.id).sort()).toEqual(['old1', 'old2'])
  })

  it('does not start a second restore while one runs', async () => {
    let release!: () => void
    server.beforeRequest = (_method, path) => (path === '/api/sync/reset' ? new Promise<void>((resolve) => (release = resolve)) : undefined)
    const first = restoreBackup(await backupOf([card('c1')]), a)
    await vi.waitFor(() => expect(release).toBeDefined())
    await expect(restoreBackup(await backupOf([card('c2')]), a)).rejects.toThrow('already running')
    release()
    await first
    expect((await a.cards.toArray()).map((c) => c.id)).toEqual(['c1'])
  })

})
