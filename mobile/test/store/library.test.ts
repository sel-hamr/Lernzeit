import type { SyncChange } from '@lernzeit/core/sync'
import { SCHEMA_VERSION } from '../../src/store/db'
import { createLocalLibrary, type ChangeEvent, type LocalLibrary } from '../../src/store/library'
import { nodeSqliteAdapter } from './nodeSqlite'

/** A library over a fresh in-memory database, its clock under the test's control. */
function open(start = 1000) {
  let clock = start
  const adapter = nodeSqliteAdapter()
  const library = createLocalLibrary(adapter, { now: () => clock })
  return {
    adapter,
    library,
    tick: (ms = 1) => (clock += ms),
    setClock: (ms: number) => (clock = ms),
  }
}

const change = (tbl: SyncChange['tbl'], id: string, data: object | null, updatedAt: number): SyncChange => ({ tbl, id, data, updatedAt, deleted: data === null })

/** Collects every change event the library sends. */
function events(library: LocalLibrary, tables: Parameters<LocalLibrary['subscribe']>[0]) {
  const seen: ChangeEvent[] = []
  library.subscribe(tables, (event) => seen.push(event))
  return seen
}
const topics = (event: ChangeEvent) => [...event.tables].sort()

describe('the local library', () => {
  it('reads back what it wrote, as the JSON the cloud syncs', () => {
    const { library } = open()
    library.put('decks', { id: 'd1', name: 'One', archived: false, note: undefined })
    library.put('cards', { id: 'c1', deckId: 'd1', german: 'Haus' })
    library.put('kv', { key: 'settings', value: { theme: 'dark' } })
    expect(library.get('decks', 'd1')).toEqual({ id: 'd1', name: 'One', archived: false })
    expect(library.get('kv', 'settings')).toEqual({ key: 'settings', value: { theme: 'dark' } })
    expect(library.list('cards', { deckId: 'd1' })).toEqual([{ id: 'c1', deckId: 'd1', german: 'Haus' }])
    expect(library.listIds('kv')).toEqual(['settings'])
    expect(library.count('decks', { archived: false })).toBe(1)
    expect(library.get('decks', 'nope')).toBeUndefined()
  })

  it('filters on the JSON type as well as the value', () => {
    const { library } = open()
    library.put('decks', { id: 'a', order: 1, archived: true, name: '1' })
    library.put('decks', { id: 'b', order: '1', archived: 1, name: { first: '1' } })
    expect(library.listIds('decks', { order: 1 })).toEqual(['a'])
    expect(library.listIds('decks', { order: '1' })).toEqual(['b'])
    expect(library.listIds('decks', { archived: true })).toEqual(['a'])
    expect(library.listIds('decks', { archived: 1 })).toEqual(['b'])
    expect(library.listIds('decks', { name: '1' })).toEqual(['a'])
    expect(library.listIds('decks', { name: '{"first":"1"}' })).toEqual([])
    expect(() => library.list('decks', { "name') OR 1=1 --": 'x' })).toThrow(/field/)
    expect(() => library.list('decks', { name: undefined } as never)).toThrow(/undefined/)
  })

  it('creates its tables once and records the schema version', () => {
    const { adapter } = open()
    expect(adapter.get<{ user_version: number }>('PRAGMA user_version')).toEqual({ user_version: SCHEMA_VERSION })
    const again = createLocalLibrary(adapter)
    expect(again.outbox()).toEqual([])
  })
})

