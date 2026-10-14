import { db, getActiveTimer, getSettings, KV_KEYS, newId, type LernzeitDB } from '@/db/db'
import type { ActiveTimer, Session, TimerMode } from '@/db/types'
import { splitAtMidnight } from '@/lib/sessions'
import { isPhaseComplete, pause, phaseEndAt, resume, studiedMinutes } from '@/lib/timer'

/** Runs shorter than this are not worth a history entry. */
export const MIN_SESSION_MINUTES = 0.5

export interface PendingNote {
  sessionIds: string[]
  topicId: string
  minutes: number
  note: string
  savedAt: number
}

export interface SavedRun {
  topicId: string
  minutes: number
  sessionIds: string[]
}

function timerTables(database: LernzeitDB) {
  return [database.kv, database.sessions]
}

async function writeTimer(database: LernzeitDB, timer: ActiveTimer | undefined) {
  if (timer) await database.kv.put({ key: KV_KEYS.activeTimer, value: timer })
  else await database.kv.delete(KV_KEYS.activeTimer)
}

/**
 * Saves the current focus phase as session(s), split at midnight. Ids are
 * derived from the run so a second tab finishing the same phase is harmless.
 */
async function saveFocus(database: LernzeitDB, timer: ActiveTimer, endAt: number, minutes: number): Promise<SavedRun | null> {
  if (minutes < MIN_SESSION_MINUTES) return null
  const parts = splitAtMidnight(timer.startedAt, endAt, minutes)
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
  await database.sessions.bulkPut(sessions)
  const saved = { topicId: timer.topicId, minutes, sessionIds: sessions.map((s) => s.id) }
  const pending: PendingNote = { ...saved, note: timer.note.trim(), savedAt: Date.now() }
  await database.kv.put({ key: KV_KEYS.pendingNote, value: pending })
  return saved
}

export async function startTimer(
  opts: { topicId: string; mode: TimerMode; targetMinutes?: number },
  database: LernzeitDB = db,
): Promise<void> {
  const settings = await getSettings(database)
  await database.transaction('rw', timerTables(database), async () => {
    const existing = await getActiveTimer(database)
    if (existing) await finishRun(database, existing, Date.now())
    const now = Date.now()
    const timer: ActiveTimer = {
      runId: newId(),
      topicId: opts.topicId,
      mode: opts.mode,
      startedAt: now,
      pausedTotalMs: 0,
      targetMinutes: opts.mode === 'pomodoro' ? settings.pomodoroFocus : opts.targetMinutes,
      breakMinutes: opts.mode === 'pomodoro' ? settings.pomodoroBreak : undefined,
      phase: 'focus',
      cycle: 1,
      firstStartedAt: now,
      note: '',
    }
    await writeTimer(database, timer)
  })
}

async function finishRun(database: LernzeitDB, timer: ActiveTimer, now: number): Promise<SavedRun | null> {
  await writeTimer(database, undefined)
  if (timer.mode === 'pomodoro' && timer.phase === 'break') return null
  const minutes = studiedMinutes(timer, now)
  const complete = isPhaseComplete(timer, now)
  const endAt = complete ? phaseEndAt(timer)! : (timer.pausedAt ?? now)
  return saveFocus(database, timer, endAt, minutes)
}

/** Stop and save. Returns what was saved, or null when the run was too short. */
export async function stopTimer(database: LernzeitDB = db): Promise<SavedRun | null> {
  return database.transaction('rw', timerTables(database), async () => {
    const timer = await getActiveTimer(database)
    if (!timer) return null
    return finishRun(database, timer, Date.now())
  })
}

export async function discardTimer(database: LernzeitDB = db) {
  await writeTimer(database, undefined)
}

export async function pauseTimer(database: LernzeitDB = db) {
  await database.transaction('rw', database.kv, async () => {
    const timer = await getActiveTimer(database)
    if (timer) await writeTimer(database, pause(timer, Date.now()))
  })
}

export async function resumeTimer(database: LernzeitDB = db) {
  await database.transaction('rw', database.kv, async () => {
    const timer = await getActiveTimer(database)
    if (timer) await writeTimer(database, resume(timer, Date.now()))
  })
}

