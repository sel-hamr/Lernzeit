/*
 * The focus timer over the local library, as the web does it (src/data/timer.ts): the running timer is
 * the synced record kv/activeTimer, only ever timestamps (elapsed time is worked out when shown), so it
 * survives the app being killed and shows on every device. Only the device that started it ends its
 * phases. Sessions are saved with ids `${runId}:${cycle}:${i}`, split at local midnight.
 */
import { splitAtMidnight } from '@lernzeit/core/sessions'
import { isPhaseComplete, pause, phaseEndAt, resume, studiedMinutes } from '@lernzeit/core/timer'
import type { ActiveTimer, Session, TimerMode } from '@lernzeit/core/types'
import { newId } from '../data/ids'
import { readSettings } from '../data/settings'
import type { LocalLibrary } from '../store/library'
import { DEVICE_ID_KEY } from '../store/library'
import { deviceTimeZone } from '../timeZone'

/** Runs shorter than this are not worth a history entry. */
export const MIN_SESSION_MINUTES = 0.5

export interface SavedRun {
  topicId: string
  minutes: number
  sessionIds: string[]
}

export interface PendingNote extends SavedRun {
  note: string
  savedAt: number
}

export type PhaseOutcome = { kind: 'countdown-done'; saved: SavedRun | null } | { kind: 'focus-done'; saved: SavedRun | null } | { kind: 'break-done' }

export function getDeviceId(library: LocalLibrary): string {
  const stored = library.getMeta<string>(DEVICE_ID_KEY)
  if (stored) return stored
  const id = newId()
  library.setMeta(DEVICE_ID_KEY, id)
  return id
}

export function zoneOf(library: LocalLibrary): string {
  const zone = library.get<{ value?: unknown }>('kv', 'timeZone')?.value
  return typeof zone === 'string' && zone ? zone : deviceTimeZone()
}

export function getTimer(library: LocalLibrary): ActiveTimer | undefined {
  return library.get<{ value?: ActiveTimer }>('kv', 'activeTimer')?.value ?? undefined
}

function writeTimer(library: LocalLibrary, timer: ActiveTimer | undefined) {
  if (timer) library.put('kv', { key: 'activeTimer', value: timer })
  else library.remove('kv', 'activeTimer')
}

function saveFocus(library: LocalLibrary, timer: ActiveTimer, endAt: number, minutes: number): SavedRun | null {
  if (minutes < MIN_SESSION_MINUTES) return null
  const parts = splitAtMidnight(timer.startedAt, endAt, minutes, zoneOf(library))
  const note = timer.note.trim() || undefined
  const sessions: Session[] = parts.map((p, i) => ({
    id: `${timer.runId}:${timer.cycle}:${i}`,
    topicId: timer.topicId,
    start: p.start,
    end: p.end,
    minutes: p.minutes,
    date: p.date,
    note,
    source: 'timer',
    runId: timer.runId,
  }))
  for (const s of sessions) library.put('sessions', s)
  const saved = { topicId: timer.topicId, minutes, sessionIds: sessions.map((s) => s.id) }
  const pending: PendingNote = { ...saved, note: timer.note.trim(), savedAt: Date.now() }
  library.put('kv', { key: 'pendingNote', value: pending })
  return saved
}

function finishRun(library: LocalLibrary, timer: ActiveTimer, now: number): SavedRun | null {
  writeTimer(library, undefined)
  if (timer.mode === 'pomodoro' && timer.phase === 'break') return null
  const minutes = studiedMinutes(timer, now)
  const endAt = isPhaseComplete(timer, now) ? phaseEndAt(timer)! : (timer.pausedAt ?? now)
  return saveFocus(library, timer, endAt, minutes)
}

export function startTimer(library: LocalLibrary, opts: { topicId: string; mode: TimerMode; targetMinutes?: number }, now = Date.now()): void {
  const settings = readSettings(library)
  library.write(() => {
    const existing = getTimer(library)
    if (existing) finishRun(library, existing, now)
    writeTimer(library, {
      runId: newId(),
      topicId: opts.topicId,
      mode: opts.mode,
      startedAt: now,
      pausedTotalMs: 0,
      targetMinutes: opts.mode === 'pomodoro' ? settings.pomodoroFocus : opts.mode === 'free' ? undefined : (opts.targetMinutes ?? 25),
      breakMinutes: opts.mode === 'pomodoro' ? settings.pomodoroBreak : undefined,
      phase: 'focus',
      cycle: 1,
      firstStartedAt: now,
      note: '',
      deviceId: getDeviceId(library),
    })
  })
}