describe('the outbox', () => {
  it('records a put with the clock as its stamp', () => {
    const { library } = open(5000)
    library.put('decks', { id: 'd1', name: 'One' })
    expect(library.outbox()).toEqual([{ tbl: 'decks', id: 'd1', at: 5000 }])
    expect(library.outboxEntry('decks', 'd1')).toEqual({ tbl: 'decks', id: 'd1', at: 5000 })
    expect(library.outboxSize()).toBe(1)
  })

  it('keeps one entry per record with the later stamp, even when the clock has not moved', () => {
    const { library, tick, setClock } = open(5000)
    library.put('decks', { id: 'd1', name: 'One' })
    library.put('decks', { id: 'd1', name: 'Uno' })
    expect(library.outbox()).toEqual([{ tbl: 'decks', id: 'd1', at: 5001 }])
    tick(100)
    library.put('decks', { id: 'd1', name: 'Eins' })
    expect(library.outbox()).toEqual([{ tbl: 'decks', id: 'd1', at: 5100 }])
    setClock(10) // The clock went back.
    library.put('decks', { id: 'd1', name: 'Ein' })
    expect(library.outbox()).toEqual([{ tbl: 'decks', id: 'd1', at: 5101 }])
  })

  it('records a remove as an entry with no row behind it, which the push sends as a tombstone', () => {
    const { library, tick } = open(5000)
    library.put('cards', { id: 'c1', deckId: 'd1' })
    tick()
    library.remove('cards', 'c1')
    expect(library.get('cards', 'c1')).toBeUndefined()
    expect(library.outbox()).toEqual([{ tbl: 'cards', id: 'c1', at: 5001 }])
    // A record never stored is still deleted in the cloud: another device may have it.
    library.remove('cards', 'elsewhere')
    expect(library.outboxEntry('cards', 'elsewhere')).toEqual({ tbl: 'cards', id: 'elsewhere', at: 5001 })
  })

  it('records only the kv keys that sync; device-only keys stay on this phone', () => {
    const { library } = open()
    library.put('kv', { key: 'settings', value: {} })
    library.put('kv', { key: 'timeZone', value: 'Europe/Berlin' })
    library.put('kv', { key: 'lastSyncAt', value: 1 })
    library.remove('kv', 'deviceOnly')
    expect(library.outbox().map((e) => `${e.tbl}/${e.id}`).sort()).toEqual(['kv/settings', 'kv/timeZone'])
    expect(library.get('kv', 'lastSyncAt')).toEqual({ key: 'lastSyncAt', value: 1 })
  })

  it('writes nothing, the record or its entry, when the write fails', () => {
    const { library } = open()
    library.put('decks', { id: 'd1', name: 'One' })
    library.acknowledge(library.outbox())
    expect(() =>
      library.write(() => {
        library.put('decks', { id: 'd1', name: 'Uno' })
        library.put('cards', { id: 'c1', deckId: 'd1' })
        throw new Error('stop')
      }),
    ).toThrow('stop')
    expect(library.get('decks', 'd1')).toEqual({ id: 'd1', name: 'One' })
    expect(library.get('cards', 'c1')).toBeUndefined()
    expect(library.outbox()).toEqual([])
  })

  it('undoes only a nested write that failed, when its caller goes on', () => {
    const { library } = open()
    library.write(() => {
      library.put('decks', { id: 'd1' })
      try {
        library.write(() => {
          library.put('decks', { id: 'd2' })
          throw new Error('inner')
        })
      } catch {
        // The caller carries on without d2.
      }
    })
    expect(library.listIds('decks')).toEqual(['d1'])
    expect(library.outbox().map((e) => e.id)).toEqual(['d1'])
  })

  it('refuses a row without its id, and an async write', () => {
    const { library } = open()
    expect(() => library.put('decks', { name: 'No id' })).toThrow(/id/)
    expect(() => library.put('kv', { value: 1 })).toThrow(/key/)
    expect(() => library.write((() => Promise.resolve()) as never)).toThrow(/synchronous/)
    expect(() => library.applyRemote((() => Promise.resolve()) as never)).toThrow(/synchronous/)
    expect(library.outbox()).toEqual([])
  })

  it('removes acknowledged entries, but keeps one written again while its push was in flight', () => {
    const { library, tick } = open(5000)
    library.put('decks', { id: 'd1', name: 'One' })
    library.put('decks', { id: 'd2', name: 'Two' })
    const pushed = library.outbox()
    tick()
    library.put('decks', { id: 'd2', name: 'Zwei' })
    library.acknowledge(pushed)
    expect(library.outbox()).toEqual([{ tbl: 'decks', id: 'd2', at: 5001 }])
  })

  it('parks a refused entry with its reason, and a rewrite or unpark takes the mark off', () => {
    const { library, tick } = open(5000)
    library.put('docs', { id: 'big', title: 'Big' })
    library.put('docs', { id: 'small', title: 'Small' })
    const [big, small] = library.outbox()
    library.park([{ entry: big, reason: 'Too large' }])
    expect(library.outboxEntry('docs', 'big')).toEqual({ tbl: 'docs', id: 'big', at: big.at, stuck: 'Too large' })

    // A park of an entry written again meanwhile leaves the new write unparked.
    tick()
    library.put('docs', { id: 'small', title: 'Smaller' })
    library.park([{ entry: small, reason: 'Too large' }])
    expect(library.outboxEntry('docs', 'small')?.stuck).toBeUndefined()

    tick()
    library.put('docs', { id: 'big', title: 'Big, shorter' })
    expect(library.outboxEntry('docs', 'big')?.stuck).toBeUndefined()
    library.park([{ entry: library.outboxEntry('docs', 'big')!, reason: 'Still too large' }])
    library.unpark()
    expect(library.outbox().every((entry) => entry.stuck === undefined)).toBe(true)
  })

  it('lists the outbox oldest first', () => {
    const { library, tick } = open(5000)
    library.put('decks', { id: 'b', name: 'B' })
    tick()
    library.put('cards', { id: 'a', deckId: 'b' })
    tick()
    library.put('decks', { id: 'a', name: 'A' })
    expect(library.outbox().map((e) => e.id)).toEqual(['b', 'a', 'a'])
    expect(library.outbox().map((e) => e.tbl)).toEqual(['decks', 'cards', 'decks'])
  })
})

