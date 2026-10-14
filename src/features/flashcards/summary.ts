import type { Card, CardReview, Deck, Direction, ReviewLog } from '@/db/types'
import { directionsFor, State } from '@/lib/srs'

export interface CardSummary {
  /** Earliest due time among the card's active directions. */
  due: number
  isNew: boolean
  learned: boolean
  directions: Direction[]
}

export function summarizeCard(card: Card, deck: Deck | undefined, reviews: CardReview[]): CardSummary {
  const directions = deck ? directionsFor(card, deck) : []
  const active = reviews.filter((r) => directions.includes(r.direction))
  const list = active.length ? active : reviews
  return {
    due: list.reduce((min, r) => Math.min(min, r.due), Number.POSITIVE_INFINITY),
    isNew: list.every((r) => r.state === State.New),
    learned: list.some((r) => r.state === State.Review),
    directions,
  }
}

export function groupByCard(reviews: CardReview[]): Map<string, CardReview[]> {
  const map = new Map<string, CardReview[]>()
  for (const r of reviews) {
    const list = map.get(r.cardId)
    if (list) list.push(r)
    else map.set(r.cardId, [r])
  }
  return map
}

/** "6 · 83% correct" — Hard, Good and Easy count as correct. */
export function reviewScore(logs: ReviewLog[]): string {
  if (!logs.length) return 'None yet'
  const correct = logs.filter((l) => l.rating > 1).length
  return `${logs.length} · ${Math.round((correct / logs.length) * 100)}% correct`
}

/** A level tag such as A1 or B2 makes a compact chip; otherwise the deck name. */
export function deckChipLabel(card: Card, deck: Deck | undefined): string {
  const level = card.tags.find((t) => /^[ABC][12]$/i.test(t))
  return level?.toUpperCase() ?? deck?.name ?? ''
}
