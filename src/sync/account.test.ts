import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LernzeitDB } from '@/db/db'
import { SYNC_TABLES } from '@lernzeit/core/sync'
import type { Card } from '@lernzeit/core/types'
import { createTestServer, type TestServer } from '@/test/syncServer'
import { ApiError, setFetch } from './api'
import { cancelSignIn, finishMerge, getMergeProgress, opensApp, readAccount, runMerge, signIn, signOut, startAccountSync, stopAccountSync, continueOffline } from './account'
import { syncNow } from './engine'
import { getSyncStatus } from './status'

let server: TestServer
let database: LernzeitDB
let counter = 0

const card = (id: string, german = 'Hund'): Card => ({ id, deckId: 'd1', type: 'word', english: 'dog', german, createdAt: 1 }) as Card

/** A browser that signed in and merged before. */
async function signedIn(db: LernzeitDB) {
  await db.meta.bulkPut([
    { key: 'account', value: { email: server.email } },
    { key: 'merged', value: true },
  ])
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(1_000)
  server = createTestServer()
  setFetch(server.fetch)
  database = new LernzeitDB(`account-${counter++}`)
})

afterEach(async () => {
  stopAccountSync()
  finishMerge()
  vi.useRealTimers()
  setFetch()
  await database.delete()
})

describe('signIn', () => {
  it('signs in, merges this browser into the cloud and starts syncing', async () => {
    await database.cards.put(card('c1'))
    await signIn(` ${server.email.toUpperCase()} `, server.password, database)
    expect(await readAccount(database)).toEqual({ email: server.email, merged: true })
    expect(server.record('cards', 'c1')?.deleted).toBe(false)
    expect(getMergeProgress()).toMatchObject({ state: 'done', summary: { added: { cards: 1 } } })

    // Syncing runs from now on: a new card goes up.
    await database.cards.put(card('c2'))
    await syncNow(database)
    expect(server.record('cards', 'c2')?.deleted).toBe(false)
  })

  it("a wrong password throws the server's message and saves no account", async () => {
    await expect(signIn(server.email, 'wrong', database)).rejects.toEqual(new ApiError(401, 'Wrong email or password'))
    expect(await readAccount(database)).toBeNull()
  })

  it('a second sign-in after the merge does not merge again', async () => {
    await signedIn(database)
    await database.meta.delete('account')
    await database.cards.put(card('c1'))
    await signIn(server.email, server.password, database)
    // The outbox went up by sync, not by a merge.
    expect(getMergeProgress().state).toBe('idle')
    await vi.waitFor(() => expect(server.record('cards', 'c1')?.deleted).toBe(false))
    await vi.waitFor(async () => expect(await database.outbox.count()).toBe(0))
  })

  it('a failed merge keeps the account unmerged, and cancelling it signs out without touching data', async () => {
    await database.cards.put(card('c1'))
    server.beforeRequest = (method, path) => {
      if (method === 'POST' && path === '/api/sync/push') return new Response(JSON.stringify({ error: 'D1 is down' }), { status: 500 })
    }
    await signIn(server.email, server.password, database)
    expect(await readAccount(database)).toEqual({ email: server.email, merged: false })
    expect(getMergeProgress()).toMatchObject({ state: 'failed', error: 'D1 is down' })

    server.beforeRequest = undefined
    expect(await runMerge(database)).toBe(true)
    expect(await readAccount(database)).toEqual({ email: server.email, merged: true })

    await database.meta.delete('merged')
    await cancelSignIn(database)
    expect(await readAccount(database)).toBeNull()
    expect(await database.cards.count()).toBe(1)
    expect(getMergeProgress().state).toBe('idle')
  })
})