describe('applyRemote', () => {
  it('writes pulled changes without recording them', () => {
    const { library } = open()
    const applied = library.applyRemote((remote) => {
      remote.apply(change('decks', 'd1', { id: 'd1', name: 'From the cloud' }, 7000))
      remote.apply(change('kv', 'settings', { key: 'settings', value: { theme: 'dark' } }, 7000))
      // A plain write inside applyRemote is not recorded either.
      library.put('cards', { id: 'c1', deckId: 'd1' })
      return 'done'
    })
    expect(applied).toBe('done')
    expect(library.get('decks', 'd1')).toEqual({ id: 'd1', name: 'From the cloud' })
    expect(library.get('cards', 'c1')).toEqual({ id: 'c1', deckId: 'd1' })
    expect(library.outbox()).toEqual([])
  })

  it('deletes a record for a pulled tombstone, without recording it', () => {
    const { library } = open()
    library.put('decks', { id: 'd1', name: 'One' })
    library.acknowledge(library.outbox())
    library.applyRemote((remote) => remote.apply(change('decks', 'd1', null, 8000)))
    expect(library.get('decks', 'd1')).toBeUndefined()
    expect(library.outbox()).toEqual([])
  })

  it('keeps the record time of each change, the clock for local writes and the cloud’s for pulled ones', () => {
    const { library } = open(5000)
    library.put('decks', { id: 'd1', name: 'One' })
    library.applyRemote((remote) => remote.apply(change('decks', 'd2', { id: 'd2', name: 'Two' }, 7000)))
    expect(library.updatedAt('decks', 'd1')).toBe(5000)
    expect(library.updatedAt('decks', 'd2')).toBe(7000)
    expect(library.updatedAt('decks', 'nope')).toBeUndefined()
  })

  it('records local writes again once it is over, and after it failed', () => {
    const { library } = open()
    expect(() =>
      library.applyRemote((remote) => {
        remote.apply(change('decks', 'd1', { id: 'd1' }, 1))
        throw new Error('bad page')
      }),
    ).toThrow('bad page')
    expect(library.get('decks', 'd1')).toBeUndefined()
    library.put('decks', { id: 'd2' })
    expect(library.outbox().map((e) => e.id)).toEqual(['d2'])
  })

  it('applies the cursor and outbox changes of a page in the same transaction', () => {
    const { library } = open()
    library.put('decks', { id: 'd1', name: 'Local' })
    expect(() =>
      library.applyRemote((remote) => {
        remote.apply(change('decks', 'd1', { id: 'd1', name: 'Cloud' }, 9000))
        library.removeOutboxEntry('decks', 'd1')
        library.setMeta('cursor', 'abc')
        throw new Error('killed')
      }),
    ).toThrow('killed')
    expect(library.get('decks', 'd1')).toEqual({ id: 'd1', name: 'Local' })
    expect(library.outboxSize()).toBe(1)
    expect(library.getMeta('cursor')).toBeUndefined()
  })
})

