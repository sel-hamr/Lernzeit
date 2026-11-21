import { SELF } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { MAX_PULL_CHANGES, type PullResponse, type PushResponse, type SyncChange } from '@lernzeit/core/sync'
import { beforeEach, describe, expect, it } from 'vitest'
import { clearSyncData, deviceToken, seedOwner } from './helpers.ts'

let token: string

beforeEach(async () => {
  await seedOwner()
  await clearSyncData()
  token = await deviceToken()
})

function change(id: string, updatedAt: number, data: unknown = { id, front: `card ${id}` }, tbl = 'cards'): SyncChange {
  return { tbl, id, data, updatedAt, deleted: false } as SyncChange
}

function tombstone(id: string, updatedAt: number, tbl = 'cards'): SyncChange {
  return { tbl, id, data: null, updatedAt, deleted: true } as SyncChange
}

function pushRaw(body: string, as = token, type = 'application/json'): Promise<Response> {
  return SELF.fetch('https://x/api/sync/push', { method: 'POST', headers: { Authorization: `Bearer ${as}`, 'Content-Type': type }, body })
}

async function push(changes: unknown[], as = token): Promise<PushResponse> {
  const response = await pushRaw(JSON.stringify({ changes }), as)
  expect(response.status).toBe(200)
  return response.json<PushResponse>()
}

function pullRaw(query = '', as = token): Promise<Response> {
  return SELF.fetch(`https://x/api/sync/pull${query}`, { headers: { Authorization: `Bearer ${as}` } })
}

async function pull(cursor = '', limit?: number): Promise<PullResponse> {
  const params = new URLSearchParams({ cursor })
  if (limit !== undefined) params.set('limit', String(limit))
  const response = await pullRaw(`?${params}`)
  expect(response.status).toBe(200)
  return response.json<PullResponse>()
}

/** Every change from the start, page by page. */
async function pullAll(limit?: number): Promise<{ pages: PullResponse[]; changes: PullResponse['changes'] }> {
  const pages: PullResponse[] = []
  let cursor = ''
  for (;;) {
    const page = await pull(cursor, limit)
    pages.push(page)
    cursor = page.cursor
    if (!page.more) break
  }
  return { pages, changes: pages.flatMap((page) => page.changes) }
}

function reset(as = token): Promise<Response> {
  return SELF.fetch('https://x/api/sync/reset', { method: 'POST', headers: { Authorization: `Bearer ${as}`, 'Content-Type': 'application/json' }, body: '{}' })
}