describe('a merge that cannot reach the cloud', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('can be put off: the app opens on this browser’s data without syncing, and the merge runs once back online', async () => {
    vi.stubGlobal('window', new EventTarget())
    await database.cards.put(card('c1'))
    await signIn(server.email, server.password, database)
    server.offline = true
    await database.meta.delete('merged')
    expect(await runMerge(database)).toBe(false)
    const account = await readAccount(database)
    expect(getMergeProgress()).toMatchObject({ state: 'failed', offline: true })
    expect(opensApp(account, getMergeProgress())).toBe(false)

    continueOffline(database)
    expect(getMergeProgress().state).toBe('offline')
    expect(opensApp(account, getMergeProgress())).toBe(true)
    // Still not merged, so the sync engine stays off.
    expect(account?.merged).toBe(false)

    server.offline = false
    window.dispatchEvent(new Event('online'))
    expect(getMergeProgress().state).toBe('running')
    expect(opensApp(account, getMergeProgress())).toBe(false)
    await vi.waitFor(() => expect(getMergeProgress().state).toBe('done'))
    expect(await readAccount(database)).toEqual({ email: server.email, merged: true })
  })

  it('a merge that failed for another reason is not offered offline', async () => {
    server.beforeRequest = (method, path) => (method === 'POST' && path === '/api/sync/push' ? Response.json({ error: 'D1 is down' }, { status: 500 }) : undefined)
    await database.cards.put(card('c1'))
    await signIn(server.email, server.password, database)
    expect(getMergeProgress()).toMatchObject({ state: 'failed', offline: false })
  })

  it('the app opens only when merged with no merge to show, or with the merge put off', () => {
    const merged = { email: server.email, merged: true }
    const unmerged = { email: server.email, merged: false }
    expect(opensApp(merged, { state: 'idle' })).toBe(true)
    expect(opensApp(merged, { state: 'done' })).toBe(false)
    expect(opensApp(unmerged, { state: 'idle' })).toBe(false)
    expect(opensApp(unmerged, { state: 'running' })).toBe(false)
    expect(opensApp(unmerged, { state: 'offline' })).toBe(true)
    expect(opensApp(null, { state: 'offline' })).toBe(false)
  })
})

describe('signOut', () => {
  it("signOut with an unsynced outbox returns 'unsynced' and keeps data", async () => {
    await signedIn(database)
    await database.cards.put(card('c1'))
    server.offline = true
    expect(await signOut({}, database)).toBe('unsynced')
    expect(await database.cards.count()).toBe(1)
    expect(await database.outbox.count()).toBe(1)
    expect(await readAccount(database)).toEqual({ email: server.email, merged: true })
  })

  it('syncs before signing out, so nothing is left to ask about', async () => {
    await signedIn(database)
    await database.cards.put(card('c1'))
    expect(await signOut({}, database)).toBe('done')
    expect(server.record('cards', 'c1')?.deleted).toBe(false)
    expect(server.requests).toContain('POST /api/auth/logout')
    expect(await database.cards.count()).toBe(0)
  })

  it("force signs out anyway: every synced table, the outbox and meta go, except this browser's id and own settings", async () => {
    await signedIn(database)
    await database.meta.bulkPut([
      { key: 'deviceId', value: 'device-1' },
      { key: 'cursor', value: 'abc' },
    ])
    await database.cards.put(card('c1'))
    await database.kv.bulkPut([
      { key: 'settings', value: { pomodoroFocus: 40 } },
      { key: 'deviceSettings', value: { theme: 'dark' } },
    ])
    server.offline = true
    expect(await signOut({ force: true }, database)).toBe('done')

    for (const tbl of SYNC_TABLES.filter((t) => t !== 'kv')) expect(await database.table(tbl).count()).toBe(0)
    expect(await database.kv.toArray()).toEqual([{ key: 'deviceSettings', value: { theme: 'dark' } }])
    expect(await database.outbox.count()).toBe(0)
    expect(await database.meta.toArray()).toEqual([{ key: 'deviceId', value: 'device-1' }])
    expect(await readAccount(database)).toBeNull()
  })
})

describe('the account while syncing', () => {
  it('a 401 clears the account but keeps the outbox', async () => {
    await signedIn(database)
    await database.cards.put(card('c1'))
    server.signOut()
    startAccountSync(database)
    await vi.waitFor(async () => expect(await readAccount(database)).toBeNull())
    expect(await database.cards.count()).toBe(1)
    expect(await database.outbox.toArray()).toEqual([{ tbl: 'cards', id: 'c1', at: 1_000 }])

    // Signing in again pushes what waited, without merging again.
    await signIn(server.email, server.password, database)
    await vi.waitFor(() => expect(server.record('cards', 'c1')?.deleted).toBe(false))
    expect(await readAccount(database)).toEqual({ email: server.email, merged: true })
  })

  it('with an account and no network the app state is signed in', async () => {
    await signedIn(database)
    await database.cards.put(card('c1'))
    server.offline = true
    startAccountSync(database)
    await vi.waitFor(() => expect(getSyncStatus().state).toBe('offline'))
    // Reading the account asks no server.
    expect(await readAccount(database)).toEqual({ email: server.email, merged: true })
    expect(server.requests).toEqual([])
    expect(await database.cards.count()).toBe(1)

    // Back online, sync catches up.
    server.offline = false
    await syncNow(database)
    expect(server.record('cards', 'c1')?.deleted).toBe(false)
    expect(await readAccount(database)).not.toBeNull()
  })
})
