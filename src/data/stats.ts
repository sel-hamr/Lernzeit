import { useMemo } from 'react'
import type { Card } from '@lernzeit/core/types'
import { indexMinutes, topicStreak, type Streak } from '@lernzeit/core/goals'
import { pickWordOfTheDay } from '@lernzeit/core/today'
import { useAllReviews, useAllSessions, useCards, useToday, useTopics } from './hooks'

/** Current and longest goal streak per topic id. */
export function useStreaks(): Map<string, Streak> | undefined {
  const topics = useTopics()
  const sessions = useAllSessions()
  const today = useToday()
  return useMemo(() => {
    if (!sessions) return undefined
    const index = indexMinutes(sessions)
    return new Map(topics.map((t) => [t.id, topicStreak(t, index, today)]))
  }, [topics, sessions, today])
}

export { pickWordOfTheDay }

export function useWordOfTheDay(): { card?: Card; loaded: boolean } {
  const cards = useCards()
  const reviews = useAllReviews()
  const today = useToday()
  return useMemo(() => {
    if (!cards || !reviews) return { loaded: false }
    return { card: pickWordOfTheDay(cards, reviews, today), loaded: true }
  }, [cards, reviews, today])
}
