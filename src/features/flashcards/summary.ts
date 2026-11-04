import type { Card, CardReview, Deck, ReviewLog } from '@/db/types'

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
