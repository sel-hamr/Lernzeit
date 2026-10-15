import { useEffect, useRef } from 'react'
import { newId } from '@/db/db'
import { useActiveTimer } from '@/data/hooks'
import { recordReadingTime } from '@/data/timer'
import { hideActivity, noteInput, showActivity, startActivity, tickActivity } from '@/lib/activity'
import { MINUTE } from '@/lib/time'

const INPUT_EVENTS = ['pointerdown', 'keydown', 'scroll', 'wheel', 'touchmove'] as const
const TICK_MS = 15_000
/** Saves at most this often while reading; the last bit is saved on leaving. */
const SAVE_EVERY_MS = 10_000

/**
 * Saves active reading time as a study session for `topicId`, the way review
 * time is saved: one session per visit that grows as you read, once it
 * reaches a minute. A running timer for the same topic already counts the
 * time, so nothing is saved then.
 */
export function useReadingTime({ storyId, title, topicId, enabled }: { storyId: string; title: string; topicId?: string; enabled: boolean }) {
  const timer = useActiveTimer()
  const timerTopic = useRef<string | undefined>(undefined)
  const storyTitle = useRef(title)

  useEffect(() => {
    timerTopic.current = timer?.topicId
    storyTitle.current = title
  }, [timer, title])

  useEffect(() => {
    if (!enabled || !topicId) return
    const runId = `reading:${storyId}:${newId()}`
    let activity = startActivity(Date.now())
    let savedMs = 0

    const save = (final = false) => {
      const { activeMs } = activity
      if (activeMs < MINUTE || timerTopic.current === topicId) return
      if (activeMs - savedMs < (final ? 1 : SAVE_EVERY_MS)) return
      savedMs = activeMs
      const end = Date.now()
      void recordReadingTime({ runId, topicId, start: end - activeMs, end, minutes: activeMs / MINUTE, title: storyTitle.current })
    }
    const onInput = () => {
      activity = noteInput(activity, Date.now())
    }
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        activity = hideActivity(activity, Date.now())
        save(true)
      } else {
        activity = showActivity(activity, Date.now())
      }
    }
    const interval = setInterval(() => {
      activity = tickActivity(activity, Date.now())
      save()
    }, TICK_MS)

    for (const type of INPUT_EVENTS) window.addEventListener(type, onInput, { passive: true })
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      clearInterval(interval)
      for (const type of INPUT_EVENTS) window.removeEventListener(type, onInput)
      document.removeEventListener('visibilitychange', onVisibility)
      activity = tickActivity(activity, Date.now())
      save(true)
    }
  }, [enabled, storyId, topicId])
}
