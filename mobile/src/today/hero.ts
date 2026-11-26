import { dayResult, indexMinutes } from '@lernzeit/core/goals'
import { daysBetween, formatHM, startOfWeek, weekDays, weekdayOf, WEEKDAY_SHORT } from '@lernzeit/core/time'
import type { PracticeRun, Session, Topic } from '@lernzeit/core/types'

/** One day of the hero's week strip. */
export interface WeekBar {
  day: string
  /** "M", "T", "W"… */
  letter: string
  /** "Mon", for screen readers. */
  short: string
  minutes: number
  goal: number
  /** The fill, 0..1, against the busiest day or biggest goal of the week. */
  fill: number
  /** Where the day's goal sits on the same scale, 0..1 (0 without a goal). */
  goalAt: number
  hit: boolean
  today: boolean
  future: boolean
}

/**
 * Monday to Sunday of the week `today` falls in, from the history: minutes per day against that
 * day's goals (active topics only). `todayMinutes` replaces today's logged minutes, so a running
 * timer shows as it goes.
 */
export function weekStrip(topics: readonly Topic[], sessions: readonly Session[], today: string, todayMinutes?: number): WeekBar[] {
  const active = topics.filter((t) => !t.archived)
  const index = indexMinutes(sessions as Session[])
  const days = weekDays(startOfWeek(today)).map((day) => {
    const result = dayResult(active, index, day)
    const minutes = day === today && todayMinutes !== undefined ? todayMinutes : result.totalMinutes
    const goal = result.totalGoal
    return { day, minutes, goal, hit: goal > 0 && Math.floor(minutes + 1e-6) >= goal }
  })
  const scale = Math.max(1, ...days.map((d) => Math.max(d.minutes, d.goal)))
  return days.map((d) => {
    const short = WEEKDAY_SHORT[weekdayOf(d.day)]
    return {
      ...d,
      short,
      letter: short[0]!,
      fill: Math.min(1, d.minutes / scale),
      goalAt: d.goal / scale,
      today: d.day === today,
      future: d.day > today,
    }
  })
}

/** A tile in the Today stats row: a figure, its unit and what it counts. */
export interface StatTile {
  key: 'cards' | 'time' | 'streak'
  value: string
  unit: string
  label: string
}

/** Cards practised today, minutes practised and the streak, with units that agree with the number. */
export function statTiles(practised: { ms: number; reviewed: number }, streak: { days: number; topicName?: string }): StatTile[] {
  const minutes = Math.round(practised.ms / 60_000)
  const time = practised.ms > 0 && minutes < 1 ? '<1' : String(minutes)
  return [
    { key: 'cards', value: String(practised.reviewed), unit: '', label: practised.reviewed === 1 ? 'card practised' : 'cards practised' },
    { key: 'time', value: time, unit: 'min', label: 'practice time' },
    { key: 'streak', value: String(streak.days), unit: streak.days === 1 ? 'day' : 'days', label: streak.topicName ? `${streak.topicName} streak` : 'streak' },
  ]
}

/** The newest day each deck was practised on, from the practice log. */
export function lastPractisedByDeck(runs: readonly Pick<PracticeRun, 'day' | 'decks'>[]): Map<string, string> {
  const last = new Map<string, string>()
  for (const run of runs) {
    for (const deckId of Object.keys(run.decks)) {
      const was = last.get(deckId)
      if (!was || run.day > was) last.set(deckId, run.day)
    }
  }
  return last
}

/** "Practised today", "Practised yesterday", "Practised 3 days ago" or "Not practised yet". */
export function practisedLabel(day: string | undefined, today: string): string {
  if (!day) return 'Not practised yet'
  const ago = daysBetween(day, today)
  if (ago <= 0) return 'Practised today'
  if (ago === 1) return 'Practised yesterday'
  if (ago < 7) return `Practised ${ago} days ago`
  if (ago < 14) return 'Practised last week'
  return `Practised ${Math.floor(ago / 7)} weeks ago`
}

/** A friendly line in the hero: what is left, or a word of encouragement. */
export function heroLine(done: number, goal: number, left: number): string {
  if (goal === 0) return done > 0 ? 'No goal today, so every minute is a bonus' : 'A free day. Enjoy it'
  if (left === 0) return 'Every goal reached. Great work'
  if (done < 1) return 'A fresh day. Ten minutes is a good start'
  return `${formatHM(left)} h left, ${done / goal >= 0.5 ? 'more than halfway there' : 'keep it going'}`
}
