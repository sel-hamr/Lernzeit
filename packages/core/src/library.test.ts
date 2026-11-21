import { describe, expect, it } from 'vitest'
import type { Library } from './fold'
import { createMemoryStore } from './library'
import { libraryStoreContract } from './library.contract'

libraryStoreContract('the memory store', async (seed: Library) => {
  const store = createMemoryStore(seed)
  return {
    store,
    // What is stored: the seed with every committed change, none of the staged ones.
    async reopen() {
      const stored = createMemoryStore(seed)
      for (const change of store.committed) {
        if (change.deleted) stored.remove(change.tbl, change.id)
        else stored.put(change.tbl, change.data as object)
      }
      return stored
    },
  }
})

const seed = {
  decks: [
    { id: 'd1', name: 'One', order: 0, archived: false },
    { id: 'd2', name: 'Two', order: 1, archived: true, topicId: 't1' },
  ],
  kv: [{ key: 'settings', value: { theme: 'dark' } }],
}

describe('createMemoryStore', () => {
  it('lists, gets and counts rows, with equality filters on top-level fields', async () => {
    const store = createMemoryStore(seed)
    expect((await store.list('decks')).map((d) => (d as { id: string }).id).sort()).toEqual(['d1', 'd2'])
    expect(await store.list('decks', { archived: true })).toEqual([seed.decks[1]])
    expect(await store.list('decks', { name: 'One', order: 0 })).toEqual([seed.decks[0]])
    expect(await store.list('decks', { topicId: null })).toEqual([seed.decks[0]])
    expect(await store.count('decks', { archived: false })).toBe(1)
    expect(await store.get('kv', 'settings')).toEqual({ key: 'settings', value: { theme: 'dark' } })
    expect(await store.get('cards', 'nope')).toBeUndefined()
    expect(store.timeZone).toBe('UTC')
  })

  it('reads staged writes before the commit, and commits them all at once', async () => {
    let now = 1000
    const store = createMemoryStore(seed, { timeZone: 'Europe/Berlin', now: () => now })
    store.put('decks', { id: 'd3', name: 'Three', order: 2, note: undefined })
    store.put('decks', { ...seed.decks[0], name: 'Uno' })
    store.remove('decks', 'd2')
    expect(await store.count('decks')).toBe(2)
    expect(await store.get('decks', 'd2')).toBeUndefined()
    expect(await store.list('decks', { name: 'One' })).toEqual([])
    expect(store.committed).toEqual([])

    now = 2000
    await store.commit()
    expect(store.committed).toEqual([
      { tbl: 'decks', id: 'd3', data: { id: 'd3', name: 'Three', order: 2 }, updatedAt: 2000, deleted: false },
      { tbl: 'decks', id: 'd1', data: { id: 'd1', name: 'Uno', order: 0, archived: false }, updatedAt: 2000, deleted: false },
      { tbl: 'decks', id: 'd2', data: null, updatedAt: 2000, deleted: true },
    ])
    await store.commit()
    expect(store.committed).toHaveLength(3)
  })

  it('keeps one change per record: the last write wins', async () => {
    const store = createMemoryStore()
    store.put('cards', { id: 'c1', german: 'a' })
    store.remove('cards', 'c1')
    store.put('kv', { key: 'settings', value: 1 })
    store.put('kv', { key: 'settings', value: 2 })
    await store.commit()
    expect(store.committed.map((c) => [c.tbl, c.id, c.deleted])).toEqual([
      ['cards', 'c1', true],
      ['kv', 'settings', false],
    ])
    expect(await store.get('kv', 'settings')).toEqual({ key: 'settings', value: 2 })
  })

  it('hands out copies, so changing a row does not change the store', async () => {
    const store = createMemoryStore(seed)
    const row = (await store.get<{ name: string }>('decks', 'd1'))!
    row.name = 'Changed'
    const put = { id: 'd9', name: 'Nine' }
    store.put('decks', put)
    put.name = 'Changed'
    expect(await store.get('decks', 'd1')).toMatchObject({ name: 'One' })
    expect(await store.get('decks', 'd9')).toMatchObject({ name: 'Nine' })
  })
})
