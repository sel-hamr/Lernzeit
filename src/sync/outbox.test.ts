import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LernzeitDB } from '@/db/db'
import type { Card, Task } from '@lernzeit/core/types'
import { applyRemote, onLocalChange } from './outbox'

let database: LernzeitDB
let counter = 0

const card = (id: string, german = 'Hund'): Card => ({ id, deckId: 'd1', type: 'word', english: 'dog', german, createdAt: 1 }) as Card
const task = (id: string): Task => ({ id, title: id, priority: 'medium', status: 'todo', order: 0, createdAt: 1 })

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(1_000)
  database = new LernzeitDB(`outbox-${counter++}`)
})

afterEach(async () => {
  vi.useRealTimers()
  await database.delete()
})

describe('the outbox', () => {
  it('put on cards records an entry', async () => {
    await database.cards.put(card('c1'))
    expect(await database.outbox.toArray()).toEqual([{ tbl: 'cards', id: 'c1', at: 1_000 }])
  })

  it("put on kv 'tour' records nothing, kv 'settings' records one", async () => {
    await database.kv.put({ key: 'tour', value: 'seen' })
    expect(await database.outbox.count()).toBe(0)
    await database.kv.put({ key: 'settings', value: { pomodoroFocus: 30 } })
    expect(await database.outbox.toArray()).toEqual([{ tbl: 'kv', id: 'settings', at: 1_000 }])
  })

  it('put on clips records nothing', async () => {
    await database.clips.put({ key: 'k', blob: new Blob(['x']), bytes: 1, usedAt: 1 })
    expect(await database.outbox.count()).toBe(0)
  })

  it('clear() on tasks records an entry per task', async () => {
    await database.tasks.bulkPut([task('t1'), task('t2'), task('t3')])
    vi.setSystemTime(2_000)
    await database.tasks.clear()
    expect((await database.outbox.toArray()).sort((x, y) => x.id.localeCompare(y.id))).toEqual([
      { tbl: 'tasks', id: 't1', at: 2_000 },
      { tbl: 'tasks', id: 't2', at: 2_000 },
      { tbl: 'tasks', id: 't3', at: 2_000 },
    ])
  })

  it('two puts on one card leave one entry with the later at', async () => {
    await database.cards.put(card('c1'))
    vi.setSystemTime(5_000)
    await database.cards.put(card('c1', 'Katze'))
    expect(await database.outbox.toArray()).toEqual([{ tbl: 'cards', id: 'c1', at: 5_000 }])
  })

  it("moves an entry's at forward even when the clock has not moved", async () => {
    await database.cards.put(card('c1'))
    await database.cards.put(card('c1', 'Katze'))
    expect((await database.outbox.get(['cards', 'c1']))?.at).toBe(1_001)
  })

  it('applyRemote writes record nothing', async () => {
    await applyRemote(database, async () => {
      await database.cards.put(card('c1'))
      await database.kv.put({ key: 'settings', value: {} })
      await database.tasks.bulkPut([task('t1')])
      await database.tasks.clear()
    })
    expect(await database.cards.count()).toBe(1)
    expect(await database.outbox.count()).toBe(0)
    // Writes after it record again.
    await database.cards.delete('c1')
    expect(await database.outbox.toArray()).toEqual([{ tbl: 'cards', id: 'c1', at: 1_000 }])
  })

  it('records deletes, updates and modify()', async () => {
    await applyRemote(database, () => database.cards.bulkPut([card('c1'), card('c2'), card('c3')]))
    await database.cards.delete('c1')
    await database.cards.update('c2', { german: 'Katze' })
    await database.cards.where('id').equals('c3').modify({ german: 'Maus' })
    expect((await database.outbox.toArray()).map((e) => e.id).sort()).toEqual(['c1', 'c2', 'c3'])
  })

  it('writes its entries in the same transaction, so an aborted write leaves none', async () => {
    await expect(
      database.transaction('rw', database.cards, async () => {
        await database.cards.put(card('c1'))
        throw new Error('changed my mind')
      }),
    ).rejects.toThrow('changed my mind')
    expect(await database.cards.count()).toBe(0)
    expect(await database.outbox.count()).toBe(0)
  })

  it('records inside an explicit transaction that does not name the outbox', async () => {
    await database.transaction('rw', database.cards, database.decks, async () => {
      await database.cards.put(card('c1'))
      await database.decks.delete('d9')
    })
    expect((await database.outbox.toArray()).map((e) => `${e.tbl}/${e.id}`).sort()).toEqual(['cards/c1', 'decks/d9'])
  })

  it('tells listeners about local changes, not remote ones', async () => {
    const seen: string[] = []
    const stop = onLocalChange((name) => seen.push(name))
    await applyRemote(database, () => database.cards.put(card('c1')))
    await database.kv.put({ key: 'tour', value: 'seen' })
    expect(seen).toEqual([])
    await database.cards.put(card('c2'))
    stop()
    await database.cards.put(card('c3'))
    expect(seen).toEqual([database.name])
  })
})