describe('sync push and pull', () => {
  it('push then pull returns the record with its data and a seq', async () => {
    const data = { id: 'c1', front: 'der Hund', back: 'the dog', tags: ['animal'], due: null }
    expect(await push([change('c1', 1000, data)])).toEqual({ applied: 1 })

    const page = await pull()
    expect(page.more).toBe(false)
    expect(page.cursor).not.toBe('')
    expect(page.changes).toHaveLength(1)
    expect(page.changes[0]).toEqual({ tbl: 'cards', id: 'c1', data, updatedAt: 1000, deleted: false, seq: expect.any(Number) })
    expect(page.changes[0].seq).toBeGreaterThan(0)

    // Pulling from the returned cursor gives nothing new, and keeps the cursor.
    const next = await pull(page.cursor)
    expect(next).toEqual({ changes: [], cursor: page.cursor, more: false })
  })

  it('an older updatedAt does not replace a newer one; an equal one does', async () => {
    await push([change('c1', 2000, { v: 'first' })])
    expect(await push([change('c1', 1999, { v: 'older' })])).toEqual({ applied: 0 })
    expect((await pull()).changes.map((c) => c.data)).toEqual([{ v: 'first' }])

    expect(await push([change('c1', 2000, { v: 'same time' })])).toEqual({ applied: 1 })
    expect((await pull()).changes.map((c) => c.data)).toEqual([{ v: 'same time' }])
  })

  it('a tombstone comes back as deleted with null data', async () => {
    await push([change('c1', 1000)])
    await push([tombstone('c1', 1001)])
    const { changes } = await pull()
    expect(changes).toEqual([{ tbl: 'cards', id: 'c1', data: null, updatedAt: 1001, deleted: true, seq: expect.any(Number) }])
    const row = await env.DB.prepare('SELECT data, deleted FROM records WHERE id = ?').bind('c1').first()
    expect(row).toEqual({ data: null, deleted: 1 })
  })

  it('pull pages: 1200 records with limit 500 come back in 3 pages, no duplicates, none missing', async () => {
    const ids = Array.from({ length: 1200 }, (_, i) => `card-${String(i).padStart(4, '0')}`)
    for (let batch = 0; batch < 3; batch++) {
      const slice = ids.slice(batch * 400, (batch + 1) * 400)
      expect(await push(slice.map((id) => change(id, 1000)))).toEqual({ applied: 400 })
    }
    const { pages, changes } = await pullAll(500)
    expect(pages.map((page) => page.changes.length)).toEqual([500, 500, 200])
    expect(pages.map((page) => page.more)).toEqual([true, true, false])
    const pulled = changes.map((c) => c.id)
    expect(new Set(pulled).size).toBe(1200)
    expect([...pulled].sort()).toEqual(ids)
  })

  it('records pushed in one batch share a seq and still page correctly with limit 1', async () => {
    await push([change('a', 1), change('b', 1, undefined, 'decks'), change('c', 1), change('d', 1, undefined, 'topics'), change('e', 1)])
    const { pages, changes } = await pullAll(1)
    expect(pages).toHaveLength(5)
    expect(pages.every((page) => page.changes.length === 1)).toBe(true)
    expect(new Set(changes.map((c) => c.seq)).size).toBe(1)
    // Ordered by (seq, tbl, id).
    expect(changes.map((c) => `${c.tbl}/${c.id}`)).toEqual(['cards/a', 'cards/c', 'cards/e', 'decks/b', 'topics/d'])
  })

  it('a later push gets a higher seq, and pulling from a cursor returns only what came after', async () => {
    await push([change('a', 1)])
    const first = await pull()
    await push([change('b', 1)])
    const next = await pull(first.cursor)
    expect(next.changes.map((c) => c.id)).toEqual(['b'])
    expect(next.changes[0].seq).toBeGreaterThan(first.changes[0].seq)
  })

  it('a limit over the maximum is capped', async () => {
    const ids = Array.from({ length: MAX_PULL_CHANGES + 1 }, (_, i) => `c${i}`)
    await push(ids.slice(0, 500).map((id) => change(id, 1)))
    await push(ids.slice(500).map((id) => change(id, 1)))
    const page = await pull('', 10_000)
    expect(page.changes).toHaveLength(MAX_PULL_CHANGES)
    expect(page.more).toBe(true)
  })

  it('two devices writing the same record: the newer one wins whatever the arrival order', async () => {
    const phone = await deviceToken('Phone')
    const laptop = await deviceToken('Laptop')

    // Newer first, older second.
    await push([change('x', 2000, { by: 'phone' })], phone)
    await push([change('x', 1000, { by: 'laptop' })], laptop)
    // Older first, newer second.
    await push([change('y', 1000, { by: 'phone' })], phone)
    await push([change('y', 2000, { by: 'laptop' })], laptop)

    const { changes } = await pull()
    const byId = Object.fromEntries(changes.map((c) => [c.id, c.data]))
    expect(byId).toEqual({ x: { by: 'phone' }, y: { by: 'laptop' } })
  })

  it('synced kv keys are accepted', async () => {
    expect(await push([{ tbl: 'kv', id: 'settings', data: { key: 'settings', value: {} }, updatedAt: 1, deleted: false }])).toEqual({ applied: 1 })
  })

  it('an empty push applies nothing', async () => {
    expect(await push([])).toEqual({ applied: 0 })
  })
})

