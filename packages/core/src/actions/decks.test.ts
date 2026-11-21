import { beforeEach, describe, expect, it } from 'vitest'
import type { Card, CardReview, Deck, Topic } from '../types'
import { expectCode, makeStore, MY_WORDS_CARDS, NOW } from './fixture.test-utils'
import { runAction } from './index'

let store: ReturnType<typeof makeStore>

beforeEach(() => {
  store = makeStore()
})

describe('list_topics and list_decks', () => {
  it('lists active topics in order', async () => {
    const ai = (await store.get<Topic>('topics', 'ai'))!
    store.put('topics', { ...ai, archived: true })
    await store.commit()
    expect((await runAction(store, 'list_topics', {})).map((t) => t.name)).toEqual(['German'])
  })

  it('lists decks in order with their topic and card count', async () => {
    const decks = await runAction(store, 'list_decks', {})
    expect(decks[0]).toEqual({ id: 'my-words', name: 'My Words', topic: 'German', cards: MY_WORDS_CARDS })
    expect(decks.map((d) => d.name)).toEqual(['My Words', 'German Top Words', 'German Everyday Sentences', 'AI terms'])
  })
})

describe('create_deck', () => {
  it('creates a deck linked to a topic by name', async () => {
    const { deck, created } = await runAction(store, 'create_deck', { name: ' Food ', topic: 'german' })
    expect(created).toBe(true)
    expect(deck).toMatchObject({ name: 'Food', topic: 'German', cards: 0 })
    expect(await store.get<Deck>('decks', deck.id)).toEqual({
      id: deck.id, name: 'Food', topicId: 'german', newPerDay: 15, reviewsPerDay: 150,
      directions: { imageToDe: true, enToDe: true, deToEn: false }, order: 101, createdAt: NOW,
    })
  })

  it('returns the existing deck when the name is taken', async () => {
    const before = await store.count('decks')
    const { deck, created } = await runAction(store, 'create_deck', { name: 'my words' })
    expect(created).toBe(false)
    expect(deck).toMatchObject({ id: 'my-words', cards: MY_WORDS_CARDS })
    expect(await store.count('decks')).toBe(before)
    expect(store.committed).toEqual([])
  })

  it('rejects an unknown topic and lists the real ones', async () => {
    const error = await expectCode(runAction(store, 'create_deck', { name: 'Food', topic: 'Spanish' }), 'topic_not_found')
    expect(error.message).toContain('German, AI')
  })
})

