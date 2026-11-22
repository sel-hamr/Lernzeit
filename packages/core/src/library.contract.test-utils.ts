/*
 * Test code only: what every LibraryStore must do, written once and run
 * against each store (the memory store in core, the D1 store in the Worker)
 * so they behave the same way.
 */
import { describe, expect, it } from 'vitest'
import type { Library } from './fold'
import type { Filter, LibraryReader, LibraryStore } from './library'

export interface OpenedStore {
  store: LibraryStore
  /** A fresh reader over what is stored now: committed writes only. */
  reopen(): Promise<LibraryReader>
}

/** Opens a store over `seed`. Each call gets a library of its own. */
export type OpenStore = (seed: Library) => Promise<OpenedStore>

const seed = (): Library => ({
  decks: [
    { id: 'd1', name: 'One', order: 0, archived: false, topicId: 't1' },
    { id: 'd2', name: 'Two', order: 1, archived: true, topicId: 't1' },
    { id: 'd3', name: 'Three', order: 2, archived: false },
    { id: 'd4', name: 'Four', order: 3, archived: false, topicId: null },
  ],
  cards: [
    { id: 'c1', deckId: 'd1', german: 'Haus' },
    { id: 'c2', deckId: 'd1', german: 'Katze' },
    { id: 'c3', deckId: 'd2', german: "Sie's \"da\"" },
    // The same id as a deck: tables are separate.
    { id: 'd1', deckId: 'd3', german: 'Hund' },
  ],
  kv: [{ key: 'settings', value: { theme: 'dark' } }],
})

const ids = (rows: object[]) => rows.map((r) => (r as { id: string }).id).sort()

