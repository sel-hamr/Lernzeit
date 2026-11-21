import { SELF } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { runAction } from '@lernzeit/core/actions'
import { seedLibrary as fixtureLibrary } from '@lernzeit/core/actions/fixture.test-utils'
import type { PulledChange, PullResponse, PushResponse, SyncChange } from '@lernzeit/core/sync'
import type { Card, Session } from '@lernzeit/core/types'
import { beforeEach, describe, expect, it } from 'vitest'
import { createD1Store } from '../src/store.ts'
import { clearSyncData, countingDb, deviceToken, seedLibrary, seedOwner } from './helpers.ts'

// The signed-in owner of the helpers, whose records the tools read and write.
const OWNER = 'owner'

let token: string

beforeEach(async () => {
  await seedOwner()
  await clearSyncData()
  token = await deviceToken('Chrome on the laptop')
})

async function push(changes: SyncChange[]): Promise<PushResponse> {
  const response = await SELF.fetch('https://x/api/sync/push', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ changes }),
  })
  expect(response.status).toBe(200)
  return response.json<PushResponse>()
}

async function pullAll(): Promise<PulledChange[]> {
  const changes: PulledChange[] = []
  let cursor = ''
  for (;;) {
    const response = await SELF.fetch(`https://x/api/sync/pull?cursor=${cursor}`, { headers: { Authorization: `Bearer ${token}` } })
    expect(response.status).toBe(200)
    const page = await response.json<PullResponse>()
    changes.push(...page.changes)
    cursor = page.cursor
    if (!page.more) return changes
  }
}

/** A store for one tool call, as the MCP server makes it. */
const store = (now: number) => createD1Store(env.DB, OWNER, { now: () => now })

describe('the tool actions on D1', () => {
  it('creates a deck and its cards, which a device then pulls, each call under one seq', async () => {
    const created = await runAction(await store(1000), 'create_deck', { name: 'Küche' })
    expect(created.created).toBe(true)
    const added = await runAction(await store(2000), 'create_cards', {
      deck: 'Küche',
      cards: [
        { german: 'Löffel', english: 'spoon', gender: 'der' },
        { german: 'Gabel', english: 'fork', gender: 'die' },
      ],
    })
    expect(added).toEqual({ deck: 'Küche', added: 2, skipped: [] })

    const changes = await pullAll()
    const deck = changes.filter((c) => c.tbl === 'decks')
    const cards = changes.filter((c) => c.tbl === 'cards')
    const reviews = changes.filter((c) => c.tbl === 'reviews')
    expect(deck).toEqual([expect.objectContaining({ id: created.deck.id, updatedAt: 1000, deleted: false, data: expect.objectContaining({ name: 'Küche' }) })])
    expect(cards.map((c) => (c.data as Card).german).sort()).toEqual(['Gabel', 'Löffel'])
    expect(cards.every((c) => (c.data as Card).deckId === created.deck.id)).toBe(true)
    expect(reviews.length).toBeGreaterThanOrEqual(2)
    expect(new Set(reviews.map((r) => (r.data as { cardId: string }).cardId))).toEqual(new Set(cards.map((c) => c.id)))
    expect(changes).toHaveLength(deck.length + cards.length + reviews.length)

    const cardSeqs = new Set([...cards, ...reviews].map((c) => c.seq))
    expect(cardSeqs.size).toBe(1)
    expect([...cardSeqs][0]).toBeGreaterThan(deck[0].seq)
    expect([...cards, ...reviews].every((c) => c.updatedAt === 2000)).toBe(true)

    // Asking again finds the cards already there and writes nothing.
    const again = await runAction(await store(3000), 'create_cards', { deck: 'Küche', cards: [{ german: 'Löffel', english: 'spoon' }] })
    expect(again).toEqual({ deck: 'Küche', added: 0, skipped: ['Löffel'] })
    expect(await pullAll()).toHaveLength(changes.length)
  })

  it('lists decks with their card counts from D1', async () => {
    await seedLibrary(OWNER, fixtureLibrary())
    const decks = await runAction(await store(1000), 'list_decks', {})
    expect(decks.map((d) => [d.name, d.cards])).toEqual([
      ['My Words', 3],
      ['German Top Words', 1],
      ['German Everyday Sentences', 1],
      ['AI terms', 0],
    ])
  })

  it('writes nothing when the action fails', async () => {
    await seedLibrary(OWNER, fixtureLibrary())
    const before = await pullAll()
    await expect(runAction(await store(5000), 'create_cards', { deck: 'Nope', cards: [{ german: 'Haus', english: 'house' }] })).rejects.toThrow()
    expect(await pullAll()).toEqual(before)
  })

  it('logs study time on the owner’s local date, from the time zone in the synced settings', async () => {
    await seedLibrary(OWNER, { ...fixtureLibrary(), kv: [{ key: 'settings', value: { timeZone: 'Europe/Berlin' } }] })
    // 00:30 on 16 October in Berlin, still 15 October in UTC.
    const now = Date.parse('2026-10-16T00:30:00+02:00')
    const logged = await runAction(await store(now), 'log_study_time', { topic: 'German', minutes: 60 })
    expect(logged).toEqual({ topic: 'German', minutes: 60, start: '2026-10-15T23:30', end: '2026-10-16T00:30' })
    const sessions = (await (await store(now)).list<Session>('sessions')).sort((a, b) => a.start - b.start)
    expect(sessions.map((s) => [s.date, s.minutes])).toEqual([
      ['2026-10-15', 30],
      ['2026-10-16', 30],
    ])
  })

  it('logs study time on the UTC date when the settings have no time zone', async () => {
    await seedLibrary(OWNER, fixtureLibrary())
    const now = Date.parse('2026-10-16T00:30:00+02:00')
    const logged = await runAction(await store(now), 'log_study_time', { topic: 'German', minutes: 30 })
    expect(logged).toEqual({ topic: 'German', minutes: 30, start: '2026-10-15T22:00', end: '2026-10-15T22:30' })
    expect((await (await store(now)).list<Session>('sessions')).map((s) => s.date)).toEqual(['2026-10-15'])
  })
})

