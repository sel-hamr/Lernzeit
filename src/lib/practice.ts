import type { CardReview, Direction, PracticeDeckTime, PracticeRun } from '@/db/types'
import { addDays, dateKey, formatDayMonthShort } from './time'

export const ALL_DIRECTIONS: Direction[] = ['imageToDe', 'enToDe', 'deToEn', 'cloze']

/**
 * What a review session takes: the decks and directions, and whether only the
 * cards due now or every card (Practise deck). An empty list means every deck,
 * or every direction.
 */
export interface ReviewPlan {
  deckIds: string[]
  directions: Direction[]
  scope: 'due' | 'all'
}

const isDirection = (value: string): value is Direction => (ALL_DIRECTIONS as string[]).includes(value)

/** The plan in the review page's address. `deck=` is the older one-deck link. */
export function readPlan(params: URLSearchParams): ReviewPlan {
  const list = (key: string) => (params.get(key) ?? '').split(',').filter(Boolean)
  return {
    deckIds: [...new Set([...list('decks'), ...list('deck')])],
    directions: [...new Set(list('dirs').filter(isDirection))],
    scope: params.get('cards') === 'all' ? 'all' : 'due',
  }
}

/**
 * "/flashcards/review?decks=a&dirs=enToDe&cards=all". The directions are left
 * out when they are all of the deck's (`available`), so the address stays short.
 */
export function planHref(plan: ReviewPlan, available: Direction[]): string {
  const params = new URLSearchParams()
  if (plan.deckIds.length) params.set('decks', plan.deckIds.join(','))
  if (plan.directions.length && !available.every((d) => plan.directions.includes(d))) params.set('dirs', plan.directions.join(','))
  if (plan.scope === 'all') params.set('cards', 'all')
  const query = params.toString().replaceAll('%2C', ',')
  return query ? `/flashcards/review?${query}` : '/flashcards/review'
}

export function inPlan(review: Pick<CardReview, 'deckId' | 'direction'>, plan: Pick<ReviewPlan, 'deckIds' | 'directions'>): boolean {
  return (!plan.deckIds.length || plan.deckIds.includes(review.deckId)) && (!plan.directions.length || plan.directions.includes(review.direction))
}

/** Adds one rated card to a session's time per deck. */
export function addDeckTime(decks: Record<string, PracticeDeckTime>, deckId: string, ms: number, correct: boolean): Record<string, PracticeDeckTime> {
  const was = decks[deckId] ?? { ms: 0, reviewed: 0, correct: 0 }
  return { ...decks, [deckId]: { ms: was.ms + ms, reviewed: was.reviewed + 1, correct: was.correct + (correct ? 1 : 0) } }
}

export interface PracticeTotals {
  sessions: number
  ms: number
  reviewed: number
  correct: number
  /** When the last session ended; 0 before the first. */
  last: number
}

const EMPTY_TOTALS: PracticeTotals = { sessions: 0, ms: 0, reviewed: 0, correct: 0, last: 0 }

/** A session as one deck saw it, or the whole session when no deck is given. Undefined when it never asked that deck. */
export function runPart(run: PracticeRun, deckId?: string): PracticeDeckTime | undefined {
  if (!deckId) return { ms: run.activeMs, reviewed: run.reviewed, correct: run.correct }
  return run.decks[deckId]
}

/** Sessions, time and reviews, for every deck or for one. */
export function practiceTotals(runs: PracticeRun[], deckId?: string): PracticeTotals {
  const totals = { ...EMPTY_TOTALS }
  for (const run of runs) {
    const part = runPart(run, deckId)
    if (!part) continue
    totals.sessions++
    totals.ms += part.ms
    totals.reviewed += part.reviewed
    totals.correct += part.correct
    totals.last = Math.max(totals.last, run.end)
  }
  return totals
}

/** Totals per deck, most practised first. A session that mixed decks counts once for each. */
export function totalsByDeck(runs: PracticeRun[]): [string, PracticeTotals][] {
  const ids = new Set(runs.flatMap((r) => Object.keys(r.decks)))
  return [...ids].map((id): [string, PracticeTotals] => [id, practiceTotals(runs, id)]).sort((a, b) => b[1].ms - a[1].ms)
}

/** "83%", or an empty string before the first review. */
export function percentCorrect(t: Pick<PracticeTotals, 'reviewed' | 'correct'>): string {
  return t.reviewed ? `${Math.round((t.correct / t.reviewed) * 100)}%` : ''
}

/** "45 s", "12 min", "1 h 05 min". Practice sessions are short, so seconds count below a minute. */
export function formatPracticeTime(ms: number): string {
  const seconds = Math.round(ms / 1000)
  if (seconds < 60) return `${seconds} s`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min`
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')} min`
}

/** "Today", "Yesterday", "3 Nov", or "Never" before the first session. */
export function formatLastPractised(last: number, now: number = Date.now()): string {
  if (!last) return 'Never'
  const day = dateKey(last)
  if (day === dateKey(now)) return 'Today'
  if (day === addDays(dateKey(now), -1)) return 'Yesterday'
  return formatDayMonthShort(day)
}
