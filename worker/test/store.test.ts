import { env } from 'cloudflare:workers'
import type { Library } from '@lernzeit/core/fold'
import type { Filter } from '@lernzeit/core/library'
import type { SyncTable } from '@lernzeit/core/sync'
import { libraryStoreContract } from '@lernzeit/core/library.contract.test-utils'
import { beforeEach, describe, expect, it } from 'vitest'
import { createD1Store, whereClause } from '../src/store.ts'
import { clearSyncData, countingDb, seedLibrary } from './helpers.ts'

let owners = 0
/** Each store gets an owner of its own, so tests never see each other's records. */
const freshOwner = () => `store-owner-${++owners}`

libraryStoreContract('the D1 store', async (seed: Library) => {
  const owner = freshOwner()
  await seedLibrary(owner, seed)
  return { store: await createD1Store(env.DB, owner), reopen: () => createD1Store(env.DB, owner) }
})

interface StoredRow {
  tbl: string
  id: string
  data: string | null
  updated_at: number
  deleted: number
  seq: number
}

const storedRows = async (owner: string) =>
  (await env.DB.prepare('SELECT tbl, id, data, updated_at, deleted, seq FROM records WHERE owner = ? ORDER BY tbl, id').bind(owner).all<StoredRow>()).results

const counter = async (owner: string) =>
  (await env.DB.prepare('SELECT seq FROM counters WHERE owner = ?').bind(owner).first<{ seq: number }>())?.seq

beforeEach(async () => {
  await clearSyncData()
})