export function libraryStoreContract(name: string, open: OpenStore): void {
  describe(`${name}: the LibraryStore contract`, () => {
    it('lists, gets and counts the stored rows of one table', async () => {
      const { store } = await open(seed())
      expect(ids(await store.list('decks'))).toEqual(['d1', 'd2', 'd3', 'd4'])
      expect(ids(await store.list('cards'))).toEqual(['c1', 'c2', 'c3', 'd1'])
      expect(await store.list('tasks')).toEqual([])
      expect(await store.count('decks')).toBe(4)
      expect(await store.count('tasks')).toBe(0)
      expect(await store.get('decks', 'd1')).toEqual({ id: 'd1', name: 'One', order: 0, archived: false, topicId: 't1' })
      expect(await store.get('cards', 'd1')).toEqual({ id: 'd1', deckId: 'd3', german: 'Hund' })
      expect(await store.get('cards', 'nope')).toBeUndefined()
      expect(await store.get('kv', 'settings')).toEqual({ key: 'settings', value: { theme: 'dark' } })
    })

    it('filters on strings, numbers and booleans', async () => {
      const { store } = await open(seed())
      expect(ids(await store.list('cards', { deckId: 'd1' }))).toEqual(['c1', 'c2'])
      expect(ids(await store.list('cards', { german: "Sie's \"da\"" }))).toEqual(['c3'])
      expect(ids(await store.list('decks', { order: 0 }))).toEqual(['d1'])
      expect(ids(await store.list('decks', { order: 2 }))).toEqual(['d3'])
      expect(ids(await store.list('decks', { archived: true }))).toEqual(['d2'])
      expect(ids(await store.list('decks', { archived: false }))).toEqual(['d1', 'd3', 'd4'])
      expect(await store.count('cards', { deckId: 'd1' })).toBe(2)
      expect(await store.count('decks', { archived: false })).toBe(3)
    })

    it('matches a null filter to a missing field and to a null field', async () => {
      const { store } = await open(seed())
      expect(ids(await store.list('decks', { topicId: null }))).toEqual(['d3', 'd4'])
      expect(await store.count('decks', { topicId: null })).toBe(2)
      expect(ids(await store.list('cards', { imageId: null }))).toEqual(['c1', 'c2', 'c3', 'd1'])
    })

    it('needs every field of a filter to match, and type and value both', async () => {
      const { store } = await open(seed())
      expect(ids(await store.list('decks', { topicId: 't1', archived: false }))).toEqual(['d1'])
      expect(ids(await store.list('decks', { topicId: 't1', archived: false, order: 1 }))).toEqual([])
      expect(await store.list('cards', { deckId: 'nope' })).toEqual([])
      expect(await store.count('cards', { deckId: 'nope' })).toBe(0)
      expect(await store.list('decks', { order: '0' })).toEqual([])
      expect(await store.list('decks', { name: 'one' })).toEqual([])
    })

    it('lists only the ids of the matching rows, a kv row by its key, staged writes applied', async () => {
      const { store } = await open(seed())
      const sorted = async (ids: Promise<string[]>) => (await ids).sort()
      expect(await sorted(store.listIds('cards'))).toEqual(['c1', 'c2', 'c3', 'd1'])
      expect(await sorted(store.listIds('cards', { deckId: 'd1' }))).toEqual(['c1', 'c2'])
      expect(await sorted(store.listIds('decks', { topicId: null }))).toEqual(['d3', 'd4'])
      expect(await store.listIds('cards', { deckId: 'nope' })).toEqual([])
      expect(await store.listIds('kv')).toEqual(['settings'])

      store.put('cards', { id: 'c9', deckId: 'd1', german: 'Baum' })
      store.put('cards', { id: 'c2', deckId: 'd2', german: 'Katze' })
      store.remove('cards', 'c1')
      expect(await sorted(store.listIds('cards', { deckId: 'd1' }))).toEqual(['c9'])
      expect(await sorted(store.listIds('cards', { deckId: 'd2' }))).toEqual(['c2', 'c3'])
      expect(await sorted(store.listIds('cards'))).toEqual(['c2', 'c3', 'c9', 'd1'])
      await expect(store.listIds('cards', { deckId: undefined } as unknown as Filter)).rejects.toThrow(/undefined/)
    })

    it('refuses a filter value that is undefined or not a plain value', async () => {
      const { store } = await open(seed())
      const bad = [{ deckId: undefined }, { deckId: { id: 'd1' } }, { deckId: ['d1'] }] as unknown as Filter[]
      for (const filter of bad) {
        await expect(store.list('cards', filter)).rejects.toThrow(/deckId/)
        await expect(store.count('cards', filter)).rejects.toThrow(/deckId/)
      }
      // Also once the table has staged writes, which the overlay reads itself.
      store.put('cards', { id: 'c9', deckId: 'd1' })
      await expect(store.list('cards', bad[0])).rejects.toThrow(/undefined/)
      await expect(store.count('cards', bad[0])).rejects.toThrow(/undefined/)
    })

    it('commits the last write of each record, whatever came between', async () => {
      const { store, reopen } = await open(seed())
      store.put('cards', { id: 'c9', deckId: 'd1', german: 'Baum' })
      store.remove('decks', 'd2')
      store.put('cards', { id: 'c9', deckId: 'd2', german: 'Baum' })
      store.remove('cards', 'c1')
      store.put('decks', { id: 'd2', name: 'Zwei' })
      expect(ids(await store.list('cards', { deckId: 'd2' }))).toEqual(['c3', 'c9'])
      await store.commit()
      const stored = await reopen()
      expect(await stored.get('cards', 'c9')).toEqual({ id: 'c9', deckId: 'd2', german: 'Baum' })
      expect(await stored.get('decks', 'd2')).toEqual({ id: 'd2', name: 'Zwei' })
      expect(await stored.get('cards', 'c1')).toBeUndefined()
    })

    it('reads its staged writes at once, and stores none of them before the commit', async () => {
      const { store, reopen } = await open(seed())
      store.put('cards', { id: 'c9', deckId: 'd1', german: 'Baum' })
      store.put('decks', { id: 'd1', name: 'Uno', order: 0, archived: true })
      expect(ids(await store.list('cards', { deckId: 'd1' }))).toEqual(['c1', 'c2', 'c9'])
      expect(await store.count('cards', { deckId: 'd1' })).toBe(3)
      expect(await store.count('cards')).toBe(5)
      expect(await store.get('cards', 'c9')).toEqual({ id: 'c9', deckId: 'd1', german: 'Baum' })
      // The staged row replaces the stored one, in filtered reads too.
      expect(await store.get('decks', 'd1')).toEqual({ id: 'd1', name: 'Uno', order: 0, archived: true })
      expect(await store.list('decks', { name: 'One' })).toEqual([])
      expect(await store.count('decks', { topicId: 't1' })).toBe(1)
      expect(ids(await store.list('decks', { archived: true }))).toEqual(['d1', 'd2'])
      expect(ids(await store.list('decks', { topicId: null }))).toEqual(['d1', 'd3', 'd4'])

      const stored = await reopen()
      expect(await stored.get('cards', 'c9')).toBeUndefined()
      expect(await stored.get('decks', 'd1')).toMatchObject({ name: 'One' })
    })

    it('leaves a removed row out of every read, until it is put again', async () => {
      const { store } = await open(seed())
      store.remove('cards', 'c1')
      store.remove('cards', 'missing')
      expect(await store.get('cards', 'c1')).toBeUndefined()
      expect(ids(await store.list('cards', { deckId: 'd1' }))).toEqual(['c2'])
      expect(await store.count('cards', { deckId: 'd1' })).toBe(1)
      expect(await store.count('cards')).toBe(3)
      expect(await store.get('decks', 'd1')).toMatchObject({ name: 'One' })

      store.put('cards', { id: 'c1', deckId: 'd2', german: 'Haus' })
      expect(await store.get('cards', 'c1')).toEqual({ id: 'c1', deckId: 'd2', german: 'Haus' })
      expect(ids(await store.list('cards', { deckId: 'd2' }))).toEqual(['c1', 'c3'])
    })

    it('commits its puts and removes, and then has nothing staged', async () => {
      const { store, reopen } = await open(seed())
      store.put('cards', { id: 'c9', deckId: 'd1', german: 'Baum' })
      store.put('decks', { id: 'd1', name: 'Uno', order: 0, archived: false, topicId: 't1' })
      store.remove('cards', 'c2')
      store.put('kv', { key: 'settings', value: { theme: 'light' } })
      await store.commit()

      for (const reader of [store, await reopen()]) {
        expect(ids(await reader.list('cards', { deckId: 'd1' }))).toEqual(['c1', 'c9'])
        expect(await reader.count('cards')).toBe(4)
        expect(await reader.get('cards', 'c2')).toBeUndefined()
        expect(await reader.get('decks', 'd1')).toMatchObject({ name: 'Uno' })
        expect(await reader.get('kv', 'settings')).toEqual({ key: 'settings', value: { theme: 'light' } })
      }

      await store.commit()
      expect(ids(await (await reopen()).list('cards'))).toEqual(['c1', 'c3', 'c9', 'd1'])
    })

    it('stores a copy of a put row, without its undefined fields, and hands out copies', async () => {
      const { store, reopen } = await open(seed())
      const row = { id: 'c9', deckId: 'd1', german: 'Baum', note: undefined }
      store.put('cards', row)
      row.german = 'Changed'
      expect(await store.get('cards', 'c9')).toEqual({ id: 'c9', deckId: 'd1', german: 'Baum' })
      const read = (await store.get<{ german: string }>('cards', 'c1'))!
      read.german = 'Changed'
      expect(await store.get('cards', 'c1')).toMatchObject({ german: 'Haus' })

      await store.commit()
      expect(await (await reopen()).get('cards', 'c9')).toEqual({ id: 'c9', deckId: 'd1', german: 'Baum' })
    })
  })
}
