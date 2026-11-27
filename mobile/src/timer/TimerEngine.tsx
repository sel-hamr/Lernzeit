import { formatMinutesShort } from '@lernzeit/core/time'
import { isPaused, isPhaseComplete, ownsTimer, phaseEndAt } from '@lernzeit/core/timer'
import { useEffect, useRef } from 'react'
import { AppState } from 'react-native'
import { useSettings } from '../data/settings'
import { useLocalLibrary } from '../store/live'
import { useActiveTimer, useTopics } from './hooks'
import { cancelMatching, scheduleAt } from './notify'
import { completePhase, getDeviceId } from './timerStore'

const PREFIX = 'lz-timer'

/**
 * Watches the running timer. Ends its phases by timestamp (also catching up after the app was
 * closed), only on the device that started it, and keeps the local notifications for the phase ends
 * in step: scheduled on start/resume, cancelled on pause/stop. Renders nothing.
 */
export function TimerEngine() {
  const library = useLocalLibrary()
  const timer = useActiveTimer()
  const topics = useTopics(true)
  const settings = useSettings()
  const busy = useRef(false)
  const deviceId = getDeviceId(library)
  const owns = !!timer && ownsTimer(timer, deviceId)
  const topicName = topics.find((t) => t.id === timer?.topicId)?.name ?? 'Study'
  // Typing a note rewrites the timer; only a change of its clock matters here.
  const sig = timer ? [timer.runId, timer.cycle, timer.phase, timer.mode, timer.startedAt, timer.pausedAt, timer.pausedTotalMs, timer.targetMinutes, timer.breakMinutes].join('|') : ''
  const channel = settings.endSound === 'none' ? 'timer-silent' : 'timer'

  useEffect(() => {
    if (!timer || !owns) return
    const check = () => {
      if (busy.current || !isPhaseComplete(timer, Date.now())) return
      busy.current = true
      try {
        completePhase(library, { runId: timer.runId, cycle: timer.cycle, phase: timer.phase })
      } finally {
        busy.current = false
      }
    }
    check()
    const interval = setInterval(check, 1000)
    const sub = AppState.addEventListener('change', (s) => s === 'active' && check())
    return () => {
      clearInterval(interval)
      sub.remove()
    }
  }, [library, timer, owns])

  useEffect(() => {
    void (async () => {
      await cancelMatching(PREFIX)
      if (!timer || !owns || isPaused(timer)) return
      const end = phaseEndAt(timer)
      if (end === undefined) return
      if (timer.mode === 'countdown') {
        await scheduleAt(`${PREFIX}-end`, end, 'Time is up', `${formatMinutesShort(timer.targetMinutes ?? 0)} of ${topicName} done.`, channel)
      } else if (timer.mode === 'pomodoro' && timer.phase === 'focus') {
        await scheduleAt(`${PREFIX}-end`, end, 'Focus round done', `Take a ${timer.breakMinutes ?? 5} min break.`, channel)
        await scheduleAt(`${PREFIX}-break`, end + (timer.breakMinutes ?? 5) * 60_000, 'Break is over', `Ready for the next ${topicName} round.`, channel)
      } else if (timer.mode === 'pomodoro') {
        await scheduleAt(`${PREFIX}-break`, end, 'Break is over', `Ready for the next ${topicName} round.`, channel)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, owns, topicName, channel])

  return null
}
