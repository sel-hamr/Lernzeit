import { buildToday, type TodayView } from '@lernzeit/core/today'
import type { Card, CardReview, PracticeRun, Session, Topic } from '@lernzeit/core/types'
import { useEffect, useMemo, useState } from 'react'
import { AppState } from 'react-native'
import { useLiveQuery } from '../store/live'
import { useActiveTimer, useNow } from '../timer/hooks'
import { isPaused } from '@lernzeit/core/timer'
import { lastPractisedByDeck, weekStrip, type WeekBar } from './hero'

/** Today's view plus this week's bars and the day each deck was last practised. */
export type TodayScreenView = TodayView & { week: WeekBar[]; lastPractised: Map<string, string> }

/**
 * Today's numbers over the local store, read again after each write to the tables they come from.
 * The date is the synced `kv/timeZone` zone's (the device's zone before one is recorded). At
 * midnight, and when the app comes back to the front, the day is worked out again.
 */
export function useTodayView(): TodayScreenView {
  const [now, setNow] = useState(() => Date.now())
  const timeZone = useLiveQuery(
    ['kv'],
    (library) => {
      const zone = library.get<{ value?: unknown }>('kv', 'timeZone')?.value
      return typeof zone === 'string' && zone ? zone : undefined
    },
    [],
  )
  const topics = useLiveQuery(['topics'], (library) => library.list<Topic>('topics'), [])
  const sessions = useLiveQuery(['sessions'], (library) => library.list<Session>('sessions'), [])
  const cards = useLiveQuery(['cards'], (library) => library.list<Card>('cards'), [])
  const reviews = useLiveQuery(['reviews'], (library) => library.list<CardReview>('reviews'), [])
  const practiceRuns = useLiveQuery(['practiceRuns'], (library) => library.list<PracticeRun>('practiceRuns'), [])

  const timer = useActiveTimer()
  // A running timer adds to today's minutes as it goes: read again every 15 seconds.
  const tick = useNow(!!timer && !isPaused(timer), 15_000)
  const at = timer ? Math.max(now, tick) : now
  const view = useMemo(
    () => buildToday({ topics, sessions, cards, reviews, practiceRuns, now: at, timeZone, timer }),
    [topics, sessions, cards, reviews, practiceRuns, at, timeZone, timer],
  )

  const week = useMemo(() => weekStrip(topics, sessions, view.today, view.progress.totalDone), [topics, sessions, view.today, view.progress.totalDone])
  const lastPractised = useMemo(() => lastPractisedByDeck(practiceRuns), [practiceRuns])

  const dayEndsAt = view.dayEndsAt
  useEffect(() => {
    // A little after midnight, so the new day has really begun.
    const timer = setTimeout(() => setNow(Date.now()), Math.max(1000, dayEndsAt - Date.now() + 500))
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') setNow(Date.now())
    })
    return () => {
      clearTimeout(timer)
      subscription.remove()
    }
  }, [dayEndsAt])

  return useMemo(() => ({ ...view, week, lastPractised }), [view, week, lastPractised])
}
