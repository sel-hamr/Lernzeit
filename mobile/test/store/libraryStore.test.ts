import type { Library } from '@lernzeit/core/fold'
import { libraryStoreContract } from '@lernzeit/core/library.contract.test-utils'
import type { SyncTable } from '@lernzeit/core/sync'
import { createLocalLibrary, type LocalLibrary } from '../../src/store/library'
import { createPhoneLibraryStore } from '../../src/store/libraryStore'
import { nodeSqliteAdapter } from './nodeSqlite'

/** A library holding `seed` as if it had been pulled: nothing in the outbox. */
function seeded(seed: Library, now?: () => number): LocalLibrary {
  const library = createLocalLibrary(nodeSqliteAdapter(), { now })
  library.applyRemote((remote) => {
    for (const [tbl, rows] of Object.entries(seed) as [SyncTable, Record<string, unknown>[]][]) {
      for (const row of rows) remote.apply({ tbl, id: String(tbl === 'kv' ? row.key : row.id), data: row, updatedAt: 1, deleted: false })
    }
  })
  return library
}

libraryStoreContract('the phone store', async (seed) => {
  const library = seeded(seed)
  return { store: createPhoneLibraryStore(library), reopen: async () => createPhoneLibraryStore(library) }
})

describe('the phone LibraryStore', () => {
  it('commits as local writes: one transaction, each record in the outbox, one change event', () => {
    const library = seeded({ decks: [{ id: 'd1', name: 'One' }] }, () => 5000)
    const store = createPhoneLibraryStore(library)
    const events: string[][] = []
    library.subscribe(['decks', 'cards'], (event) => events.push([...event.tables].sort()))
    store.put('cards', { id: 'c1', deckId: 'd1' })
    store.remove('decks', 'd1')
    store.put('kv', { key: 'phoneOnly', value: 1 })
    expect(library.outbox()).toEqual([])
    return store.commit().then(() => {
      expect(library.outbox().map((e) => `${e.tbl}/${e.id}@${e.at}`).sort()).toEqual(['cards/c1@5000', 'decks/d1@5000'])
      expect(library.get('kv', 'phoneOnly')).toEqual({ key: 'phoneOnly', value: 1 })
      expect(events).toEqual([['cards', 'decks', 'kv', 'outbox']])
    })
  })

  it('drops its staged writes when a commit fails, and stores none of them', async () => {
    const library = seeded({})
    const store = createPhoneLibraryStore(library)
    store.put('decks', { id: 'd1', name: 'One' })
    store.put('decks', { name: 'No id' })
    await expect(store.commit()).rejects.toThrow(/id/)
    expect(library.get('decks', 'd1')).toBeUndefined()
    expect(await store.get('decks', 'd1')).toBeUndefined()
    expect(library.outbox()).toEqual([])
  })

  it('takes its clock from the library and the time zone from its options, else this phone’s', () => {
    const library = seeded({}, () => 42)
    expect(createPhoneLibraryStore(library).now()).toBe(42)
    expect(createPhoneLibraryStore(library, { timeZone: 'Europe/Berlin' }).timeZone).toBe('Europe/Berlin')
    expect(createPhoneLibraryStore(library).timeZone).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone)
  })
})

describe('the phone LibraryStore reads', () => {
  it('only the kv keys that sync, as the D1 store holds them', async () => {
    const library = seeded({ kv: [{ key: 'settings', value: {} }] })
    library.put('kv', { key: 'lastSyncAt', value: 1 })
    const store = createPhoneLibraryStore(library)
    expect(await store.get('kv', 'lastSyncAt')).toBeUndefined()
    expect(await store.get('kv', 'settings')).toEqual({ key: 'settings', value: {} })
    expect(await store.list('kv')).toEqual([{ key: 'settings', value: {} }])
    expect(await store.listIds('kv')).toEqual(['settings'])
    expect(await store.count('kv')).toBe(1)
  })
})
