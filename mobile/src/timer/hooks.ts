import type { ActiveTimer, Topic } from '@lernzeit/core/types'
import { useEffect, useMemo, useState } from 'react'
import { AppState } from 'react-native'
import { useLiveQuery } from '../store/live'
import { getPendingNote, getTimer, type PendingNote } from './timerStore'

/** The running timer (live), undefined when none. */
export function useActiveTimer(): ActiveTimer | undefined {
  return useLiveQuery(['kv'], (library) => getTimer(library), [])
}

export function usePendingNote(): PendingNote | undefined {
  return useLiveQuery(['kv'], (library) => getPendingNote(library), [])
}

/** Topics in order, archived ones left out unless asked for. */
export function useTopics(includeArchived = false): Topic[] {
  const all = useLiveQuery(['topics'], (library) => library.list<Topic>('topics'), [])
  return useMemo(() => all.filter((t) => includeArchived || !t.archived).sort((a, b) => a.order - b.order), [all, includeArchived])
}

/** The clock, ticking every `ms` while `active` (display only: the timer itself is timestamps). */
export function useNow(active = true, ms = 1000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const id = setInterval(() => setNow(Date.now()), ms)
    const sub = AppState.addEventListener('change', (s) => s === 'active' && setNow(Date.now()))
    return () => {
      clearInterval(id)
      sub.remove()
    }
  }, [active, ms])
  return now
}
