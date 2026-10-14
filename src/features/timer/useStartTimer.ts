import { useNavigate } from 'react-router'
import { useFeedback } from '@/components/ui/feedback'
import { updateSettings } from '@/db/db'
import type { TimerMode } from '@/db/types'
import { useActiveTimer, useSettings, useTopics } from '@/data/hooks'
import { startTimer } from '@/data/timer'
import { unlockAudio } from '@/lib/sound'

/** Countdown length offered for a topic: what is left today, or 25 min once the goal is met. */
export function defaultCountdown(leftMinutes: number): number {
  return leftMinutes >= 5 ? Math.round(leftMinutes) : 25
}

/**
 * Starts a timer for a topic and opens the timer page. If another timer is
 * running, asks first; its time so far is saved before the new one starts.
 */
export function useStartTimer() {
  const navigate = useNavigate()
  const { confirm } = useFeedback()
  const timer = useActiveTimer()
  const topics = useTopics(true)
  const settings = useSettings()

  return async (topicId: string, opts: { leftMinutes: number; mode?: TimerMode; minutes?: number; stay?: boolean }) => {
    unlockAudio()
    if (timer && timer.topicId === topicId) {
      if (!opts.stay) navigate('/timer')
      return
    }
    if (timer) {
      const running = topics.find((t) => t.id === timer.topicId)?.name ?? 'current'
      const next = topics.find((t) => t.id === topicId)?.name ?? 'this topic'
      const ok = await confirm({
        title: `Switch to ${next}?`,
        body: `The ${running} timer stops and its time so far is saved.`,
        confirmLabel: 'Switch',
      })
      if (!ok) return
    }
    const mode = opts.mode ?? settings.defaultTimerMode
    await startTimer({ topicId, mode, targetMinutes: mode === 'countdown' ? (opts.minutes ?? defaultCountdown(opts.leftMinutes)) : undefined })
    if (opts.mode && opts.mode !== settings.defaultTimerMode) await updateSettings({ defaultTimerMode: opts.mode })
    if (!opts.stay) navigate('/timer')
  }
}