/** Change topic, length or the draft note of a running timer. */
export async function patchTimer(
  patch: Partial<Pick<ActiveTimer, 'topicId' | 'targetMinutes' | 'breakMinutes' | 'note' | 'mode'>>,
  database: LernzeitDB = db,
) {
  await database.transaction('rw', database.kv, async () => {
    const timer = await getActiveTimer(database)
    if (!timer) return
    const next = { ...timer, ...patch }
    if (patch.mode && patch.mode !== timer.mode) {
      const settings = await getSettings(database)
      next.phase = 'focus'
      if (patch.mode === 'pomodoro') {
        next.targetMinutes = patch.targetMinutes ?? settings.pomodoroFocus
        next.breakMinutes = settings.pomodoroBreak
      }
      if (patch.mode === 'free') next.targetMinutes = undefined
    }
    await writeTimer(database, next)
  })
}

export type PhaseOutcome =
  | { kind: 'countdown-done'; saved: SavedRun | null }
  | { kind: 'focus-done'; saved: SavedRun | null }
  | { kind: 'break-done' }

/**
 * Called by the timer engine when the current phase has run out. Safe to call
 * repeatedly or from several tabs: it re-checks the stored timer first.
 */
export async function completePhase(expect: { runId: string; cycle: number; phase: ActiveTimer['phase'] }, database: LernzeitDB = db): Promise<PhaseOutcome | null> {
  return database.transaction('rw', timerTables(database), async () => {
    const timer = await getActiveTimer(database)
    if (!timer || timer.runId !== expect.runId || timer.cycle !== expect.cycle || timer.phase !== expect.phase) return null
    const now = Date.now()
    if (!isPhaseComplete(timer, now)) return null
    const endAt = phaseEndAt(timer)!

    if (timer.mode === 'countdown') {
      await writeTimer(database, undefined)
      const saved = await saveFocus(database, timer, endAt, studiedMinutes(timer, now))
      return { kind: 'countdown-done', saved }
    }

    if (timer.phase === 'focus') {
      const saved = await saveFocus(database, timer, endAt, studiedMinutes(timer, now))
      await writeTimer(database, { ...timer, phase: 'break', startedAt: endAt, pausedAt: undefined, pausedTotalMs: 0, note: '' })
      return { kind: 'focus-done', saved }
    }

    // Break over: wait, paused at zero, for the next focus round.
    const breakEnd = endAt
    await writeTimer(database, {
      ...timer,
      phase: 'focus',
      cycle: timer.cycle + 1,
      startedAt: breakEnd,
      pausedAt: breakEnd,
      pausedTotalMs: 0,
    })
    return { kind: 'break-done' }
  })
}

/** Skip the rest of a pomodoro break and start focusing now. */
export async function skipBreak(database: LernzeitDB = db) {
  await database.transaction('rw', database.kv, async () => {
    const timer = await getActiveTimer(database)
    if (!timer || timer.mode !== 'pomodoro' || timer.phase !== 'break') return
    const now = Date.now()
    await writeTimer(database, { ...timer, phase: 'focus', cycle: timer.cycle + 1, startedAt: now, pausedAt: undefined, pausedTotalMs: 0 })
  })
}

export async function getPendingNote(database: LernzeitDB = db): Promise<PendingNote | undefined> {
  return (await database.kv.get(KV_KEYS.pendingNote))?.value as PendingNote | undefined
}

export async function resolvePendingNote(note: string | null, database: LernzeitDB = db) {
  await database.transaction('rw', timerTables(database), async () => {
    const pending = await getPendingNote(database)
    if (!pending) return
    if (note !== null) {
      const text = note.trim() || undefined
      await database.sessions.where('id').anyOf(pending.sessionIds).modify({ note: text })
    }
    await database.kv.delete(KV_KEYS.pendingNote)
  })
}

/** Review time saved as a "flashcards" session; repeated calls update the same rows. */
export async function recordReviewTime(
  opts: { runId: string; topicId: string; start: number; end: number; minutes: number },
  database: LernzeitDB = db,
) {
  const parts = splitAtMidnight(opts.start, opts.end, opts.minutes)
  await database.transaction('rw', database.sessions, async () => {
    await database.sessions.where('runId').equals(opts.runId).delete()
    await database.sessions.bulkPut(
      parts.map((p, i) => ({
        id: `${opts.runId}:${i}`,
        topicId: opts.topicId,
        start: p.start,
        end: p.end,
        minutes: p.minutes,
        date: p.date,
        note: 'Flashcard review',
        source: 'flashcards' as const,
        runId: opts.runId,
      })),
    )
  })
}

export async function deleteSession(id: string, database: LernzeitDB = db) {
  await database.sessions.delete(id)
}