/** Stop and save. Returns what was saved, or null when the run was too short. */
export function stopTimer(library: LocalLibrary, now = Date.now()): SavedRun | null {
  return library.write(() => {
    const timer = getTimer(library)
    return timer ? finishRun(library, timer, now) : null
  })
}

export function discardTimer(library: LocalLibrary): void {
  writeTimer(library, undefined)
}

export function pauseTimer(library: LocalLibrary, now = Date.now()): void {
  const timer = getTimer(library)
  if (timer) writeTimer(library, pause(timer, now))
}

export function resumeTimer(library: LocalLibrary, now = Date.now()): void {
  const timer = getTimer(library)
  if (timer) writeTimer(library, resume(timer, now))
}

export function patchTimer(library: LocalLibrary, patch: Partial<Pick<ActiveTimer, 'topicId' | 'targetMinutes' | 'breakMinutes' | 'note' | 'mode'>>): void {
  library.write(() => {
    const timer = getTimer(library)
    if (!timer) return
    const next = { ...timer, ...patch }
    if (patch.mode && patch.mode !== timer.mode) {
      const settings = readSettings(library)
      next.phase = 'focus'
      if (patch.mode === 'pomodoro') {
        next.targetMinutes = patch.targetMinutes ?? settings.pomodoroFocus
        next.breakMinutes = settings.pomodoroBreak
      }
      if (patch.mode === 'free') next.targetMinutes = undefined
    }
    writeTimer(library, next)
  })
}

/** Called when the current phase has run out; safe to call again, it re-checks the stored timer. */
export function completePhase(library: LocalLibrary, expect: { runId: string; cycle: number; phase: ActiveTimer['phase'] }, now = Date.now()): PhaseOutcome | null {
  return library.write(() => {
    const timer = getTimer(library)
    if (!timer || timer.runId !== expect.runId || timer.cycle !== expect.cycle || timer.phase !== expect.phase) return null
    if (!isPhaseComplete(timer, now)) return null
    const endAt = phaseEndAt(timer)!
    if (timer.mode === 'countdown') {
      writeTimer(library, undefined)
      return { kind: 'countdown-done' as const, saved: saveFocus(library, timer, endAt, studiedMinutes(timer, now)) }
    }
    if (timer.phase === 'focus') {
      const saved = saveFocus(library, timer, endAt, studiedMinutes(timer, now))
      writeTimer(library, { ...timer, phase: 'break', startedAt: endAt, pausedAt: undefined, pausedTotalMs: 0, note: '' })
      return { kind: 'focus-done' as const, saved }
    }
    // Break over: wait, paused at zero, for the next focus round.
    writeTimer(library, { ...timer, phase: 'focus', cycle: timer.cycle + 1, startedAt: endAt, pausedAt: endAt, pausedTotalMs: 0 })
    return { kind: 'break-done' as const }
  })
}

export function skipBreak(library: LocalLibrary, now = Date.now()): void {
  const timer = getTimer(library)
  if (!timer || timer.mode !== 'pomodoro' || timer.phase !== 'break') return
  writeTimer(library, { ...timer, phase: 'focus', cycle: timer.cycle + 1, startedAt: now, pausedAt: undefined, pausedTotalMs: 0 })
}

export function getPendingNote(library: LocalLibrary): PendingNote | undefined {
  return library.get<{ value?: PendingNote }>('kv', 'pendingNote')?.value
}

/** Saves the "What did you learn?" text on the run's sessions, or drops the prompt when `note` is null. */
export function resolvePendingNote(library: LocalLibrary, note: string | null): void {
  library.write(() => {
    const pending = getPendingNote(library)
    if (!pending) return
    if (note !== null) {
      const text = note.trim() || undefined
      for (const id of pending.sessionIds) {
        const session = library.get<Session>('sessions', id)
        if (session) library.put('sessions', { ...session, note: text })
      }
    }
    library.remove('kv', 'pendingNote')
  })
}