describe('meta and image files', () => {
  it('keeps JSON values by key, not synced and not in the outbox', () => {
    const { library } = open()
    library.setMeta('cursor', 'c-1')
    library.setMeta('missingImages', [{ id: 'i1' }])
    expect(library.getMeta('cursor')).toBe('c-1')
    expect(library.getMeta('missingImages')).toEqual([{ id: 'i1' }])
    library.removeMeta('cursor')
    expect(library.getMeta('cursor')).toBeUndefined()
    expect(library.outbox()).toEqual([])
  })

  it('keeps where each image file is, apart from the synced image records', () => {
    const { library } = open()
    const file = { id: 'i1', path: 'file:///images/i1.webp', type: 'image/webp', width: 40, height: 30, fit: 'cover' as const }
    library.putImageFile(file)
    expect(library.imageFile('i1')).toEqual(file)
    expect(library.imageFiles()).toEqual([file])
    expect(library.get('images', 'i1')).toBeUndefined()
    expect(library.outbox()).toEqual([])
    library.removeImageFile('i1')
    expect(library.imageFile('i1')).toBeUndefined()
  })
})

describe('change events', () => {
  it('tells the subscribers of a table after each committed write, once per transaction', () => {
    const { library } = open()
    const decks = events(library, ['decks'])
    const cards = events(library, ['cards'])
    library.write(() => {
      library.put('decks', { id: 'd1' })
      library.put('decks', { id: 'd2' })
      library.remove('cards', 'c1')
      // Not yet: the transaction has not committed.
      expect(decks).toEqual([])
    })
    expect(decks.map(topics)).toEqual([['cards', 'decks', 'outbox']])
    expect(decks[0].local).toBe(true)
    expect(cards).toHaveLength(1)
  })

  it('does not tell the subscribers of other tables', () => {
    const { library } = open()
    const tasks = events(library, ['tasks', 'stories'])
    library.put('decks', { id: 'd1' })
    library.setMeta('cursor', 'x')
    expect(tasks).toEqual([])
  })

  it('sends nothing for a write that failed', () => {
    const { library } = open()
    const decks = events(library, ['decks'])
    expect(() =>
      library.write(() => {
        library.put('decks', { id: 'd1' })
        throw new Error('stop')
      }),
    ).toThrow()
    expect(decks).toEqual([])
  })

  it('marks pulled changes as not local, and names the outbox, meta and image files when they change', () => {
    const { library } = open()
    const seen = events(library, ['decks', 'outbox', 'meta', 'imageFiles'])
    library.applyRemote((remote) => {
      remote.apply(change('decks', 'd1', { id: 'd1' }, 1))
      library.setMeta('cursor', 'x')
    })
    library.putImageFile({ id: 'i1', path: 'p', type: 'image/png', width: 1, height: 1, fit: 'contain' })
    library.acknowledge([])
    expect(seen.map((e) => [topics(e), e.local])).toEqual([
      [['decks', 'meta'], false],
      [['imageFiles'], false],
    ])
  })

  it('stops telling a subscriber once it unsubscribed', () => {
    const { library } = open()
    const seen: ChangeEvent[] = []
    const unsubscribe = library.subscribe(['decks'], (event) => seen.push(event))
    unsubscribe()
    library.put('decks', { id: 'd1' })
    expect(seen).toEqual([])
  })
})

