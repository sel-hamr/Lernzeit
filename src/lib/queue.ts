import type { CardReview, Deck, Direction, ReviewLog } from '@/db/types'
import { State } from './srs'

const DIRECTION_RANK: Record<Direction, number> = { imageToDe: 0, cloze: 0, enToDe: 1, deToEn: 2 }

/** Learning cards due within this window are shown early instead of ending the session. */
export const LEARN_AHEAD_MS = 20 * 60_000

export interface DeckUsage {
  /** Cards introduced today (any direction seen for the first time). */
  newCards: Set<string>
  reviewsDone: number
}

export function usageToday(logs: ReviewLog[], today: string): Map<string, DeckUsage> {
  const usage = new Map<string, DeckUsage>()
  for (const log of logs) {
    if (log.day !== today) continue
    let u = usage.get(log.deckId)
    if (!u) usage.set(log.deckId, (u = { newCards: new Set(), reviewsDone: 0 }))
    if (log.prevState === State.New) u.newCards.add(log.cardId)
    else if (log.prevState === State.Review) u.reviewsDone++
  }
  return usage
}

export interface QueueCounts {
  newCount: number
  reviewCount: number
  learningCount: number
  total: number
}

/**
 * Builds today's queue. Learning cards are always included when due; review
 * and new cards are capped by each deck's daily limits. New cards from one
 * card (several directions) are spread out by ordering on card creation.
 */
export function buildQueue(opts: {
  reviews: CardReview[]
  decks: Deck[]
  usage: Map<string, DeckUsage>
  now: number
  /** Optional card creation time, so new cards come in the order they were added. */
  createdAt?: (cardId: string) => number
}): { queue: CardReview[]; counts: QueueCounts } {
  const { reviews, decks, usage, now, createdAt } = opts
  const deckById = new Map(decks.map((d) => [d.id, d]))
  const learning: CardReview[] = []
  const due: CardReview[] = []
  const fresh: CardReview[] = []

  for (const r of reviews) {
    if (!deckById.has(r.deckId)) continue
    if (r.state === State.New) fresh.push(r)
    else if (r.state === State.Learning || r.state === State.Relearning) {
      if (r.due <= now + LEARN_AHEAD_MS) learning.push(r)
    } else if (r.due <= now) due.push(r)
  }

  due.sort((a, b) => a.due - b.due)
  learning.sort((a, b) => a.due - b.due)
  const order = (r: CardReview) => createdAt?.(r.cardId) ?? 0
  // Image → German is the main direction, so a new card starts with it.
  fresh.sort((a, b) => order(a) - order(b) || DIRECTION_RANK[a.direction] - DIRECTION_RANK[b.direction])

  const pickedDue: CardReview[] = []
  const pickedNew: CardReview[] = []
  const left = new Map<string, { n: number; r: number }>()
  for (const deck of decks) {
    const u = usage.get(deck.id)
    left.set(deck.id, {
      n: Math.max(0, deck.newPerDay - (u?.newCards.size ?? 0)),
      r: Math.max(0, deck.reviewsPerDay - (u?.reviewsDone ?? 0)),
    })
  }
  for (const r of due) {
    const l = left.get(r.deckId)!
    if (l.r > 0) {
      l.r--
      pickedDue.push(r)
    }
  }
  // New-card limits count cards, not directions: all directions of a new
  // card share one slot so the limit means "new words per day".
  const newCardSlots = new Map<string, Set<string>>()
  for (const r of fresh) {
    const l = left.get(r.deckId)!
    const seen = newCardSlots.get(r.deckId) ?? new Set<string>(usage.get(r.deckId)?.newCards)
    newCardSlots.set(r.deckId, seen)
    if (seen.has(r.cardId)) {
      pickedNew.push(r)
      continue
    }
    if (l.n > 0) {
      l.n--
      seen.add(r.cardId)
      pickedNew.push(r)
    }
  }

  const queue = interleave([...learning, ...pickedDue], spreadSiblings(pickedNew))
  return {
    queue,
    counts: {
      newCount: pickedNew.length,
      reviewCount: pickedDue.length,
      learningCount: learning.length,
      total: queue.length,
    },
  }
}

/** Keeps two directions of the same card from appearing back to back. */
export function spreadSiblings(items: CardReview[]): CardReview[] {
  const firsts: CardReview[] = []
  const rest: CardReview[] = []
  const seen = new Set<string>()
  for (const r of items) {
    if (seen.has(r.cardId)) rest.push(r)
    else {
      seen.add(r.cardId)
      firsts.push(r)
    }
  }
  return [...firsts, ...rest]
}

/** Mixes new cards in among reviews (one new after every few reviews). */
function interleave(reviews: CardReview[], fresh: CardReview[]): CardReview[] {
  if (!fresh.length) return reviews
  if (!reviews.length) return fresh
  const out: CardReview[] = []
  const step = Math.max(1, Math.floor(reviews.length / fresh.length))
  let f = 0
  reviews.forEach((r, i) => {
    out.push(r)
    if ((i + 1) % step === 0 && f < fresh.length) out.push(fresh[f++])
  })
  while (f < fresh.length) out.push(fresh[f++])
  return out
}

