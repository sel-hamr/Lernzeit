import type { Card, Deck } from '@lernzeit/core/types'

export interface CarouselDeck {
  deck: Deck
  count: number
  /** The first card is lime, then dark, then white, and round again. */
  tone: 'accent' | 'inverse' | 'card'
}

const TONES = ['accent', 'inverse', 'card'] as const

/**
 * The "Your decks" carousel on Today: decks in their own order, those with cards before the empty
 * ones, each with its card count and its colour. At most `limit` (the Cards tab has them all).
 */
export function deckCarousel(decks: readonly Deck[], cards: readonly Pick<Card, 'deckId'>[], limit = 10): CarouselDeck[] {
  const counts = new Map<string, number>()
  for (const c of cards) counts.set(c.deckId, (counts.get(c.deckId) ?? 0) + 1)
  const ordered = [...decks].sort((a, b) => a.order - b.order)
  const withCards = ordered.filter((d) => (counts.get(d.id) ?? 0) > 0)
  const empty = ordered.filter((d) => !counts.get(d.id))
  return [...withCards, ...empty].slice(0, limit).map((deck, i) => ({ deck, count: counts.get(deck.id) ?? 0, tone: TONES[i % TONES.length]! }))
}
