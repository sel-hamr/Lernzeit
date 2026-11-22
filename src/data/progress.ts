import { useMemo } from 'react'
import { buildTodayProgress, liveMinutesToday, type TodayProgress, type TopicProgress } from '@lernzeit/core/today'
import { isPaused } from '@lernzeit/core/timer'
import { useActiveTimer, useNow, useSessionsBetween, useToday, useTopics } from './hooks'

export { buildTodayProgress, liveMinutesToday, type TodayProgress, type TopicProgress }

export function useTodayProgress(): TodayProgress {
  const today = useToday()
  const topics = useTopics()
  const sessions = useSessionsBetween(today, today)
  const timer = useActiveTimer()
  const ticking = !!timer && !isPaused(timer)
  const now = useNow(ticking ? 1000 : 30_000)
  return useMemo(() => buildTodayProgress(topics, sessions, timer, now, today), [topics, sessions, timer, now, today])
}