describe('nested writes', () => {
  /** A library whose SQL fails the next statement that starts with `prefix`, once `fail` is set. */
  function failing(prefix: string) {
    const adapter = nodeSqliteAdapter()
    let fail = false
    const run: typeof adapter.run = (sql, params) => {
      if (fail && sql.startsWith(prefix)) {
        fail = false
        throw new Error('disk full')
      }
      adapter.run(sql, params)
    }
    const library = createLocalLibrary({ ...adapter, run }, { now: () => 1000 })
    return { library, failNext: () => (fail = true) }
  }

  it('undoes the whole of a put whose record failed, when the caller goes on', () => {
    const { library, failNext } = failing('INSERT INTO records')
    library.write(() => {
      failNext()
      expect(() => library.put('decks', { id: 'd1' })).toThrow('disk full')
      library.put('decks', { id: 'd2' })
    })
    expect(library.listIds('decks')).toEqual(['d2'])
    expect(library.outbox().map((e) => e.id)).toEqual(['d2'])
  })

  it('undoes the whole of a remove whose entry failed, when the caller goes on', () => {
    const { library, failNext } = failing('INSERT INTO outbox')
    library.put('decks', { id: 'd1' })
    library.acknowledge(library.outbox())
    library.write(() => {
      failNext()
      expect(() => library.remove('decks', 'd1')).toThrow('disk full')
    })
    expect(library.get('decks', 'd1')).toEqual({ id: 'd1' })
    expect(library.outbox()).toEqual([])
  })

  it('tells no one of the writes a failed nested write undid', () => {
    const { library } = open()
    const seen = events(library, ['decks', 'cards', 'outbox', 'meta'])
    library.write(() => {
      library.setMeta('cursor', 'x')
      try {
        library.write(() => {
          library.put('cards', { id: 'c1' })
          throw new Error('inner')
        })
      } catch {
        // Carries on without c1.
      }
    })
    expect(seen.map((e) => [topics(e), e.local])).toEqual([[['meta'], false]])
  })
})

describe('the schema', () => {
  it('keeps records in a rowid table, as rows of large JSON should be', () => {
    const { adapter } = open()
    const records = adapter.get<{ sql: string }>("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'records'")
    expect(records?.sql).not.toMatch(/WITHOUT ROWID/i)
  })
})

describe('deleting an image', () => {
  const file = { id: 'i1', path: 'file:///images/i1', type: 'image/png', width: 4, height: 3, fit: 'cover' as const }
  const meta = { id: 'i1', type: 'image/png', width: 4, height: 3, fit: 'cover' }

  function withImage() {
    const removed: string[][] = []
    const library = createLocalLibrary(nodeSqliteAdapter(), { now: () => 1000, onImageFilesRemoved: (files) => removed.push(files.map((f) => f.path)) })
    library.applyRemote((remote) => remote.apply(change('images', 'i1', meta, 1)))
    library.putImageFile(file)
    return { library, removed }
  }

  it('removes its file row and hands its file over for deleting, after a local delete commits', () => {
    const { library, removed } = withImage()
    library.write(() => {
      library.remove('images', 'i1')
      expect(removed).toEqual([])
    })
    expect(library.imageFile('i1')).toBeUndefined()
    expect(removed).toEqual([['file:///images/i1']])
    expect(library.outboxEntry('images', 'i1')).toMatchObject({ tbl: 'images', id: 'i1' })
  })

  it('does the same for a pulled tombstone', () => {
    const { library, removed } = withImage()
    library.applyRemote((remote) => remote.apply(change('images', 'i1', null, 2)))
    expect(library.imageFile('i1')).toBeUndefined()
    expect(removed).toEqual([['file:///images/i1']])
  })

  it('keeps the file when the delete is undone', () => {
    const { library, removed } = withImage()
    expect(() =>
      library.write(() => {
        library.remove('images', 'i1')
        throw new Error('stop')
      }),
    ).toThrow('stop')
    library.write(() => {
      try {
        library.write(() => {
          library.remove('images', 'i1')
          throw new Error('inner')
        })
      } catch {
        // Carries on with the image.
      }
    })
    expect(library.imageFile('i1')).toEqual(file)
    expect(removed).toEqual([])
  })
})
