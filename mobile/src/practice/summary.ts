/* The numbers around a practice round (pure, so they are tested): the side counters, "12 / 40", the end screen's ring and lines. */
import { countRatings, type RoundRatings } from '@lernzeit/core/practice'
import { formatMinutesShort } from '@lernzeit/core/time'
import type { Grade } from '@lernzeit/core/types'

/** The two counters beside the card: cards at Again on the left, at Good or Easy on the right. Hard is in neither. */
export function sideCounts(ratings: RoundRatings): { again: number; good: number } {
  const c = countRatings(ratings)
  return { again: c[1], good: c[3] + c[4] }
}

/** How many cards got each rating so far, for the four counters above the card. */
export function gradeCounts(ratings: RoundRatings): Record<1 | 2 | 3 | 4, number> {
  const c = countRatings(ratings)
  return { 1: c[1], 2: c[2], 3: c[3], 4: c[4] }
}

/** "12 / 40": the card being shown out of the round, or the last one once the round is over. */
export function positionLabel(reviewed: number, remaining: number): string {
  const total = reviewed + remaining
  return `${Math.min(reviewed + (remaining > 0 ? 1 : 0), total)} / ${total}`
}

/** "45 s" under a minute, then "4 min" or "1:05 h". */
export function practiceTime(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  return s < 60 ? `${s} s` : formatMinutesShort(s / 60)
}

export interface RingSegment {
  grade: Grade
  count: number
  /** Where it starts and how long it is, as parts of the ring (0..1). */
  start: number
  size: number
}

export interface RoundSummary {
  total: number
  counts: Record<Grade, number>
  segments: RingSegment[]
  headline: string
  /** Good and Easy out of every card, 0..1. */
  share: number
}

const ORDER: Grade[] = [1, 2, 3, 4]

/** The end screen: the ring's segments (Again, Hard, Good, Easy; empty ones left out) and a friendly headline. */
export function roundSummary(ratings: RoundRatings): RoundSummary {
  const counts = countRatings(ratings)
  const total = ORDER.reduce((n, g) => n + counts[g], 0)
  let start = 0
  const segments: RingSegment[] = []
  for (const grade of ORDER) {
    if (!counts[grade]) continue
    const size = counts[grade] / total
    segments.push({ grade, count: counts[grade], start, size })
    start += size
  }
  const share = total ? (counts[3] + counts[4]) / total : 0
  const headline = !total ? 'Round done' : counts[1] === 0 && counts[2] === 0 ? 'Perfect round' : share >= 0.8 ? 'Great work' : share >= 0.5 ? 'Nice going' : 'Good practice'
  return { total, counts, segments, headline, share }
}