describe('a tool write and a browser edit of the same record', () => {
  const haus = (extra: Partial<Card>): Card => ({ ...(fixtureLibrary().cards!.find((c) => c.id === 'c-haus') as unknown as Card), ...extra })
  const edit = (card: Card, updatedAt: number): SyncChange => ({ tbl: 'cards', id: card.id, data: card, updatedAt, deleted: false })
  const pulledHaus = async () => (await pullAll()).find((c) => c.tbl === 'cards' && c.id === 'c-haus')!

  beforeEach(async () => {
    await seedLibrary(OWNER, fixtureLibrary(), 1000)
  })

  it('keeps the browser’s edit when the browser stamped it after the tool’s write', async () => {
    await runAction(await store(5000), 'move_cards', { deck: 'My Words', to: 'German Top Words', cards: ['Haus'] })
    expect(await pulledHaus()).toMatchObject({ updatedAt: 5000, data: { deckId: 'german-top-words' } })

    // The browser edited the card before it pulled the move, and pushes the edit stamped later.
    const browser = haus({ english: 'home', updatedAt: 6000 })
    expect(await push([edit(browser, 6000)])).toEqual({ applied: 1 })
    expect(await pulledHaus()).toMatchObject({ updatedAt: 6000, data: browser })
    expect(await (await store(7000)).get('cards', 'c-haus')).toEqual(browser)
  })

  it('keeps the tool’s write when the browser stamped its edit before it', async () => {
    await runAction(await store(5000), 'move_cards', { deck: 'My Words', to: 'German Top Words', cards: ['Haus'] })
    const moved = await (await store(5000)).get<Card>('cards', 'c-haus')
    expect(moved).toMatchObject({ deckId: 'german-top-words' })

    expect(await push([edit(haus({ english: 'home', updatedAt: 4000 }), 4000)])).toEqual({ applied: 0 })
    expect(await pulledHaus()).toMatchObject({ updatedAt: 5000, data: moved })
  })

  it('lets a tool write made after the browser’s push replace it', async () => {
    const browser = haus({ english: 'home', updatedAt: 3000 })
    await push([edit(browser, 3000)])
    await runAction(await store(5000), 'move_cards', { deck: 'My Words', to: 'German Top Words', cards: ['Haus'] })
    expect(await pulledHaus()).toMatchObject({ updatedAt: 5000, data: { english: 'home', deckId: 'german-top-words' } })
  })
})

