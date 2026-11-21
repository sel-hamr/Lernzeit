import clsx from 'clsx'
import { useTodayProgress } from '@/data/progress'
import { formatTimer } from '@lernzeit/core/time'
import { isPaused, remainingMs, elapsedMs } from '@lernzeit/core/timer'

/** The running timer, at the end of the Focus timer link in the sidebar. */
export function TimerBadge() {
  const { timer, now } = useTodayProgress()
  if (!timer) return null
  const left = remainingMs(timer, now)
  const shown = left ?? elapsedMs(timer, now)
  return (
    <span className={clsx('flex items-center gap-1.5 text-chip font-medium tabular-nums', isPaused(timer) ? 'text-muted' : 'text-sage-ink')}>
      <span className={clsx('size-1.5 rounded-full', isPaused(timer) ? 'bg-muted' : 'bg-sage-dot animate-pulse')} />
      {formatTimer(shown)}
    </span>
  )
}
