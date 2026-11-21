import { beforeEach, describe, expect, it } from 'vitest'
import type { Card, CardReview, Deck } from '../types'
import { expectCode, makeStore, NOW } from './fixture.test-utils'
import { AI_TAG, runAction } from './index'

let store: ReturnType<typeof makeStore>

beforeEach(() => {
  store = makeStore()
})

const directions = async (cardId: string) => (await store.list<CardReview>('reviews', { cardId })).map((r) => r.direction).sort()
const findCard = async (german: string, deckId?: string) =>
  (await store.list<Card>('cards', deckId ? { deckId } : undefined)).find((c) => c.german === german)

describe('create_cards', () => {
  it('adds cards with the ai tag, FSRS reviews and the article moved into gender', async () => {
    const result = await runAction(store, 'create_cards', {
      deck: 'My Words',
      cards: [
        { english: 'spoon', german: 'der Löffel', plural: 'die Löffel', partOfSpeech: 'noun', emoji: '🥄' },
        { english: 'I {{cook}} pasta.', german: 'Ich {{koche}} Nudeln.', tags: ['kitchen'] },
      ],
    })
    expect(result).toEqual({ deck: 'My Words', added: 2, skipped: [] })

    const spoon = (await findCard('Löffel'))!
    expect(spoon).toMatchObject({ deckId: 'my-words', type: 'word', gender: 'der', plural: 'die Löffel', tags: [AI_TAG], createdAt: NOW, updatedAt: NOW })
    const cloze = (await findCard('Ich {{koche}} Nudeln.'))!
    expect(cloze).toMatchObject({ type: 'cloze', tags: ['kitchen', AI_TAG], createdAt: NOW + 1 })
    expect(cloze.gender).toBeUndefined()

    expect(await directions(spoon.id)).toEqual(['deToEn', 'enToDe', 'imageToDe'])
    expect(await directions(cloze.id)).toEqual(['cloze'])
    const [review] = await store.list<CardReview>('reviews', { cardId: cloze.id })
    expect(review).toMatchObject({ id: `${cloze.id}:cloze`, deckId: 'my-words', state: 0, due: NOW, fsrs: { reps: 0, state: 0, due: NOW } })
  })

  it('commits the cards and their reviews in one go', async () => {
    await runAction(store, 'create_cards', { deck: 'My Words', cards: [{ english: 'spoon', german: 'der Löffel', emoji: '🥄' }] })
    const spoon = (await findCard('Löffel'))!
    expect(store.committed.map((c) => `${c.tbl}/${c.id}`)).toEqual([
      `cards/${spoon.id}`,
      `reviews/${spoon.id}:imageToDe`,
      `reviews/${spoon.id}:enToDe`,
      `reviews/${spoon.id}:deToEn`,
    ])
    expect(store.committed.every((c) => !c.deleted && c.updatedAt === NOW)).toBe(true)
  })

  it('skips words already in the deck and repeats within the call', async () => {
    const result = await runAction(store, 'create_cards', {
      deck: 'german-top-words',
      cards: [
        { english: 'dog', german: 'der Hund' },
        { english: 'fork', german: 'Gabel', gender: 'die' },
        { english: 'fork', german: 'gabel' },
      ],
    })
    expect(result).toEqual({ deck: 'German Top Words', added: 1, skipped: ['Hund', 'gabel'] })
  })

  it('matches duplicates as today: trimmed, any case, the article split off words only', async () => {
    const result = await runAction(store, 'create_cards', {
      deck: 'My Words',
      cards: [
        { english: 'house', german: '  DAS haus ' },
        { english: 'cat', german: 'katze', type: 'sentence' },
        { english: 'the cat', german: 'die Katze', type: 'sentence' },
        { english: 'run', german: 'Laufen' },
      ],
    })
    // A sentence keeps its article, so "die Katze" is new text; "katze" is the word card's text.
    expect(result).toEqual({ deck: 'My Words', added: 1, skipped: ['haus', 'katze', 'Laufen'] })
    expect(await findCard('die Katze', 'my-words')).toMatchObject({ type: 'sentence' })
    expect(store.committed.filter((c) => c.tbl === 'cards')).toHaveLength(1)
  })

  it('rejects an unknown deck and lists the real ones', async () => {
    const error = await expectCode(runAction(store, 'create_cards', { deck: 'Food', cards: [{ english: 'a', german: 'b' }] }), 'deck_not_found')
    expect(error.message).toContain('My Words, German Top Words')
  })

  it('rejects empty calls, blank cards and too many cards without saving anything', async () => {
    const before = await store.count('cards')
    await expectCode(runAction(store, 'create_cards', { deck: 'My Words', cards: [] }), 'invalid_input')
    await expectCode(runAction(store, 'create_cards', { deck: 'My Words', cards: [{ english: 'ok', german: 'gut' }, { english: ' ', german: 'x' }] }), 'invalid_input')
    const many = Array.from({ length: 101 }, (_, i) => ({ english: `w${i}`, german: `W${i}` }))
    await expectCode(runAction(store, 'create_cards', { deck: 'My Words', cards: many }), 'invalid_input')
    expect(await store.count('cards')).toBe(before)
  })

  it('writes nothing when one card of many is invalid, and says which', async () => {
    const cards = [
      { english: 'spoon', german: 'Löffel' },
      { english: 'fork', german: 'Gabel' },
      { english: 'knife', german: '  ' },
      { english: 'plate', german: 'Teller' },
    ]
    const error = await expectCode(runAction(store, 'create_cards', { deck: 'My Words', cards }), 'invalid_input')
    expect(error.message).toBe('Card 3 needs both english (the meaning) and german (the word in the language you learn).')
    expect(store.committed).toEqual([])
    expect(await findCard('Löffel')).toBeUndefined()
  })
})

