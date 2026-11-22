import { parseCardsCsv } from '@lernzeit/core/csv'
import type { Card, CardReview, Deck, ReviewLog, Session } from '@lernzeit/core/types'
import { importCsvRows } from '../src/cards/csvImport'
import { createDeck, deleteCard, gradeReview, moveCard, quickAddCard, recordReviewTime, saveCard, undoGrade } from '../src/cards/data'
import { roundFor } from '../src/practice/round'
import { createLocalLibrary } from '../src/store/library'
import { nodeSqliteAdapter } from './store/nodeSqlite'

function setup() {
  const library = createLocalLibrary(nodeSqliteAdapter())
  library.put('kv', { key: 'timeZone', value: 'Europe/Berlin' })
  return { library, deck: createDeck(library, { name: 'German A1' }) }
}

describe('cards', () => {
  it('quick add makes an incomplete word card with a review per direction it can ask (no picture, so English to German only), article split off', () => {
    const { library, deck } = setup()
    const card = quickAddCard(library, { english: 'dog', german: 'der Hund', deckId: deck.id })
    expect(card).toMatchObject({ german: 'Hund', gender: 'der', tags: ['incomplete'] })
    expect(library.list<CardReview>('reviews', { cardId: card.id }).map((r) => r.direction).sort()).toEqual(['enToDe'])
  })

  it('keeps a picture as an image record and file, and drops it with the card', () => {
    const { library, deck } = setup()
    const file = { id: 'img1', path: 'file:///images/img1', type: 'image/jpeg', width: 600, height: 400, fit: 'cover' as const }
    const card = saveCard(library, { deckId: deck.id, type: 'word', english: 'cat', german: 'Katze', gender: 'die', tags: [] }, { kind: 'set', file })
    expect(card.imageId).toBe('img1')
    expect(library.get('images', 'img1')).toMatchObject({ width: 600, type: 'image/jpeg' })
    expect(library.imageFile('img1')?.path).toBe(file.path)
    deleteCard(library, card.id)
    expect(library.get('cards', card.id)).toBeUndefined()
    expect(library.get('images', 'img1')).toBeUndefined()
    expect(library.list('reviews', { cardId: card.id })).toEqual([])
  })

  it('moves a card with its progress to another deck', () => {
    const { library, deck } = setup()
    const other = createDeck(library, { name: 'Verbs' })
    const card = quickAddCard(library, { english: 'dog', german: 'Hund', deckId: deck.id })
    moveCard(library, card.id, other.id)
    expect(library.get<Card>('cards', card.id)?.deckId).toBe(other.id)
    expect(library.list<CardReview>('reviews', { cardId: card.id }).every((r) => r.deckId === other.id)).toBe(true)
  })

  it('rates a review, logs it, and undo restores it', () => {
    const { library, deck } = setup()
    const card = quickAddCard(library, { english: 'dog', german: 'Hund', deckId: deck.id })
    const review = library.list<CardReview>('reviews', { cardId: card.id })[0]
    const result = gradeReview(library, review.id, 3, 4000)!
    expect(library.get<CardReview>('reviews', review.id)?.fsrs.reps).toBe(1)
    expect(library.get<ReviewLog>('reviewLogs', result.logId)).toMatchObject({ rating: 3, prevState: 0 })
    undoGrade(library, result.previous, result.logId)
    expect(library.get<CardReview>('reviews', review.id)?.fsrs.reps).toBe(0)
    expect(library.get('reviewLogs', result.logId)).toBeUndefined()
  })

  it('counts review time as one replaceable flashcards session', () => {
    const { library } = setup()
    const start = Date.UTC(2026, 10, 19, 10, 0)
    recordReviewTime(library, { runId: 'r:t1', topicId: 't1', start, end: start + 120_000, minutes: 2 })
    recordReviewTime(library, { runId: 'r:t1', topicId: 't1', start, end: start + 180_000, minutes: 3 })
    const sessions = library.list<Session>('sessions')
    expect(sessions).toHaveLength(1)
    expect(sessions[0]).toMatchObject({ source: 'flashcards', minutes: 3 })
  })

  it('imports a CSV with the web rules: deck column creates decks, articles move to gender', () => {
    const { library, deck } = setup()
    const preview = parseCardsCsv('english,german,deck\ndog,der Hund,\ncat,die Katze,Animals\n,broken,\n')
    expect(preview.skipped).toHaveLength(1)
    expect(importCsvRows(library, preview.rows, deck.id)).toEqual({ cards: 2, newDecks: 1 })
    const cards = library.list<Card>('cards')
    expect(cards.map((c) => c.gender).sort()).toEqual(['der', 'die'])
    expect(library.list<Deck>('decks').map((d) => d.name).sort()).toEqual(['Animals', 'German A1'])
  })

  it('a deck round holds every review of the deck', () => {
    const { library, deck } = setup()
    quickAddCard(library, { english: 'dog', german: 'Hund', deckId: deck.id })
    quickAddCard(library, { english: 'cat', german: 'Katze', deckId: deck.id })
    const data = { cards: library.list<Card>('cards'), decks: library.list<Deck>('decks'), reviews: library.list<CardReview>('reviews'), logs: [], today: '2026-11-19', now: Date.now() }
    const round = roundFor({ deckIds: [deck.id], directions: [], scope: 'all' }, data)
    expect(round.kind).toBe('all')
    expect(round.ids).toHaveLength(2)
    expect(roundFor({ deckIds: [], directions: [], scope: 'due' }, data, data.cards[0].id).kind).toBe('card')
  })
})
