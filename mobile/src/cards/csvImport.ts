/** Imports parsed CSV rows as the web does (src/data/io.ts importCsvRows): rows without a deck go to `fallbackDeckId`, unknown deck names are created. */
import type { CsvRow } from '@lernzeit/core/csv'
import { directionsFor, newReview } from '@lernzeit/core/srs'
import type { Card, Deck } from '@lernzeit/core/types'
import { newId } from '../data/ids'
import type { LocalLibrary } from '../store/library'

export function importCsvRows(library: LocalLibrary, rows: CsvRow[], fallbackDeckId: string): { cards: number; newDecks: number } {
  return library.write(() => {
    const decks = library.list<Deck>('decks')
    const byName = new Map(decks.map((d) => [d.name.toLowerCase(), d]))
    const fallback = decks.find((d) => d.id === fallbackDeckId) ?? decks[0]
    let order = decks.reduce((max, d) => Math.max(max, d.order), -1) + 1
    let newDecks = 0
    const now = Date.now()
    let count = 0
    for (const [i, row] of rows.entries()) {
      let deck: Deck | undefined = row.deck ? byName.get(row.deck.toLowerCase()) : fallback
      if (!deck && row.deck) {
        deck = { id: newId(), name: row.deck, topicId: fallback?.topicId, newPerDay: 15, reviewsPerDay: 150, directions: { imageToDe: true, enToDe: true, deToEn: false }, order: order++, createdAt: now }
        library.put('decks', deck)
        byName.set(deck.name.toLowerCase(), deck)
        newDecks++
      }
      if (!deck) throw new Error('Create a deck before importing')
      const card: Card = {
        id: newId(),
        deckId: deck.id,
        type: row.type,
        english: row.english,
        german: row.german,
        gender: row.type === 'word' ? row.gender : undefined,
        plural: row.plural,
        verbForms: row.verbForms,
        conjugation: row.conjugation,
        exampleDe: row.exampleDe,
        exampleEn: row.exampleEn,
        emoji: row.emoji,
        tags: row.tags,
        createdAt: now + i,
        updatedAt: now + i,
      }
      library.put('cards', card)
      for (const direction of directionsFor(card, deck)) library.put('reviews', newReview(card, direction, now))
      count++
    }
    return { cards: count, newDecks }
  })
}