describe('createD1Store', () => {
  it('commits every staged change at once, stamped with the server time and one seq', async () => {
    const owner = freshOwner()
    await seedLibrary(owner, { decks: [{ id: 'd1', name: 'One' }], cards: [{ id: 'c1', deckId: 'd1' }] })
    const store = await createD1Store(env.DB, owner, { now: () => 5000 })
    store.put('cards', { id: 'c2', deckId: 'd1' })
    store.put('decks', { id: 'd1', name: 'Uno' })
    store.remove('cards', 'c1')
    await store.commit()

    expect(await counter(owner)).toBe(2)
    expect(await storedRows(owner)).toEqual([
      { tbl: 'cards', id: 'c1', data: null, updated_at: 5000, deleted: 1, seq: 2 },
      { tbl: 'cards', id: 'c2', data: '{"id":"c2","deckId":"d1"}', updated_at: 5000, deleted: 0, seq: 2 },
      { tbl: 'decks', id: 'd1', data: '{"id":"d1","name":"Uno"}', updated_at: 5000, deleted: 0, seq: 2 },
    ])
  })

  it('stamps with Date.now() unless told otherwise, and hands out that clock', async () => {
    const owner = freshOwner()
    const store = await createD1Store(env.DB, owner)
    const before = Date.now()
    expect(store.now()).toBeGreaterThanOrEqual(before)
    store.put('decks', { id: 'd1', name: 'One' })
    await store.commit()
    const [row] = await storedRows(owner)
    expect(row.updated_at).toBeGreaterThanOrEqual(before)
    expect(row.updated_at).toBeLessThanOrEqual(Date.now())
  })

  it('makes no write when nothing is staged', async () => {
    const owner = freshOwner()
    const store = await createD1Store(env.DB, owner)
    await store.commit()
    expect(await counter(owner)).toBeUndefined()
    expect(await storedRows(owner)).toEqual([])
  })

  it('does not write a newer stored record over with an older stamp', async () => {
    const owner = freshOwner()
    await seedLibrary(owner, { decks: [{ id: 'd1', name: 'Newer' }] }, 9000)
    const store = await createD1Store(env.DB, owner, { now: () => 5000 })
    store.put('decks', { id: 'd1', name: 'Older' })
    await store.commit()
    expect(await store.get('decks', 'd1')).toEqual({ id: 'd1', name: 'Newer' })
  })

  it('drops its staged writes when a commit fails, so a later commit cannot write them', async () => {
    const owner = freshOwner()
    const store = await createD1Store(env.DB, owner, { now: () => 5000 })
    store.put('decks', { id: 'd1', name: 'One' })
    store.put('docs', { id: 'big', title: 'Big', body: 'x'.repeat(1_100_000) })
    await expect(store.commit()).rejects.toThrow(/docs\/big.*over/)
    expect(await store.get('decks', 'd1')).toBeUndefined()
    expect(await store.count('docs')).toBe(0)
    await store.commit()
    expect(await counter(owner)).toBeUndefined()

    store.put('decks', { id: 'd2', name: 'Two' })
    await store.commit()
    expect((await storedRows(owner)).map((r) => r.id)).toEqual(['d2'])
  })

  it('reads only its owner’s live records', async () => {
    const owner = freshOwner()
    const other = freshOwner()
    await seedLibrary(owner, { decks: [{ id: 'd1', name: 'Mine' }] })
    await seedLibrary(other, { decks: [{ id: 'd1', name: 'Theirs' }, { id: 'd2', name: 'Theirs too' }] })
    const removing = await createD1Store(env.DB, owner)
    removing.remove('decks', 'd1')
    await removing.commit()
    await seedLibrary(owner, { decks: [{ id: 'd3', name: 'Mine too' }] }, 1)

    const store = await createD1Store(env.DB, owner)
    expect(await store.list('decks')).toEqual([{ id: 'd3', name: 'Mine too' }])
    expect(await store.get('decks', 'd1')).toBeUndefined()
    expect(await store.get('decks', 'd2')).toBeUndefined()
    expect(await store.count('decks')).toBe(1)
  })

  it('refuses to filter on a field name that is not plain letters and digits', async () => {
    const owner = freshOwner()
    await seedLibrary(owner, { decks: [{ id: 'd1', name: 'One' }] })
    const store = await createD1Store(env.DB, owner)
    for (const field of ["name') OR 1=1 --", 'a.b', '$.name', '', '1name', 'na me', 'name"']) {
      await expect(store.list('decks', { [field]: 'One' })).rejects.toThrow(/field/)
      await expect(store.count('decks', { [field]: 'One' })).rejects.toThrow(/field/)
    }
    expect(await store.list('decks', { name2: null })).toHaveLength(1)
  })

  it('sends the reads asked for together to D1 as one batch', async () => {
    const owner = freshOwner()
    await seedLibrary(owner, {
      decks: Array.from({ length: 60 }, (_, i) => ({ id: `d${i}`, name: `Deck ${i}` })),
      cards: Array.from({ length: 120 }, (_, i) => ({ id: `c${i}`, deckId: `d${i % 60}` })),
    })
    const { db, queries: counted } = countingDb()
    const store = await createD1Store(db, owner)
    expect(counted()).toBe(1) // the settings

    const counts = await Promise.all(Array.from({ length: 60 }, (_, i) => store.count('cards', { deckId: `d${i}` })))
    expect(counts).toEqual(Array(60).fill(2))
    const [decks, card] = await Promise.all([store.list('decks'), store.get('cards', 'c7'), store.count('topics')])
    expect(decks).toHaveLength(60)
    expect(card).toEqual({ id: 'c7', deckId: 'd7' })
    expect(counted()).toBe(3)
  })

  it('fails every read of a batch when D1 fails it', async () => {
    const owner = freshOwner()
    let calls = 0
    const failing = {
      prepare: (sql: string) => env.DB.prepare(sql),
      batch: (statements: D1PreparedStatement[]) => (++calls === 1 ? env.DB.batch(statements) : Promise.reject(new Error('D1 is down'))),
    } as unknown as D1Database
    const store = await createD1Store(failing, owner)
    const results = await Promise.allSettled([store.list('decks'), store.get('cards', 'c1'), store.count('topics')])
    expect(results.map((r) => r.status === 'rejected' && (r.reason as Error).message)).toEqual(['D1 is down', 'D1 is down', 'D1 is down'])
  })
})

