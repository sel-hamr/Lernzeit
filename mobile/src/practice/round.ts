/*
 * The rules of a practice round, as the web's ReviewPage has them (pure, so they are tested): which
 * reviews a round holds, what a typed answer is compared with, how a rating moves the round on.
 */
import { checkAnswer, type CheckResult } from '@lernzeit/core/answer'
import { germanText, parseCloze, stripCloze } from '@lernzeit/core/german'
import { inPlan, type ReviewPlan } from '@lernzeit/core/practice'
import { buildPickedQueue, buildPracticeQueue, buildQueue, usageToday, type DeckUsage } from '@lernzeit/core/queue'
import { directionsFor } from '@lernzeit/core/srs'
import type { Card, CardReview, Deck, Direction, PracticeDeckTime, PracticeKind, ReviewLog } from '@lernzeit/core/types'
import type { RoundRatings } from '@lernzeit/core/practice'
import { newId } from '../data/ids'

export interface Progress {
  roundId: string
  kind: PracticeKind
  main: string[]
  learning: { id: string; due: number }[]
  current: string | null
  reviewed: number
  correct: number
  activeMs: number
  startedAt: number
  lastAt: number
  decks: Record<string, PracticeDeckTime>
  ratings: RoundRatings
}

export function startRound(kind: PracticeKind, main: string[], now: number): Omit<Progress, 'current'> {
  return { roundId: newId(), kind, main, learning: [], reviewed: 0, correct: 0, activeMs: 0, startedAt: now, lastAt: now, decks: {}, ratings: {} }
}

/** Practising a deck or picked cards: a rating says when the card comes back in the round. */
export const practisesDeck = (kind: PracticeKind) => kind === 'all' || kind === 'picked'

export interface RoundData {
  cards: Card[]
  decks: Deck[]
  reviews: CardReview[]
  logs: ReviewLog[]
  today: string
  now: number
}

/** The review ids and the kind of a round for `plan` (or one card). */
export function roundFor(plan: ReviewPlan, data: RoundData, cardId?: string): { ids: string[]; kind: PracticeKind } {
  const { cards, decks, reviews, logs, today, now } = data
  const createdAt = (id: string) => cards.find((c) => c.id === id)?.createdAt ?? 0
  const deckById = new Map(decks.map((d) => [d.id, d]))
  const practice = (every: boolean) =>
    buildPracticeQueue({ reviews: reviews.filter((r) => inPlan(r, plan)), decks, now, createdAt, size: every ? Infinity : undefined }).map((r) => r.id)
  if (cardId) {
    const card = cards.find((c) => c.id === cardId)
    const deck = card ? deckById.get(card.deckId) : undefined
    const dirs = card && deck ? directionsFor(card, deck) : []
    return { ids: reviews.filter((r) => r.cardId === cardId && dirs.includes(r.direction)).map((r) => r.id), kind: 'card' }
  }
  if (plan.scope === 'all') return { ids: practice(true), kind: 'all' }
  const usage: Map<string, DeckUsage> = usageToday(logs, today)
  const due = buildQueue({ reviews, decks, usage, now, createdAt }).queue.filter((r) => inPlan(r, plan)).map((r) => r.id)
  return due.length ? { ids: due, kind: 'due' } : { ids: practice(false), kind: 'practice' }
}

export { buildPickedQueue }

/** Expected typed answer for a review, and whether it is German. */
export function expectedAnswer(card: Card, direction: Direction, listening: boolean): { text: string; german: boolean } {
  if (listening) return { text: germanText(card), german: true }
  if (direction === 'deToEn') return { text: card.english, german: false }
  if (direction === 'cloze') return { text: parseCloze(card.german)?.answer ?? stripCloze(card.german), german: true }
  return { text: germanText(card), german: true }
}

export function checkTyped(typed: string, expected: { text: string; german: boolean }): CheckResult {
  if (expected.german) return checkAnswer(typed, expected.text)
  // English answers may list alternatives: "to go, to walk".
  const options = expected.text.split(/[,;/]/).map((s) => s.trim()).filter(Boolean)
  const strip = (s: string) => s.replace(/^(to|the|a|an)\s+/i, '')
  const results = [expected.text, ...options].map((o) => checkAnswer(strip(typed), strip(o)))
  const rank = { exact: 0, close: 1, wrong: 2 }
  const best = results.sort((a, b) => rank[a.verdict] - rank[b.verdict])[0]
  return { ...best, diff: checkAnswer(typed, expected.text).diff }
}