describe('delete_deck', () => {
  beforeEach(async () => {
    await runAction(store, 'create_deck', { name: 'Food' })
    await runAction(store, 'create_cards', { deck: 'Food', cards: [{ english: 'spoon', german: 'der Löffel' }, { english: 'fork', german: 'die Gabel' }] })
    await runAction(store, 'create_cards', { deck: 'My Words', cards: [{ english: 'spoon', german: 'Löffel' }] })
  })

  it('deletes a deck by name with its cards and their progress, and leaves other decks alone', async () => {
    const deck = (await store.list<Deck>('decks')).find((d) => d.name === 'Food')!
    const ids = (await store.list<Card>('cards', { deckId: deck.id })).map((c) => c.id)
    expect(await runAction(store, 'delete_deck', { deck: 'FOOD', cardCount: 2 })).toEqual({ deck: 'Food', deletedCards: 2 })
    expect(await store.get('decks', deck.id)).toBeUndefined()
    expect(await store.count('cards', { deckId: deck.id })).toBe(0)
    expect((await store.list<CardReview>('reviews')).filter((r) => ids.includes(r.cardId))).toEqual([])
    expect((await store.list<Card>('cards', { deckId: 'my-words' })).filter((c) => c.german === 'Löffel')).toHaveLength(1)
    await expectCode(runAction(store, 'delete_deck', { deck: 'Food', cardCount: 2 }), 'deck_not_found')
  })

  it('deletes an empty deck by id', async () => {
    const { deck } = await runAction(store, 'create_deck', { name: 'Empty' })
    expect(await runAction(store, 'delete_deck', { deck: deck.id, cardCount: 0 })).toEqual({ deck: 'Empty', deletedCards: 0 })
  })

  it('deletes a deck of 500 cards, and refuses a bigger one, saying to empty it with delete_cards first', async () => {
    const { deck } = await runAction(store, 'create_deck', { name: 'Huge' })
    const fill = (from: number, to: number) => {
      for (let i = from; i < to; i++) store.put('cards', { id: `huge-${i}`, deckId: deck.id, type: 'word', german: `W${i}`, english: `w${i}`, tags: [], createdAt: 1, updatedAt: 1 })
    }
    fill(0, 501)
    await store.commit()
    const before = store.committed.length
    const error = await expectCode(runAction(store, 'delete_deck', { deck: 'Huge', cardCount: 501 }), 'invalid_input')
    expect(error.message).toBe('"Huge" has 501 cards, more than delete_deck deletes at once (500). Nothing was deleted. Delete its cards first with delete_cards, up to 100 per call, then delete the deck.')
    expect(store.committed).toHaveLength(before)

    await runAction(store, 'delete_cards', { deck: 'Huge', cards: ['huge-500'] })
    expect(await runAction(store, 'delete_deck', { deck: 'Huge', cardCount: 500 })).toEqual({ deck: 'Huge', deletedCards: 500 })
    expect(await store.count('cards', { deckId: deck.id })).toBe(0)
  })

  it('keeps the deck when cardCount does not match, or is not a count', async () => {
    const before = store.committed.length
    const error = await expectCode(runAction(store, 'delete_deck', { deck: 'Food', cardCount: 1 }), 'invalid_input')
    expect(error.message).toContain('has 2 cards')
    await expectCode(runAction(store, 'delete_deck', { deck: 'Food', cardCount: -1 }), 'invalid_input')
    await expectCode(runAction(store, 'delete_deck', { deck: 'Food', cardCount: 2.5 }), 'invalid_input')
    await expectCode(runAction(store, 'delete_deck', { deck: 'Küche', cardCount: 0 }), 'deck_not_found')
    expect((await runAction(store, 'list_decks', {})).find((d) => d.name === 'Food')?.cards).toBe(2)
    expect(store.committed).toHaveLength(before)
  })

  it('tombstones the deck, its cards, their reviews, review logs and drill stats, and images no other card uses', async () => {
    const deck = (await store.list<Deck>('decks')).find((d) => d.name === 'Food')!
    const [spoon, fork] = await store.list<Card>('cards', { deckId: deck.id })
    const shared = (await store.list<Card>('cards', { deckId: 'my-words' })).find((c) => c.german === 'Löffel')!
    store.put('cards', { ...spoon, imageId: 'img-own' })
    store.put('cards', { ...fork, imageId: 'img-shared' })
    store.put('cards', { ...shared, imageId: 'img-shared' })
    store.put('images', { id: 'img-own', width: 1, height: 1, fit: 'cover', type: 'image/png' })
    store.put('images', { id: 'img-shared', width: 1, height: 1, fit: 'cover', type: 'image/png' })
    store.put('reviewLogs', { id: 'log-1', reviewId: `${spoon.id}:enToDe`, cardId: spoon.id, deckId: deck.id, direction: 'enToDe', rating: 3, prevState: 0, reviewedAt: 1, durationMs: 1, day: '2026-10-14' })
    store.put('drillStats', { id: `${fork.id}:article`, cardId: fork.id, drill: 'article', right: 1, wrong: 0, score: 0, lastAt: 1 })
    await store.commit()
    const before = store.committed.length

    await runAction(store, 'delete_deck', { deck: 'Food', cardCount: 2 })
    const removed = store.committed.slice(before)
    expect(removed.every((c) => c.deleted && c.data === null && c.updatedAt === NOW)).toBe(true)
    expect(removed.map((c) => `${c.tbl}/${c.id}`).sort()).toEqual(
      [
        `decks/${deck.id}`,
        `cards/${spoon.id}`,
        `cards/${fork.id}`,
        `reviews/${spoon.id}:enToDe`,
        `reviews/${fork.id}:enToDe`,
        'reviewLogs/log-1',
        `drillStats/${fork.id}:article`,
        'images/img-own',
      ].sort(),
    )
  })

  it('keeps an image a doc still shows when its deck is deleted', async () => {
    const deck = (await store.list<Deck>('decks')).find((d) => d.name === 'Food')!
    const [spoon] = await store.list<Card>('cards', { deckId: deck.id })
    store.put('cards', { ...spoon, imageId: 'img' })
    store.put('images', { id: 'img', width: 1, height: 1, fit: 'cover', type: 'image/png' })
    store.put('docs', { id: 'doc', folderId: 'root', title: 'Löffel', body: '![Löffel](image:img)', tags: [], status: 'toRead', pinned: false, createdAt: 1, updatedAt: 1 })
    await store.commit()

    await runAction(store, 'delete_deck', { deck: 'Food', cardCount: 2 })
    expect(await store.get('images', 'img')).toBeDefined()
  })
})
