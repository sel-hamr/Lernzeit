/*
 * Active time on a reading or practice page, saved as a study session the way review time is
 * (src/data/studyTime.ts on the web): one session per visit that grows while you work, once it
 * reaches a minute. Time counts while the app is in front and you touched the screen lately
 * (core's activity rules). A running timer for the same topic already counts the time.
 */
import { hideActivity, noteInput, showActivity, startActivity, tickActivity } from '@lernzeit/core/activity'
import { splitAtMidnight } from '@lernzeit/core/sessions'
import { MINUTE } from '@lernzeit/core/time'
import type { Session, SessionSource } from '@lernzeit/core/types'
import { useCallback, useEffect, useRef } from 'react'
import { AppState } from 'react-native'
import { newId } from '../data/ids'
import type { LocalLibrary } from '../store/library'
import { useLocalLibrary } from '../store/live'
import { useActiveTimer } from '../timer/hooks'
import { zoneOf } from '../timer/timerStore'

export interface MeasuredRun {
  runId: string
  topicId: string
  start: number
  end: number
  minutes: number
}

const TICK_MS = 15_000
const SAVE_EVERY_MS = 10_000

/** Saves a run as sessions split at midnight; saving the same run again replaces it. */
export function recordStudyTime(library: LocalLibrary, run: MeasuredRun, source: SessionSource, note: string): void {
  library.write(() => {
    for (const id of library.listIds('sessions', { runId: run.runId })) library.remove('sessions', id)
    splitAtMidnight(run.start, run.end, run.minutes, zoneOf(library)).forEach((p, i) => {
      const session: Session = { id: `${run.runId}:${i}`, topicId: run.topicId, start: p.start, end: p.end, minutes: p.minutes, date: p.date, note, source, runId: run.runId }
      library.put('sessions', session)
    })
  })
}

/** What to save once `activeMs` of activity has passed: nothing below a minute, or while the same topic's timer runs. */
export function runToSave(activeMs: number, savedMs: number, final: boolean, timerTopic: string | undefined, topicId: string): boolean {
  if (activeMs < MINUTE || timerTopic === topicId) return false
  return activeMs - savedMs >= (final ? 1 : SAVE_EVERY_MS)
}

/**
 * Counts active time while the page is open. Returns `touch`, for the page's root view
 * (`onTouchStart`) and scroll views, so the time keeps counting while you read.
 */
export function useActiveStudyTime({ kind, id, topicId, enabled, source, note }: { kind: string; id: string; topicId?: string; enabled: boolean; source: SessionSource; note: string }): () => void {
  const library = useLocalLibrary()
  const timer = useActiveTimer()
  const timerTopic = useRef<string | undefined>(undefined)
  const noteRef = useRef(note)
  const touchRef = useRef<() => void>(() => {})

  useEffect(() => {
    timerTopic.current = timer?.topicId
    noteRef.current = note
  }, [timer, note])

  useEffect(() => {
    if (!enabled || !topicId) {
      touchRef.current = () => {}
      return
    }
    const runId = `${kind}:${id}:${newId()}`
    let activity = startActivity(Date.now())
    let savedMs = 0
    const flush = (final = false) => {
      const { activeMs } = activity
      if (!runToSave(activeMs, savedMs, final, timerTopic.current, topicId)) return
      savedMs = activeMs
      const end = Date.now()
      recordStudyTime(library, { runId, topicId, start: end - activeMs, end, minutes: activeMs / MINUTE }, source, noteRef.current)
    }
    touchRef.current = () => {
      activity = noteInput(activity, Date.now())
    }
    const interval = setInterval(() => {
      activity = tickActivity(activity, Date.now())
      flush()
    }, TICK_MS)
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') activity = showActivity(activity, Date.now())
      else {
        activity = hideActivity(activity, Date.now())
        flush(true)
      }
    })
    return () => {
      clearInterval(interval)
      sub.remove()
      activity = tickActivity(activity, Date.now())
      flush(true)
      touchRef.current = () => {}
    }
  }, [enabled, topicId, kind, id, source, library])

  return useCallback(() => touchRef.current(), [])
}
