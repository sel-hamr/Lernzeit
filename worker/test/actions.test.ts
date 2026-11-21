import { SELF } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { runAction } from '@lernzeit/core/actions'
import { seedLibrary as fixtureLibrary } from '@lernzeit/core/actions/fixture.test-utils'
import type { PulledChange, PullResponse, PushResponse, SyncChange } from '@lernzeit/core/sync'
import type { Card, Session } from '@lernzeit/core/types'
import { beforeEach, describe, expect, it } from 'vitest'
import { createD1Store } from '../src/store.ts'
import { clearSyncData, deviceToken, seedLibrary, seedOwner } from './helpers.ts'

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
