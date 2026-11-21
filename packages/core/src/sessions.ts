import { dateKey, MINUTE, nextMidnightMs } from './time'

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
 */
export function splitAtMidnight(start: number, end: number, activeMinutes?: number): SessionPart[] {
  if (end <= start) return []
  const wallMinutes = (end - start) / MINUTE
  const active = activeMinutes ?? wallMinutes
  const parts: SessionPart[] = []
  let cursor = start
  while (cursor < end) {
    const boundary = Math.min(nextMidnightMs(cursor), end)
    const share = (boundary - cursor) / MINUTE / wallMinutes
    parts.push({ start: cursor, end: boundary, date: dateKey(cursor), minutes: round2(active * share) })
    cursor = boundary
  }
  // Rounding must not create or lose time.
  const drift = round2(active - parts.reduce((sum, p) => sum + p.minutes, 0))
  if (drift !== 0) parts[parts.length - 1].minutes = round2(parts[parts.length - 1].minutes + drift)
  return parts.filter((p) => p.minutes > 0)
}
