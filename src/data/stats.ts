import { useMemo } from 'react'
import type { Card, CardReview } from '@/db/types'
import { indexMinutes, topicStreak, type Streak } from '@/lib/goals'
import { State } from '@/lib/srs'
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

function dayHash(day: string): number {
  let h = 0
  for (const ch of day) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return h
}

/**
 * A different learned word each day (stable through the day). Falls back to
 * any word with an image while nothing has been learned yet.
 */
export function pickWordOfTheDay(cards: Card[], reviews: CardReview[], day: string): Card | undefined {
  const learned = new Set(reviews.filter((r) => r.state === State.Review).map((r) => r.cardId))
  const words = cards.filter((c) => c.type === 'word').sort((a, b) => a.id.localeCompare(b.id))
  const pictured = (c: Card) => !!c.imageId || !!c.emoji
  // Nouns with a picture make the nicest word of the day.
  let pool = words.filter((c) => learned.has(c.id) && pictured(c))
  if (!pool.length) pool = words.filter((c) => learned.has(c.id))
  if (!pool.length) pool = words.filter((c) => pictured(c) && (c.gender || c.partOfSpeech === 'noun'))
  if (!pool.length) pool = words
  return pool.length ? pool[dayHash(day) % pool.length] : undefined
}

export function useWordOfTheDay(): { card?: Card; loaded: boolean } {
  const cards = useCards()
  const reviews = useAllReviews()
  const today = useToday()
  return useMemo(() => {
    if (!cards || !reviews) return { loaded: false }
    return { card: pickWordOfTheDay(cards, reviews, today), loaded: true }
  }, [cards, reviews, today])
}