describe('sync push refuses bad input', () => {
  async function expect400(changes: unknown[], message: RegExp): Promise<void> {
    const response = await pushRaw(JSON.stringify({ changes }))
    expect(response.status).toBe(400)
    const body = await response.json<{ error: string }>()
    expect(body.error).toMatch(message)
  }

  it('unknown table, kv key tour, 501 changes → 400', async () => {
    await expect400([change('a', 1, {}, 'nope')], /table/i)
    await expect400([{ tbl: 'kv', id: 'tour', data: { key: 'tour' }, updatedAt: 1, deleted: false }], /tour/)
    await expect400(Array.from({ length: 501 }, (_, i) => change(`c${i}`, 1)), /500/)
    expect((await pull()).changes).toEqual([])
  })

  it('an id longer than MAX_ID_LENGTH, or empty → 400', async () => {
    await expect400([change('x'.repeat(201), 1)], /id/i)
    await expect400([change('', 1)], /id/i)
  })

  it('a bad change shape → 400 naming that change, and nothing of the push is applied', async () => {
    const good = change('good', 1)
    const bad: unknown[] = [
      'not an object',
      null,
      { ...good, id: 5 },
      { ...good, tbl: 7 },
      { ...good, updatedAt: '1' },
      { ...good, updatedAt: -1 },
      { ...good, updatedAt: 1.5 },
      { ...good, updatedAt: Number.MAX_SAFE_INTEGER + 2 },
      { ...good, deleted: 'no' },
      { tbl: 'cards', id: 'c', updatedAt: 1, deleted: false },
      { ...good, data: null },
    ]
    for (const item of bad) {
      const response = await pushRaw(JSON.stringify({ changes: [good, item] }))
      expect(response.status, JSON.stringify(item)).toBe(400)
      expect((await response.json<{ error: string }>()).error).toMatch(/^Change 1\b/)
    }
    expect((await pull()).changes).toEqual([])
  })

  it('a body that is not { changes: [...] } → 400', async () => {
    for (const body of ['{nope', '[]', '{}', '{"changes":{}}', 'null']) {
      const response = await pushRaw(body)
      expect(response.status, body).toBe(400)
      expect(await response.json<{ error: string }>()).toEqual({ error: expect.any(String) })
    }
  })

  it('a record over MAX_RECORD_BYTES → 400', async () => {
    await expect400([change('big', 1, { text: 'x'.repeat(1_000_001) })], /big/)
  })

  it('a body over MAX_PUSH_BYTES → 413', async () => {
    const changes = Array.from({ length: 4 }, (_, i) => change(`c${i}`, 1, { text: 'x'.repeat(400_000) }))
    const response = await pushRaw(JSON.stringify({ changes }))
    expect(response.status).toBe(413)
    expect((await response.json<{ error: string }>()).error).toMatch(/at most 1500000 bytes/)
    expect((await pull()).changes).toEqual([])
  })

  it('a push that would overflow what D1 takes in one value → 413', async () => {
    // Quotes are escaped once in the body and twice in what goes to D1.
    const changes = Array.from({ length: 2 }, (_, i) => change(`c${i}`, 1, '"'.repeat(350_000)))
    const response = await pushRaw(JSON.stringify({ changes }))
    expect(response.status).toBe(413)
    expect((await response.json<{ error: string }>()).error).toMatch(/fewer changes/)
    expect((await pull()).changes).toEqual([])
  })

  it('push without a JSON Content-Type → 415', async () => {
    const response = await pushRaw(JSON.stringify({ changes: [change('a', 1)] }), token, 'text/plain')
    expect(response.status).toBe(415)
    expect((await pull()).changes).toEqual([])
  })

  it('a malformed cursor or limit → 400', async () => {
    const bad = ['nope', btoa('[1,2]'), btoa('{"a":1}'), btoa('[-1,"cards","a"]'), btoa('[1,"cards",3]')]
    for (const cursor of bad) {
      const response = await pullRaw(`?cursor=${encodeURIComponent(cursor)}`)
      expect(response.status, cursor).toBe(400)
    }
    for (const limit of ['0', '-3', 'abc', '1.5']) {
      expect((await pullRaw(`?limit=${limit}`)).status, limit).toBe(400)
    }
  })
})

describe('sync reset', () => {
  it('reset tombstones everything; a record pushed afterwards with a newer time is live', async () => {
    await push([change('a', 1000), change('b', 1000, undefined, 'decks'), tombstone('gone', 1000)])
    const goneBefore = (await pull()).changes.find((c) => c.id === 'gone')!

    const before = Date.now()
    const response = await reset()
    expect(response.status).toBe(200)
    const { at } = await response.json<{ at: number }>()
    expect(at).toBeGreaterThanOrEqual(before)
    expect(at).toBeLessThanOrEqual(Date.now())

    const { changes } = await pull()
    expect(changes.every((c) => c.deleted && c.data === null)).toBe(true)
    const byId = Object.fromEntries(changes.map((c) => [c.id, c]))
    expect(byId.a.updatedAt).toBe(at)
    expect(byId.b.updatedAt).toBe(at)
    // An existing tombstone is left as it was.
    expect(byId.gone).toEqual(goneBefore)

    await push([change('a', at + 1, { back: true })])
    const after = (await pull()).changes.find((c) => c.id === 'a')!
    expect(after).toMatchObject({ deleted: false, data: { back: true }, updatedAt: at + 1 })
  })

  it('reset without a JSON Content-Type → 415', async () => {
    const response = await SELF.fetch('https://x/api/sync/reset', { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
    expect(response.status).toBe(415)
  })
})

describe('sync responses', () => {
  it('need a session and are never cached, errors included', async () => {
    for (const [path, init] of [
      ['/api/sync/pull', {}],
      ['/api/sync/push', { method: 'POST' }],
      ['/api/sync/reset', { method: 'POST' }],
    ] as const) {
      const response = await SELF.fetch(`https://x${path}`, init)
      expect(response.status, path).toBe(401)
      expect(response.headers.get('Cache-Control'), path).toBe('no-store')
    }
    const ok = await pullRaw()
    expect(ok.status).toBe(200)
    expect(ok.headers.get('Cache-Control')).toBe('no-store')
    const pushed = await pushRaw(JSON.stringify({ changes: [] }))
    expect(pushed.headers.get('Cache-Control')).toBe('no-store')
    const bad = await pullRaw('?cursor=nope')
    expect(bad.status).toBe(400)
    expect(bad.headers.get('Cache-Control')).toBe('no-store')
    expect((await reset()).headers.get('Cache-Control')).toBe('no-store')
  })
})