describe('createD1Store time zone', () => {
  const zone = (value: unknown) => ({ kv: [{ key: 'timeZone', value }] })

  it('reads the owner’s time zone from its own synced record, kv/timeZone', async () => {
    const owner = freshOwner()
    await seedLibrary(owner, { kv: [{ key: 'timeZone', value: 'Europe/Berlin' }, { key: 'settings', value: { theme: 'dark', timeZone: 'Asia/Tokyo' } }] })
    expect((await createD1Store(env.DB, owner)).timeZone).toBe('Europe/Berlin')
  })

  it('falls back to UTC when no time zone is set, whatever the settings say', async () => {
    const owner = freshOwner()
    expect((await createD1Store(env.DB, owner)).timeZone).toBe('UTC')
    await seedLibrary(owner, { kv: [{ key: 'settings', value: { theme: 'dark', timeZone: 'Europe/Berlin' } }] })
    expect((await createD1Store(env.DB, owner)).timeZone).toBe('UTC')
  })

  it('falls back to UTC when the time zone is not one Intl knows', async () => {
    for (const timeZone of ['Mars/Olympus', '', 42, null, { zone: 'Europe/Berlin' }]) {
      const owner = freshOwner()
      await seedLibrary(owner, zone(timeZone))
      expect((await createD1Store(env.DB, owner)).timeZone).toBe('UTC')
    }
  })

  it('falls back to UTC when the time zone was deleted', async () => {
    const owner = freshOwner()
    await seedLibrary(owner, zone('Europe/Berlin'))
    const store = await createD1Store(env.DB, owner)
    store.remove('kv', 'timeZone')
    await store.commit()
    expect((await createD1Store(env.DB, owner)).timeZone).toBe('UTC')
  })
})

describe('the D1 store’s indexes', () => {
  /** SQLite's plan for a store read: one line per step. */
  async function plan(select: string, tbl: SyncTable, filter: Filter): Promise<string[]> {
    const where = whereClause('owner', tbl, filter)
    const rows = await env.DB.prepare(`EXPLAIN QUERY PLAN ${select} FROM records WHERE ${where.sql}`).bind(...where.params).all<{ detail: string }>()
    return rows.results.map((row) => row.detail)
  }

  // Every filter the tool actions read by (packages/core/src/actions), and its index in migrations/0002_json_indexes.sql.
  const indexed: [SyncTable, string, string][] = [
    ['cards', 'deckId', 'records_cards_deck_id'],
    ['cards', 'imageId', 'records_cards_image_id'],
    ['reviews', 'cardId', 'records_reviews_card_id'],
    ['reviewLogs', 'cardId', 'records_review_logs_card_id'],
    ['drillStats', 'cardId', 'records_drill_stats_card_id'],
    ['docFolders', 'parentId', 'records_doc_folders_parent_id'],
    ['docs', 'folderId', 'records_docs_folder_id'],
    ['tasks', 'status', 'records_tasks_status'],
  ]

  it('looks a filtered read up in its index instead of scanning the table', async () => {
    for (const [tbl, field, index] of indexed) {
      for (const select of ['SELECT data', 'SELECT COUNT(*) AS n']) {
        for (const value of ['x', null]) {
          const steps = await plan(select, tbl, { [field]: value })
          expect(steps, `${select} ${tbl}.${field} = ${value}`).toEqual([`SEARCH records USING INDEX ${index} (owner=? AND <expr>=?)`])
        }
      }
    }
  })

  it('shows the plan for a card’s reviews', async () => {
    expect(await plan('SELECT data', 'reviews', { cardId: 'c1' })).toEqual(['SEARCH records USING INDEX records_reviews_card_id (owner=? AND <expr>=?)'])
  })

  it('refuses a table it does not know, as the table goes into the SQL', () => {
    expect(() => whereClause('owner', "cards' OR 1=1 --" as SyncTable)).toThrow(/table/)
  })
})

describe('countingDb', () => {
  it('counts statements run on their own as well as batches', async () => {
    const { db, queries } = countingDb()
    await db.prepare('SELECT 1').first()
    await db.prepare('SELECT ?1').bind(1).all()
    await db.prepare('SELECT 1').raw()
    await db.batch([db.prepare('SELECT 1'), db.prepare('SELECT 2')])
    expect(queries()).toBe(4)
  })
})
