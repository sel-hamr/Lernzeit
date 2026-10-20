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

/** How many cards one practice round holds. */
export const PRACTICE_SIZE = 20

/** A card rated this recently is left for last in a practice round, so another round brings other words. */
export const PRACTICE_REST_MS = 60 * 60_000

/**
 * Cards to practise when nothing is due, so a session never starts empty.
 * Studied cards come first, soonest due first (so cards held back by the
 * daily review limit lead), then new cards beyond the daily new limit, then
 * cards rated within PRACTICE_REST_MS, longest ago first.
 * Grading them still updates the schedule, like reviewing ahead in Anki.
 */
export function buildPracticeQueue(opts: {
  reviews: CardReview[]
  decks: Deck[]
  now: number
  createdAt?: (cardId: string) => number
  size?: number
}): CardReview[] {
  const { reviews, decks, now, createdAt, size = PRACTICE_SIZE } = opts
  const deckIds = new Set(decks.map((d) => d.id))
  const studied: CardReview[] = []
  const fresh: CardReview[] = []
  const recent: CardReview[] = []
  for (const r of reviews) {
    if (!deckIds.has(r.deckId)) continue
    if (r.state === State.New) fresh.push(r)
    else if ((r.fsrs.last_review ?? 0) > now - PRACTICE_REST_MS) recent.push(r)
    else studied.push(r)
  }
  studied.sort((a, b) => a.due - b.due)
  const order = (r: CardReview) => createdAt?.(r.cardId) ?? 0
  fresh.sort((a, b) => order(a) - order(b) || DIRECTION_RANK[a.direction] - DIRECTION_RANK[b.direction])
  recent.sort((a, b) => (a.fsrs.last_review ?? 0) - (b.fsrs.last_review ?? 0))
  return [...spreadSiblings(studied.slice(0, size)), ...spreadSiblings(fresh), ...spreadSiblings(recent)].slice(0, size)
}

/**
 * The cards you picked in Flashcards, as one round: each card's practised
 * directions (`directions`), in the order you picked them, one direction of
 * every card before the second direction of any. Deleted cards are skipped.
 */
export function buildPickedQueue(opts: { reviews: CardReview[]; cardIds: string[]; directions: (cardId: string) => Direction[] }): CardReview[] {
  const { reviews, cardIds, directions } = opts
  const byCard = new Map<string, CardReview[]>()
  for (const r of reviews) {
    const list = byCard.get(r.cardId)
    if (list) list.push(r)
    else byCard.set(r.cardId, [r])
  }
  const picked: CardReview[] = []
  for (const id of new Set(cardIds)) {
    const dirs = directions(id)
    const own = (byCard.get(id) ?? []).filter((r) => dirs.includes(r.direction))
    picked.push(...own.sort((a, b) => DIRECTION_RANK[a.direction] - DIRECTION_RANK[b.direction]))
  }
  return spreadSiblings(picked)
}

/**
 * Whether rating this review now studies it ahead of schedule: a known card
 * that is not due yet. Such a rating is capped like a practice round's.
 */
export function studiesAhead(review: Pick<CardReview, 'state' | 'due'>, now: number): boolean {
  return review.state === State.Review && review.due > now
}

/** What is left of a review session, as review ids. */
export interface SessionQueue {
  main: string[]
  learning: { id: string; due: number }[]
}

/**
 * Picks the next review of a session: learning cards that are due, then the
 * queue in order, then learning cards early rather than ending the session.
 * The word just shown (`lastId`, any direction) is passed over while another
 * word is left, so the same word never comes twice in a row.
 */
export function pickNextReview<T extends SessionQueue>(
  session: T,
  now: number,
  cardOf: (reviewId: string) => string | undefined,
  lastId?: string | null,
): T & { current: string | null } {
  const learning = [...session.learning].sort((a, b) => a.due - b.due)
  const candidates = [
    ...learning.filter((l) => l.due <= now).map((l) => ({ id: l.id, fromMain: false })),
    ...session.main.map((id) => ({ id, fromMain: true })),
    ...learning.filter((l) => l.due > now).map((l) => ({ id: l.id, fromMain: false })),
  ]
  const lastCard = lastId ? cardOf(lastId) : undefined
  const next = candidates.find((c) => lastCard === undefined || cardOf(c.id) !== lastCard) ?? candidates[0]
  if (!next) return { ...session, learning, current: null }
  return next.fromMain
    ? { ...session, learning, main: session.main.filter((id) => id !== next.id), current: next.id }
    : { ...session, learning: learning.filter((l) => l.id !== next.id), current: next.id }
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

