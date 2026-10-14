import type { Session, Topic, WeekGoals } from '@/db/types'
import { addDays, dateKey, weekdayOf, WEEKDAYS } from './time'

export function sameGoals(a: WeekGoals, b: WeekGoals): boolean {
  return WEEKDAYS.every((d) => a[d] === b[d])
}

export function uniformGoals(minutes: number): WeekGoals {
  return { mon: minutes, tue: minutes, wed: minutes, thu: minutes, fri: minutes, sat: minutes, sun: minutes }
}

/** Goal minutes that applied to a topic on a given day (0 before the topic existed). */
export function goalFor(topic: Topic, day: string): number {
  const history = topic.goalHistory
  if (!history.length) return topic.goalMinutes[weekdayOf(day)]
  let goals: WeekGoals | undefined
  for (const entry of history) {
    if (entry.since <= day) goals = entry.goals
    else break
  }
  return goals ? goals[weekdayOf(day)] : 0
}

/** Records a goal change from `today` on, replacing an edit made earlier the same day. */
export function withGoalChange(topic: Topic, goals: WeekGoals, today: string = dateKey()): Topic {
  const history = topic.goalHistory.filter((h) => h.since < today)
  const last = history.at(-1)
  if (!last || !sameGoals(last.goals, goals)) history.push({ since: today, goals })
  return { ...topic, goalMinutes: goals, goalHistory: history }
}

/** Describes a weekly goal: "2:30 h every day" or "15 h a week". */
export function describeGoals(goals: WeekGoals, fmt: (m: number) => string): string {
  const values = WEEKDAYS.map((d) => goals[d])
  if (values.every((v) => v === values[0])) return values[0] ? `${fmt(values[0])} h every day` : 'No daily goal'
  const total = values.reduce((a, b) => a + b, 0)
  return `${fmt(total)} h a week, varies by day`
}

export type MinutesIndex = Map<string, Map<string, number>>

/** date -> topicId -> minutes */
export function indexMinutes(sessions: Session[]): MinutesIndex {
  const index: MinutesIndex = new Map()
  for (const s of sessions) {
    let day = index.get(s.date)
    if (!day) index.set(s.date, (day = new Map()))
    day.set(s.topicId, (day.get(s.topicId) ?? 0) + s.minutes)
  }
  return index
}

export function minutesOn(index: MinutesIndex, day: string, topicId?: string): number {
  const entry = index.get(day)
  if (!entry) return 0
  if (topicId) return entry.get(topicId) ?? 0
  let total = 0
  for (const v of entry.values()) total += v
  return total
}

/** Floor to whole minutes so "done" and "left" always add up to the goal on screen. */
export function isGoalHit(done: number, goal: number): boolean {
  return goal > 0 && Math.floor(done + 1e-6) >= goal
}

export interface DayResult {
  day: string
  totalMinutes: number
  totalGoal: number
  /** Goals that applied this day (topics with goal > 0). */
  goalCount: number
  hitCount: number
  allHit: boolean
}

export function dayResult(topics: Topic[], index: MinutesIndex, day: string): DayResult {
  let totalGoal = 0
  let goalCount = 0
  let hitCount = 0
  for (const t of topics) {
    const goal = goalFor(t, day)
    if (goal <= 0) continue
    goalCount++
    totalGoal += goal
    if (isGoalHit(minutesOn(index, day, t.id), goal)) hitCount++
  }
  return {
    day,
    totalMinutes: minutesOn(index, day),
    totalGoal,
    goalCount,
    hitCount,
    allHit: goalCount > 0 && hitCount === goalCount,
  }
}

export interface Streak {
  current: number
  longest: number
}

/**
 * Streak of days where `hit(day)` is true. Days where `counts(day)` is false
 * (no goal that day) neither break nor extend a streak. Today only extends a
 * streak: an unfinished today never breaks it.
 */
export function computeStreak(opts: {
  firstDay: string
  today: string
  counts: (day: string) => boolean
  hit: (day: string) => boolean
}): Streak {
  const { firstDay, today, counts, hit } = opts
  let longest = 0
  let run = 0
  for (let day = firstDay; day <= today; day = addDays(day, 1)) {
    if (!counts(day)) continue
    if (hit(day)) {
      run++
      longest = Math.max(longest, run)
    } else if (day !== today) {
      run = 0
    }
  }
  return { current: run, longest }
}

export function topicStreak(topic: Topic, index: MinutesIndex, today: string, firstDay?: string): Streak {
  const start = firstDay ?? topic.goalHistory[0]?.since ?? dateKey(topic.createdAt)
  return computeStreak({
    firstDay: start,
    today,
    counts: (d) => goalFor(topic, d) > 0,
    hit: (d) => isGoalHit(minutesOn(index, d, topic.id), goalFor(topic, d)),
  })
}

export function earliestDay(topics: Topic[], sessions: Session[], today: string): string {
  let first = today
  for (const t of topics) {
    const since = t.goalHistory[0]?.since ?? dateKey(t.createdAt)
    if (since < first) first = since
  }
  for (const s of sessions) if (s.date < first) first = s.date
  return first
}
