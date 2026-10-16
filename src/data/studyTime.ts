import { useEffect, useRef } from 'react'
import { newId } from '@/db/db'
import { hideActivity, noteInput, showActivity, startActivity, tickActivity } from '@/lib/activity'
import { MINUTE } from '@/lib/time'
import { useActiveTimer } from './hooks'

const INPUT_EVENTS = ['pointerdown', 'keydown', 'scroll', 'wheel', 'touchmove'] as const
const TICK_MS = 15_000
/** Saves at most this often; the last bit is saved on leaving. */
const SAVE_EVERY_MS = 10_000

export interface ActiveRun {
  runId: string
  topicId: string
  start: number
  end: number
  minutes: number
}

/**
 * Saves active time on a page as a study session for `topicId`, the way
 * review time is saved: one session per visit that grows while you work,
 * once it reaches a minute. A running timer for the same topic already
 * counts the time, so nothing is saved then. `kind` and `id` name the run,
 * e.g. "reading" and the story's id; a new `id` starts a new session.
 */
export function useActiveStudyTime({
  kind,
  id,
  topicId,
  enabled,
  save,
}: {
  kind: string
  id: string
  topicId?: string
  enabled: boolean
  save: (run: ActiveRun) => Promise<void>
}) {
  const timer = useActiveTimer()
  const timerTopic = useRef<string | undefined>(undefined)
  const saveRef = useRef(save)

  useEffect(() => {
    timerTopic.current = timer?.topicId
    saveRef.current = save
  }, [timer, save])

  useEffect(() => {
    if (!enabled || !topicId) return
    const runId = `${kind}:${id}:${newId()}`
    let activity = startActivity(Date.now())
    let savedMs = 0

    const flush = (final = false) => {
      const { activeMs } = activity
      if (activeMs < MINUTE || timerTopic.current === topicId) return
      if (activeMs - savedMs < (final ? 1 : SAVE_EVERY_MS)) return
      savedMs = activeMs
      const end = Date.now()
      void saveRef.current({ runId, topicId, start: end - activeMs, end, minutes: activeMs / MINUTE })
    }
    const onInput = () => {
      activity = noteInput(activity, Date.now())
    }
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        activity = hideActivity(activity, Date.now())
        flush(true)
      } else {
        activity = showActivity(activity, Date.now())
      }
    }
    const interval = setInterval(() => {
      activity = tickActivity(activity, Date.now())
      flush()
    }, TICK_MS)

    for (const type of INPUT_EVENTS) window.addEventListener(type, onInput, { passive: true })
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      clearInterval(interval)
      for (const type of INPUT_EVENTS) window.removeEventListener(type, onInput)
      document.removeEventListener('visibilitychange', onVisibility)
      activity = tickActivity(activity, Date.now())
      flush(true)
    }
  }, [enabled, kind, id, topicId])
}
