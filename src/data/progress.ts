import { useMemo } from 'react'
import type { ActiveTimer, Session, Topic } from '@/db/types'
import { goalFor, isGoalHit } from '@/lib/goals'
import { MINUTE, startOfDayMs } from '@/lib/time'
import { isPaused, studiedMinutes } from '@/lib/timer'
import { useActiveTimer, useNow, useSessionsBetween, useToday, useTopics } from './hooks'

export interface TopicProgress {
  topic: Topic
  goal: number
  done: number
  left: number
  hit: boolean
  /** Minutes from the running timer included in `done`. */
  live: number
}

export interface TodayProgress {
  today: string
  topics: TopicProgress[]
  sessions: Session[]
  totalGoal: number
  /** Minutes worked today in all, the running timer included. */
  totalDone: number
  totalLeft: number
  goalsHit: number
  goalCount: number
  timer: ActiveTimer | null | undefined
  now: number
}

/** Minutes the running timer has added to today so far (time before midnight belongs to yesterday). */
export function liveMinutesToday(timer: ActiveTimer | null | undefined, now: number): number {
  if (!timer || (timer.mode === 'pomodoro' && timer.phase === 'break')) return 0
  const studied = studiedMinutes(timer, now)
  const sinceMidnight = (now - startOfDayMs(now)) / MINUTE
  return Math.max(0, Math.min(studied, sinceMidnight))
}

/**
 * Today's goals per topic, plus the time worked in total. `totalDone` counts every
 * session of the day, also on archived topics, so it is all the time you worked today.
 */
export function buildTodayProgress(
  topics: Topic[],
  sessions: Session[],
  timer: ActiveTimer | null | undefined,
  now: number,
  today: string,
): TodayProgress {
  const live = liveMinutesToday(timer, now)
  const rows: TopicProgress[] = topics.map((topic) => {
    const goal = goalFor(topic, today)
    const liveHere = timer?.topicId === topic.id ? live : 0
    const done = sessions.filter((s) => s.topicId === topic.id).reduce((sum, s) => sum + s.minutes, 0) + liveHere
    const doneWhole = Math.floor(done + 1e-6)
    return { topic, goal, done, left: Math.max(0, goal - doneWhole), hit: isGoalHit(done, goal), live: liveHere }
  })
  const withGoal = rows.filter((r) => r.goal > 0)
  return {
    today,
    topics: rows,
    sessions,
    totalGoal: withGoal.reduce((s, r) => s + r.goal, 0),
    totalDone: sessions.reduce((s, x) => s + x.minutes, 0) + live,
    totalLeft: withGoal.reduce((s, r) => s + r.left, 0),
    goalsHit: withGoal.filter((r) => r.hit).length,
    goalCount: withGoal.length,
    timer,
    now,
  }
}

export function useTodayProgress(): TodayProgress {
  const today = useToday()
  const topics = useTopics()
  const sessions = useSessionsBetween(today, today)
  const timer = useActiveTimer()
  const ticking = !!timer && !isPaused(timer)
  const now = useNow(ticking ? 1000 : 30_000)
  return useMemo(() => buildTodayProgress(topics, sessions, timer, now, today), [topics, sessions, timer, now, today])
}