describe('D1 queries per tool call', () => {
  // D1 allows 50 queries per request on the Free plan, a batch counting as one. A call's count must
  // not grow per card: 100 cards took 7 when this was written (the store batches reads made together).
  const MAX_QUERIES = 10

  /** "Big": 100 cards with an image each and their progress; "Empty": none. Plus 30 docs. */
  function bigLibrary() {
    const library = fixtureLibrary() as Record<string, Record<string, unknown>[]>
    const deck = (id: string, name: string, order: number) => ({
      id, name, topicId: 'german', newPerDay: 15, reviewsPerDay: 150, directions: { imageToDe: true, enToDe: true, deToEn: true }, order, createdAt: 1,
    })
    library.decks.push(deck('big', 'Big', 10), deck('empty', 'Empty', 11))
    const cards = Array.from({ length: 100 }, (_, i) => ({
      id: `big-${i}`, deckId: 'big', type: 'word', german: `Wort${i}`, english: `word ${i}`, tags: [], createdAt: 1, updatedAt: 1, imageId: `img-${i}`,
    }))
    library.cards.push(...cards)
    library.reviews.push(...cards.flatMap((c) => ['imageToDe', 'enToDe', 'deToEn'].map((direction) => ({ id: `${c.id}:${direction}`, cardId: c.id, deckId: 'big', direction, state: 0, due: 1 }))))
    library.reviewLogs = cards.map((c, i) => ({ id: `log-${i}`, reviewId: `${c.id}:enToDe`, cardId: c.id, deckId: 'big', direction: 'enToDe', rating: 3, reviewedAt: 1 }))
    library.drillStats = cards.map((c) => ({ id: `${c.id}:article`, cardId: c.id, drill: 'article', right: 1, wrong: 0 }))
    library.images = cards.map((c) => ({ id: c.imageId, width: 1, height: 1, fit: 'cover', type: 'image/png' }))
    library.docs = Array.from({ length: 30 }, (_, i) => ({ id: `doc-${i}`, folderId: 'root', title: `Doc ${i}`, body: 'Text', tags: [], createdAt: 1, updatedAt: 1 }))
    return { library, cards }
  }

  async function queries<A extends Parameters<typeof runAction>[1]>(action: A, params: Parameters<typeof runAction<A>>[2]): Promise<number> {
    const { db, queries: counted } = countingDb()
    await runAction(await createD1Store(db, OWNER, { now: () => 5000 }), action, params)
    return counted()
  }

  let cards: { id: string }[]
  beforeEach(async () => {
    const big = bigLibrary()
    cards = big.cards
    await seedLibrary(OWNER, big.library)
  })

  it('deletes 100 cards with images and progress', async () => {
    const count = await queries('delete_cards', { deck: 'Big', cards: cards.map((c) => c.id) })
    const left = await pullAll()
    expect(left.filter((c) => c.tbl === 'images' && !c.deleted)).toHaveLength(0)
    expect(left.filter((c) => c.tbl === 'reviewLogs' && !c.deleted)).toHaveLength(0)
    expect(count).toBeLessThanOrEqual(MAX_QUERIES)
  })

  it('moves 100 cards', async () => {
    const count = await queries('move_cards', { deck: 'Big', to: 'Empty', cards: cards.map((c) => c.id) })
    expect((await pullAll()).filter((c) => c.tbl === 'reviews' && (c.data as { deckId: string }).deckId === 'empty')).toHaveLength(300)
    expect(count).toBeLessThanOrEqual(MAX_QUERIES)
  })

  it('deletes a deck of 100 cards', async () => {
    const count = await queries('delete_deck', { deck: 'Big', cardCount: 100 })
    expect((await pullAll()).filter((c) => c.tbl === 'cards' && c.deleted)).toHaveLength(100)
    expect(count).toBeLessThanOrEqual(MAX_QUERIES)
  })

  it('stays at a few for the other tools', async () => {
    const counts = {
      list_decks: await queries('list_decks', {}),
      list_cards: await queries('list_cards', {}),
      create_cards: await queries('create_cards', { deck: 'Empty', cards: [{ german: 'Löffel', english: 'spoon' }] }),
      create_deck: await queries('create_deck', { name: 'Neu' }),
      log_study_time: await queries('log_study_time', { topic: 'German', minutes: 30 }),
      list_docs: await queries('list_docs', {}),
      read_doc: await queries('read_doc', { doc: 'Doc 3' }),
      create_doc: await queries('create_doc', { title: 'Neu', body: 'Text' }),
      create_task: await queries('create_task', { title: 'Lernen' }),
      list_topics: await queries('list_topics', {}),
      list_grammar_topics: await queries('list_grammar_topics', {}),
    }
    // 2 to 4 each when this was written.
    expect(Object.entries(counts).filter(([, n]) => n > 5)).toEqual([])
  })
})