describe('list_cards, move_cards and delete_cards', () => {
  beforeEach(async () => {
    await runAction(store, 'create_deck', { name: 'Food' })
    await runAction(store, 'create_cards', {
      deck: 'Food',
      cards: [
        { english: 'spoon', german: 'der Löffel' },
        { english: 'fork', german: 'die Gabel' },
        { english: 'I {{cook}} pasta.', german: 'Ich {{koche}} Nudeln.' },
        { english: 'Spoon?', german: 'Löffel?', type: 'sentence' },
      ],
    })
    await runAction(store, 'create_cards', { deck: 'My Words', cards: [{ english: 'spoon', german: 'Löffel' }] })
  })

  const foodDeck = async () => (await store.list<Deck>('decks')).find((d) => d.name === 'Food')!
  const foodCards = async () => store.list<Card>('cards', { deckId: (await foodDeck()).id })

  it('reads a deck in order with every field and an id, and no progress', async () => {
    const { total, offset, cards } = await runAction(store, 'list_cards', { deck: 'food' })
    expect({ total, offset }).toEqual({ total: 4, offset: 0 })
    expect(cards.map((c) => c.german)).toEqual(['Löffel', 'Gabel', 'Ich {{koche}} Nudeln.', 'Löffel?'])
    const spoon = (await foodCards()).find((c) => c.german === 'Löffel')!
    expect(cards[0]).toEqual({ id: spoon.id, deck: 'Food', type: 'word', german: 'Löffel', english: 'spoon', gender: 'der', tags: [AI_TAG], hasImage: false })
  })

  it('finds cards in every deck by German with its article, English or tag, and pages through them', async () => {
    const spoons = await runAction(store, 'list_cards', { search: 'Spoon', tag: 'ai' })
    expect(spoons.cards.map((c) => `${c.deck}: ${c.german}`)).toEqual(['My Words: Löffel', 'Food: Löffel', 'Food: Löffel?'])
    // The My Words spoon was added without an article.
    expect((await runAction(store, 'list_cards', { search: 'DER LÖF', tag: 'ai' })).cards.map((c) => `${c.deck}: ${c.german}`)).toEqual(['Food: Löffel'])
    expect((await runAction(store, 'list_cards', { search: 'cook', tag: 'AI' })).cards.map((c) => c.german)).toEqual(['Ich {{koche}} Nudeln.'])
    const page = await runAction(store, 'list_cards', { tag: 'ai', limit: 2, offset: 2 })
    expect(page.total).toBe(5)
    expect(page.cards.map((c) => c.german)).toEqual(['Gabel', 'Ich {{koche}} Nudeln.'])
    expect((await runAction(store, 'list_cards', { search: 'Messer', tag: 'ai' })).total).toBe(0)
  })

  it('rejects a bad limit, offset or deck', async () => {
    await expectCode(runAction(store, 'list_cards', { limit: 0 }), 'invalid_input')
    await expectCode(runAction(store, 'list_cards', { limit: 201 }), 'invalid_input')
    await expectCode(runAction(store, 'list_cards', { offset: -1 }), 'invalid_input')
    await expectCode(runAction(store, 'list_cards', { offset: 1.5 }), 'invalid_input')
    await expectCode(runAction(store, 'list_cards', { deck: 'Küche' }), 'deck_not_found')
  })

  it('moves cards by id or text with their progress, and skips text the target deck has', async () => {
    const fork = (await foodCards()).find((c) => c.german === 'Gabel')!
    const [review] = await store.list<CardReview>('reviews', { cardId: fork.id })
    store.put('reviews', { ...review, state: 2 })
    await store.commit()

    const result = await runAction(store, 'move_cards', { deck: 'Food', to: 'my words', cards: [fork.id, 'die Gabel', 'der Löffel', 'Messer'] })
    expect(result).toEqual({ from: 'Food', to: 'My Words', moved: ['Gabel'], skipped: ['Löffel'], notFound: ['Messer'] })
    expect((await store.get<Card>('cards', fork.id))?.deckId).toBe('my-words')
    expect(await store.get<CardReview>('reviews', review.id)).toMatchObject({ deckId: 'my-words', state: 2 })
    // My Words also practises German → English, so the card gets that review new.
    expect(await directions(fork.id)).toEqual(['deToEn', 'enToDe'])
    expect((await foodCards()).map((c) => c.german).sort()).toEqual(['Ich {{koche}} Nudeln.', 'Löffel', 'Löffel?'])
  })

  it('refuses to move cards to their own deck or an unknown one', async () => {
    await expectCode(runAction(store, 'move_cards', { deck: 'Food', to: 'food', cards: ['Gabel'] }), 'invalid_input')
    await expectCode(runAction(store, 'move_cards', { deck: 'Food', to: 'Küche', cards: ['Gabel'] }), 'deck_not_found')
    await expectCode(runAction(store, 'move_cards', { deck: 'Food', to: 'My Words', cards: [] }), 'invalid_input')
    expect(await foodCards()).toHaveLength(4)
  })

  it('deletes a card by its id', async () => {
    const fork = (await foodCards()).find((c) => c.german === 'Gabel')!
    expect(await runAction(store, 'delete_cards', { deck: 'Food', cards: [fork.id] })).toEqual({ deck: 'Food', deleted: ['Gabel'], notFound: [] })
    // An id only counts in its own deck.
    const spoon = (await foodCards()).find((c) => c.german === 'Löffel')!
    expect(await runAction(store, 'delete_cards', { deck: 'My Words', cards: [spoon.id] })).toEqual({ deck: 'My Words', deleted: [], notFound: [spoon.id] })
  })

  it('deletes cards by German text in any case or with their article, and their reviews', async () => {
    const spoon = (await foodCards()).find((c) => c.german === 'Löffel')!
    const result = await runAction(store, 'delete_cards', { deck: 'food', cards: ['DER löffel', ' ich {{koche}} nudeln. '] })
    expect(result).toEqual({ deck: 'Food', deleted: ['Löffel', 'Ich {{koche}} Nudeln.'], notFound: [] })
    expect((await foodCards()).map((c) => c.german).sort()).toEqual(['Gabel', 'Löffel?'])
    expect(await store.count('reviews', { cardId: spoon.id })).toBe(0)
    // The same word in another deck stays.
    expect((await store.list<Card>('cards', { deckId: 'my-words' })).filter((c) => c.german === 'Löffel')).toHaveLength(1)
  })

  it('lists texts that match no card, and deletes a card once when named twice', async () => {
    const result = await runAction(store, 'delete_cards', { deck: 'Food', cards: ['Gabel', 'die Gabel', 'Messer', 'Löffel!'] })
    expect(result).toEqual({ deck: 'Food', deleted: ['Gabel'], notFound: ['Messer', 'Löffel!'] })
    expect(await runAction(store, 'delete_cards', { deck: 'Food', cards: ['Gabel'] })).toEqual({ deck: 'Food', deleted: [], notFound: ['Gabel'] })
  })

  it('rejects an unknown deck and bad input without deleting anything', async () => {
    const before = await store.count('cards')
    const error = await expectCode(runAction(store, 'delete_cards', { deck: 'Küche', cards: ['Löffel'] }), 'deck_not_found')
    expect(error.message).toContain('Food')
    await expectCode(runAction(store, 'delete_cards', { deck: 'Food', cards: [] }), 'invalid_input')
    await expectCode(runAction(store, 'delete_cards', { deck: 'Food', cards: ['Löffel', ' '] }), 'invalid_input')
    await expectCode(runAction(store, 'delete_cards', { deck: 'Food', cards: Array.from({ length: 101 }, (_, i) => `W${i}`) }), 'invalid_input')
    expect(await store.count('cards')).toBe(before)
  })

  it('deletes a card with its review logs and drill stats, and its image once no other card uses it', async () => {
    const [spoon, fork] = await foodCards()
    store.put('cards', { ...spoon, imageId: 'img' })
    store.put('cards', { ...fork, imageId: 'img' })
    store.put('images', { id: 'img', width: 1, height: 1, fit: 'cover', type: 'image/png' })
    store.put('reviewLogs', { id: 'log-1', reviewId: `${spoon.id}:enToDe`, cardId: spoon.id, deckId: spoon.deckId, direction: 'enToDe', rating: 3, prevState: 0, reviewedAt: 1, durationMs: 1, day: '2026-10-14' })
    store.put('drillStats', { id: `${spoon.id}:article`, cardId: spoon.id, drill: 'article', right: 1, wrong: 0, score: 0, lastAt: 1 })
    await store.commit()

    await runAction(store, 'delete_cards', { deck: 'Food', cards: [spoon.id] })
    expect(await store.get('reviewLogs', 'log-1')).toBeUndefined()
    expect(await store.get('drillStats', `${spoon.id}:article`)).toBeUndefined()
    expect(await store.get('images', 'img')).toBeDefined()

    await runAction(store, 'delete_cards', { deck: 'Food', cards: [fork.id] })
    expect(await store.get('images', 'img')).toBeUndefined()
    expect(store.committed.at(-1)).toEqual({ tbl: 'images', id: 'img', data: null, updatedAt: NOW, deleted: true })
  })

  it('keeps an image a doc still shows when the card that had it is deleted', async () => {
    const [spoon] = await foodCards()
    store.put('cards', { ...spoon, imageId: 'img' })
    store.put('images', { id: 'img', width: 1, height: 1, fit: 'cover', type: 'image/png' })
    store.put('docs', { id: 'doc', folderId: 'root', title: 'Löffel', body: 'Ein ![Löffel](image:img).', tags: [], status: 'toRead', pinned: false, createdAt: 1, updatedAt: 1 })
    await store.commit()

    await runAction(store, 'delete_cards', { deck: 'Food', cards: [spoon.id] })
    expect(await store.get('cards', spoon.id)).toBeUndefined()
    expect(await store.get('images', 'img')).toBeDefined()
  })
})
