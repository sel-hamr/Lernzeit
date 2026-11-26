import type { Session } from '@lernzeit/core/types'

export interface SessionDay {
  day: string
  minutes: number
  sessions: Session[]
}

/**
 * The sessions on the given days, grouped by day: the newest day first, and in a day the latest
 * session first. Days without sessions are left out.
 */
export function sessionsByDay(sessions: Session[], days: string[]): SessionDay[] {
  const wanted = new Set(days)
  const byDay = new Map<string, Session[]>()
  for (const s of sessions) {
    if (!wanted.has(s.date)) continue
    const list = byDay.get(s.date)
    if (list) list.push(s)
    else byDay.set(s.date, [s])
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
    .map(([day, list]) => ({ day, minutes: list.reduce((sum, s) => sum + s.minutes, 0), sessions: list.sort((a, b) => b.start - a.start) }))
}
