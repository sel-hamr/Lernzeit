import { env } from 'cloudflare:workers'
import type { SyncChange } from '@lernzeit/core/sync'
import { beforeEach, describe, expect, it } from 'vitest'
import { BusyError, ChangeError, applyChanges, validateChanges } from '../src/changes.ts'
import { clearSyncData, seedOwner } from './helpers.ts'

beforeEach(async () => {
  await seedOwner()
  await clearSyncData()
})

const card = (id: string, updatedAt: number, extra: object = {}): SyncChange => ({ tbl: 'cards', id, data: { id, front: id, ...extra }, updatedAt, deleted: false })

describe('applyChanges', () => {
  it('stores the changes and returns the count and the seq it stamped', async () => {
    const first = await applyChanges(env.DB, 'owner', [card('a', 1), card('b', 1)])
    expect(first).toEqual({ applied: 2, seq: expect.any(Number) })
    const second = await applyChanges(env.DB, 'owner', [card('c', 1)])
    expect(second.seq).toBe(first.seq + 1)

    const { results } = await env.DB.prepare('SELECT id, data, seq FROM records WHERE owner = ? ORDER BY id').bind('owner').all<{ id: string; data: string; seq: number }>()
    expect(results.map((r) => [r.id, r.seq])).toEqual([['a', first.seq], ['b', first.seq], ['c', second.seq]])
    expect(JSON.parse(results[0].data)).toEqual({ id: 'a', front: 'a' })
  })

  it('newest updatedAt wins and an older change is not counted', async () => {
    await applyChanges(env.DB, 'owner', [card('a', 2000, { v: 'new' })])
    expect((await applyChanges(env.DB, 'owner', [card('a', 1000, { v: 'old' })])).applied).toBe(0)
    expect((await applyChanges(env.DB, 'owner', [card('a', 2000, { v: 'tie' })])).applied).toBe(1)
    const row = await env.DB.prepare("SELECT data FROM records WHERE id = 'a'").first<{ data: string }>()
    expect(JSON.parse(row!.data).v).toBe('tie')
  })

  it('deleting an image removes its bytes', async () => {
    await env.DB.prepare("INSERT INTO blobs (owner, id, type, bytes) VALUES ('owner', 'i1', 'image/png', x'00')").run()
    const meta = { id: 'i1', width: 1, height: 1, fit: 'contain', type: 'image/png' }
    await applyChanges(env.DB, 'owner', [{ tbl: 'images', id: 'i1', data: meta, updatedAt: 1, deleted: false }])
    expect(await env.DB.prepare("SELECT 1 FROM blobs WHERE id = 'i1'").first()).not.toBeNull()
    await applyChanges(env.DB, 'owner', [{ tbl: 'images', id: 'i1', data: null, updatedAt: 2, deleted: true }])
    expect(await env.DB.prepare("SELECT 1 FROM blobs WHERE id = 'i1'").first()).toBeNull()
  })

  it('an empty list applies nothing and returns the current seq', async () => {
    const { seq } = await applyChanges(env.DB, 'owner', [card('a', 1)])
    expect(await applyChanges(env.DB, 'owner', [])).toEqual({ applied: 0, seq })
  })

  it('refuses a payload D1 cannot take as 413', async () => {
    const big = Array.from({ length: 3 }, (_, i) => card(`b${i}`, 1, { text: '"'.repeat(400_000) }))
    await expect(applyChanges(env.DB, 'owner', big)).rejects.toMatchObject({ status: 413 })
  })
})

describe('applyChanges when a guarded write fails with an error it does not know', () => {
  const failing = (before: () => Promise<unknown>): D1Database =>
    ({
      prepare: (sql: string) => env.DB.prepare(sql),
      batch: async () => {
        await before()
        throw new Error('D1 exploded')
      },
    }) as unknown as D1Database

  it('throws BusyError when the owner’s counter moved meanwhile', async () => {
    await applyChanges(env.DB, 'o1', [card('a', 1)])
    const db = failing(() => applyChanges(env.DB, 'o1', [card('b', 1)]))
    await expect(applyChanges(db, 'o1', [card('c', 2)], { expectSeq: 1 })).rejects.toBeInstanceOf(BusyError)
  })

  it('rethrows the original error when the counter is where it was expected', async () => {
    await applyChanges(env.DB, 'o1', [card('a', 1)])
    const db = failing(async () => {})
    await expect(applyChanges(db, 'o1', [card('c', 2)], { expectSeq: 1 })).rejects.toThrow('D1 exploded')
  })
})

describe('applyChanges when the counter re-read fails too', () => {
  it('throws the batch’s own error', async () => {
    const db = {
      prepare: (sql: string) => (sql.startsWith('SELECT') ? { bind: () => ({ first: () => Promise.reject(new Error('re-read failed')) }) } : env.DB.prepare(sql)),
      batch: () => Promise.reject(new Error('D1 exploded')),
    } as unknown as D1Database
    await expect(applyChanges(db, 'o1', [card('c', 2)], { expectSeq: 0 })).rejects.toThrow('D1 exploded')
  })
})

describe('validateChanges', () => {
  it('returns the changes as they are', () => {
    const changes = [card('a', 1), { tbl: 'cards', id: 'b', data: null, updatedAt: 2, deleted: true }]
    expect(validateChanges(changes)).toEqual(changes)
  })

  it.each([
    ['an array', []],
    ['a string', 'x'],
    ['a number', 5],
  ])('refuses data that is %s', (_, data) => {
    const bad = { tbl: 'cards', id: 'a', data, updatedAt: 1, deleted: false }
    expect(() => validateChanges([card('z', 1), bad])).toThrow(ChangeError)
    expect(() => validateChanges([card('z', 1), bad])).toThrow(/^Change 1 /)
  })

  it('refuses data naming another id, and a kv value naming another key', () => {
    expect(() => validateChanges([{ ...card('a', 1), data: { id: 'other' } }])).toThrow(/^Change 0 .*"a"/)
    expect(() => validateChanges([{ tbl: 'kv', id: 'settings', data: { key: 'seeded', value: 1 }, updatedAt: 1, deleted: false }])).toThrow(/^Change 0 .*key/)
    expect(() => validateChanges([{ tbl: 'cards', id: 'a', data: {}, updatedAt: 1, deleted: false }])).toThrow(ChangeError)
  })

  it('accepts a kv row naming its key', () => {
    const kv = { tbl: 'kv', id: 'settings', data: { key: 'settings', value: {} }, updatedAt: 1, deleted: false }
    expect(validateChanges([kv])).toEqual([kv])
  })

  it('refuses what is not a list', () => {
    expect(() => validateChanges({})).toThrow(ChangeError)
  })
})
