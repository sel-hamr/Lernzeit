import type { Session, Topic } from '@/db/types'
import { dayResult, goalFor, isGoalHit, minutesOn, type DayResult, type MinutesIndex } from './goals'
import { addDays, formatDayMonthShort, formatHM, formatMonthYear, parseDateKey, startOfWeek, weekdayOf, WEEKDAY_LONG } from './time'

export interface WeekSummary {
  days: DayResult[]
  totalMinutes: number
  totalGoal: number
  /** Days with at least one goal, up to today. */
  countedDays: number
  allHitDays: number
}

export function weekSummary(topics: Topic[], index: MinutesIndex, days: string[], today: string): WeekSummary {
  const results = days.map((d) => dayResult(topics, index, d))
  const upToToday = results.filter((r) => r.day <= today && r.goalCount > 0)
  return {
    days: results,
    totalMinutes: results.reduce((s, r) => s + r.totalMinutes, 0),
    totalGoal: results.reduce((s, r) => s + r.totalGoal, 0),
    countedDays: upToToday.length,
    allHitDays: upToToday.filter((r) => r.allHit).length,
  }
}

export interface TopicWeek {
  topic: Topic
  hits: number
  counted: number
  note: string
}

/** "Hit 3 of 7" plus a one-line comment, e.g. "Best day Friday · 2:30 h" or "Missed on the weekend". */
export function topicWeek(topic: Topic, index: MinutesIndex, days: string[], today: string): TopicWeek {
  const relevant = days.filter((d) => d <= today && goalFor(topic, d) > 0)
  const hitDays = relevant.filter((d) => isGoalHit(minutesOn(index, d, topic.id), goalFor(topic, d)))
  const missed = relevant.filter((d) => !hitDays.includes(d))
  let best: { day: string; minutes: number } | null = null
  for (const d of days) {
    const m = minutesOn(index, d, topic.id)
    if (m > 0 && (!best || m > best.minutes)) best = { day: d, minutes: m }
  }

  let note: string
  if (!relevant.length) note = days[0] > today ? 'This week has not started' : 'No goal on these days'
  else if (!best) note = 'No study time yet'
  else if (missed.length === 0) note = `Hit every day · best ${WEEKDAY_LONG[weekdayOf(best.day)]}`
  else if (missed.length && missed.every((d) => ['sat', 'sun'].includes(weekdayOf(d))) && missed.length <= 2) note = 'Missed on the weekend'
  else note = `Best day ${WEEKDAY_LONG[weekdayOf(best.day)]} · ${formatHM(best.minutes)} h`
  return { topic, hits: hitDays.length, counted: relevant.length, note }
}

export type HeatLevel = 0 | 1 | 2 | 3 | 4

/** 0 = nothing, 4 = goal hit; 1–3 by share of the goal (or by time on goal-free days). */
export function heatLevel(done: number, goal: number, hit: boolean): HeatLevel {
  if (done < 1) return 0
  if (goal > 0) {
    if (hit) return 4
    const ratio = done / goal
    return ratio < 1 / 3 ? 1 : ratio < 2 / 3 ? 2 : 3
  }
  return done < 30 ? 1 : done < 90 ? 2 : 3
}

export function dayHeat(topics: Topic[], index: MinutesIndex, day: string, topicId?: string): { level: HeatLevel; minutes: number; goal: number; hit: boolean } {
  if (topicId) {
    const topic = topics.find((t) => t.id === topicId)
    const goal = topic ? goalFor(topic, day) : 0
    const minutes = minutesOn(index, day, topicId)
    const hit = isGoalHit(minutes, goal)
    return { level: heatLevel(minutes, goal, hit), minutes, goal, hit }
  }
  const r = dayResult(topics, index, day)
  return { level: heatLevel(r.totalMinutes, r.totalGoal, r.allHit), minutes: r.totalMinutes, goal: r.totalGoal, hit: r.allHit }
}

/** Monday-based weeks ending with the week of `today`, oldest first. */
export function heatmapWeeks(today: string, weeks: number): string[][] {
  const lastMonday = startOfWeek(today)
  return Array.from({ length: weeks }, (_, w) => {
    const monday = addDays(lastMonday, -7 * (weeks - 1 - w))
    return Array.from({ length: 7 }, (_, d) => addDays(monday, d))
  })
}

/** Streak where every goal of the day was hit (days without goals are skipped). */
export function allGoalsStreak(topics: Topic[], index: MinutesIndex, firstDay: string, today: string): number {
  let run = 0
  for (let day = firstDay; day <= today; day = addDays(day, 1)) {
    const r = dayResult(topics, index, day)
    if (r.goalCount === 0) continue
    if (r.allHit) run++
    else if (day !== today) run = 0
  }
  return run
}

export interface HoursBucket {
  key: string
  label: string
  /** topicId -> hours */
  [topicId: string]: string | number
}

/** Hours per topic for the last `count` weeks or months (oldest first). */
export function hoursByPeriod(sessions: Session[], topics: Topic[], mode: 'week' | 'month', today: string, count: number): HoursBucket[] {
  const keys: string[] = []
  if (mode === 'week') {
    const monday = startOfWeek(today)
    for (let i = count - 1; i >= 0; i--) keys.push(addDays(monday, -7 * i))
  } else {
    const d = parseDateKey(today)
    for (let i = count - 1; i >= 0; i--) {
      const m = new Date(d.getFullYear(), d.getMonth() - i, 1)
      keys.push(`${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}-01`)
    }
  }
  const buckets = new Map<string, HoursBucket>(
    keys.map((k) => [k, { key: k, label: mode === 'week' ? formatDayMonthShort(k) : formatMonthYear(k) } as HoursBucket]),
  )
  for (const b of buckets.values()) for (const t of topics) b[t.id] = 0
  for (const s of sessions) {
    const key = mode === 'week' ? startOfWeek(s.date) : `${s.date.slice(0, 7)}-01`
    const bucket = buckets.get(key)
    if (!bucket || !(s.topicId in bucket)) continue
    bucket[s.topicId] = Math.round(((bucket[s.topicId] as number) + s.minutes / 60) * 100) / 100
  }
  return [...buckets.values()]
}
