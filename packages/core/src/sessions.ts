import type { Session } from './types'
import { dateKey, dateKeyIn, MINUTE, nextMidnightIn, nextMidnightMs } from './time'

export interface SessionPart {
  start: number
  end: number
  date: string
  minutes: number
}

const round2 = (n: number) => Math.round(n * 100) / 100

/**
 * Splits a run into one part per calendar day. `activeMinutes` (pauses
 * excluded) is shared out in proportion to the wall-clock time on each day.
 * Days are this machine's, or those of `timeZone` when it is given (the
 * Worker runs in UTC, the owner does not).
 */
export function splitAtMidnight(start: number, end: number, activeMinutes?: number, timeZone?: string): SessionPart[] {
  if (end <= start) return []
  const nextMidnight = timeZone ? (ms: number) => nextMidnightIn(ms, timeZone) : nextMidnightMs
  const dateOf = timeZone ? (ms: number) => dateKeyIn(ms, timeZone) : dateKey
  const wallMinutes = (end - start) / MINUTE
  const active = activeMinutes ?? wallMinutes
  const parts: SessionPart[] = []
  let cursor = start
  while (cursor < end) {
    const midnight = nextMidnight(cursor)
    // A boundary that does not move on would never end the loop: the rest goes to this day.
    const boundary = midnight > cursor ? Math.min(midnight, end) : end
    const share = (boundary - cursor) / MINUTE / wallMinutes
    parts.push({ start: cursor, end: boundary, date: dateOf(cursor), minutes: round2(active * share) })
    cursor = boundary
  }
  // Rounding must not create or lose time.
  const drift = round2(active - parts.reduce((sum, p) => sum + p.minutes, 0))
  if (drift !== 0) parts[parts.length - 1].minutes = round2(parts[parts.length - 1].minutes + drift)
  return parts.filter((p) => p.minutes > 0)
}

/** Study time logged away from the timer, as one session per day (see `splitAtMidnight`), all with `runId`. */
export function manualSessions(input: { topicId: string; start: number; minutes: number; note?: string }, runId: string, timeZone?: string): Session[] {
  const end = input.start + input.minutes * MINUTE
  return splitAtMidnight(input.start, end, input.minutes, timeZone).map((p, i) => ({
    id: `${runId}:${i}`,
    topicId: input.topicId,
    start: p.start,
    end: p.end,
    minutes: p.minutes,
    date: p.date,
    note: input.note?.trim() || undefined,
    source: 'timer',
    runId,
  }))
}
