import type { ActiveTimer } from '@/db/types'
import { MINUTE } from './time'

/** Active (unpaused) time in the current phase. */
export function elapsedMs(timer: ActiveTimer, now: number): number {
  const until = timer.pausedAt ?? now
  return Math.max(0, until - timer.startedAt - timer.pausedTotalMs)
}

/** Length of the current phase, or undefined for free mode (counts up). */
export function phaseLengthMs(timer: ActiveTimer): number | undefined {
  if (timer.mode === 'free') return undefined
  if (timer.mode === 'pomodoro' && timer.phase === 'break') return (timer.breakMinutes ?? 5) * MINUTE
  return (timer.targetMinutes ?? 25) * MINUTE
}

export function remainingMs(timer: ActiveTimer, now: number): number | undefined {
  const length = phaseLengthMs(timer)
  return length === undefined ? undefined : Math.max(0, length - elapsedMs(timer, now))
}

export function isPhaseComplete(timer: ActiveTimer, now: number): boolean {
  const length = phaseLengthMs(timer)
  return length !== undefined && !timer.pausedAt && elapsedMs(timer, now) >= length
}

/** The wall-clock moment the current phase ended (or will end). */
export function phaseEndAt(timer: ActiveTimer): number | undefined {
  const length = phaseLengthMs(timer)
  return length === undefined ? undefined : timer.startedAt + timer.pausedTotalMs + length
}

export function isPaused(timer: ActiveTimer): boolean {
  return timer.pausedAt !== undefined
}

/** A pomodoro waiting for the next focus round after its break ended. */
export function isAwaitingFocus(timer: ActiveTimer): boolean {
  return timer.mode === 'pomodoro' && timer.phase === 'focus' && timer.pausedAt !== undefined && elapsedMs(timer, timer.pausedAt) === 0
}

export function pause(timer: ActiveTimer, now: number): ActiveTimer {
  return timer.pausedAt ? timer : { ...timer, pausedAt: now }
}

export function resume(timer: ActiveTimer, now: number): ActiveTimer {
  if (!timer.pausedAt) return timer
  return { ...timer, pausedTotalMs: timer.pausedTotalMs + (now - timer.pausedAt), pausedAt: undefined }
}

/** Minutes of study in the current phase. Breaks never count. */
export function studiedMinutes(timer: ActiveTimer, now: number): number {
  if (timer.mode === 'pomodoro' && timer.phase === 'break') return 0
  const length = phaseLengthMs(timer)
  const elapsed = elapsedMs(timer, now)
  return (length === undefined ? elapsed : Math.min(elapsed, length)) / MINUTE
}
