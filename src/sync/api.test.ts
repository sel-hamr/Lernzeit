import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LernzeitDB } from '@/db/db'
import { OfflineError, disconnectApp, getImage, listConnectedApps, mcpInfo, pull, push, putImage, setFetch } from './api'
import { stopSync, syncNow, withLock } from './engine'
import { getSyncStatus } from './status'

/** A request that never gets an answer, and whether its signal was aborted. */
function hanging() {
  const signals: AbortSignal[] = []
  const fetch = (_input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.signal) signals.push(init.signal)
    return new Promise<Response>(() => {})
  }
  return { fetch: fetch as typeof globalThis.fetch, signals }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
})

afterEach(() => {
  stopSync()
  vi.useRealTimers()
  setFetch()
})

describe('requests that get no answer', () => {
  it('a JSON call gives up after 30 s as offline, and aborts the request', async () => {
    const { fetch, signals } = hanging()
    setFetch(fetch)
    for (const call of [() => pull(''), () => push([])]) {
      const settled = vi.fn()
      const result = call().catch((error: unknown) => {
        settled()
        throw error
      })
      const assertion = expect(result).rejects.toBeInstanceOf(OfflineError)
      await vi.advanceTimersByTimeAsync(29_000)
      expect(settled).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(1_000)
      await assertion
    }
    expect(signals).toHaveLength(2)
    expect(signals.every((signal) => signal.aborted)).toBe(true)
  })

  it('an image upload or download gets 120 s', async () => {
    setFetch(hanging().fetch)
    for (const call of [() => getImage('i1'), () => putImage('i1', new Blob(['x'], { type: 'image/png' }))]) {
      const settled = vi.fn()
      const result = call().catch((error: unknown) => {
        settled()
        throw error
      })
      const assertion = expect(result).rejects.toBeInstanceOf(OfflineError)
      await vi.advanceTimersByTimeAsync(60_000)
      expect(settled).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(60_000)
      await assertion
    }
  })

  it('an answer whose body never arrives times out too', async () => {
    const body = new ReadableStream({ start() {} })
    setFetch(async () => new Response(body, { status: 200, headers: { 'Content-Type': 'application/json' } }))
    const assertion = expect(pull('')).rejects.toBeInstanceOf(OfflineError)
    await vi.advanceTimersByTimeAsync(30_000)
    await assertion
  })

  it('a hung sync ends as offline and lets go of the sync lock', async () => {
    const database = new LernzeitDB('api-hung-sync')
    const { fetch, signals } = hanging()
    setFetch(fetch)
    const run = syncNow(database)
    const assertion = expect(run).rejects.toBeInstanceOf(OfflineError)
    // The outbox is read first; the push or pull then hangs.
    await vi.waitFor(() => expect(signals).toHaveLength(1))
    await vi.advanceTimersByTimeAsync(30_000)
    await assertion
    expect(getSyncStatus().state).toBe('offline')
    expect(await withLock(async () => 'free')).toBe('free')
    await database.delete()
  })
})

describe('connected apps', () => {
  it('lists them and disconnects one by id', async () => {
    const calls: string[] = []
    setFetch(async (input, init) => {
      calls.push(`${init?.method ?? 'GET'} ${String(input)}`)
      return init?.method === 'DELETE' ? new Response(null, { status: 204 }) : Response.json([{ id: 'a/b', clientName: 'Claude', createdAt: 1 }])
    })
    expect(await listConnectedApps()).toEqual([{ id: 'a/b', clientName: 'Claude', createdAt: 1 }])
    await disconnectApp('a/b')
    expect(calls).toEqual(['GET /api/mcp/grants', 'DELETE /api/mcp/grants/a%2Fb'])
  })
})

describe('the connector address', () => {
  it('comes from the cloud, which knows its own address', async () => {
    const calls: string[] = []
    setFetch(async (input) => {
      calls.push(String(input))
      return Response.json({ url: 'https://lernzeit.example.workers.dev/mcp' })
    })
    expect(await mcpInfo()).toEqual({ url: 'https://lernzeit.example.workers.dev/mcp' })
    expect(calls).toEqual(['/api/mcp/info'])
  })
})
