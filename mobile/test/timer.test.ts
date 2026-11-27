import type { Session } from '@lernzeit/core/types'
import { createLocalLibrary } from '../src/store/library'
import { completePhase, getPendingNote, getTimer, patchTimer, pauseTimer, resolvePendingNote, resumeTimer, startTimer, stopTimer } from '../src/timer/timerStore'
import { nodeSqliteAdapter } from './store/nodeSqlite'

const MIN = 60_000
// 23:50 in Berlin on 19 November 2026.
const LATE = Date.UTC(2026, 10, 19, 22, 50)

function setup() {
  const library = createLocalLibrary(nodeSqliteAdapter())
  library.put('kv', { key: 'timeZone', value: 'Europe/Berlin' })
  return library
}
const sessions = (library: ReturnType<typeof setup>) => library.list<Session>('sessions').sort((a, b) => a.start - b.start)

describe('timer store', () => {
  it('saves a run that crosses local midnight as one session per day, with run ids', () => {
    const library = setup()
    startTimer(library, { topicId: 't1', mode: 'free' }, LATE)
    const saved = stopTimer(library, LATE + 20 * MIN)
    expect(saved?.minutes).toBeCloseTo(20)
    const rows = sessions(library)
    expect(rows.map((s) => s.date)).toEqual(['2026-11-19', '2026-11-20'])
    expect(rows[0].minutes).toBeCloseTo(10)
    expect(rows[0].id).toMatch(/:1:0$/)
    expect(rows[1].id).toMatch(/:1:1$/)
    expect(getTimer(library)).toBeUndefined()
  })

  it('does not count paused time and drops runs under half a minute', () => {
    const library = setup()
    startTimer(library, { topicId: 't1', mode: 'free' }, LATE)
    pauseTimer(library, LATE + 10 * MIN)
    resumeTimer(library, LATE + 30 * MIN)
    expect(stopTimer(library, LATE + 40 * MIN)?.minutes).toBeCloseTo(20)
    startTimer(library, { topicId: 't1', mode: 'free' }, LATE)
    expect(stopTimer(library, LATE + 10_000)).toBeNull()
  })

  it('runs a pomodoro through focus and break, saving the focus and noting it', () => {
    const library = setup()
    library.put('kv', { key: 'settings', value: { pomodoroFocus: 25, pomodoroBreak: 5 } })
    startTimer(library, { topicId: 't1', mode: 'pomodoro' }, LATE)
    const timer = getTimer(library)!
    patchTimer(library, { note: 'Verbs' })
    const outcome = completePhase(library, { runId: timer.runId, cycle: 1, phase: 'focus' }, LATE + 26 * MIN)
    expect(outcome?.kind).toBe('focus-done')
    expect(getTimer(library)?.phase).toBe('break')
    expect(sessions(library)[0].note).toBe('Verbs')
    expect(completePhase(library, { runId: timer.runId, cycle: 1, phase: 'focus' }, LATE + 27 * MIN)).toBeNull()
    expect(completePhase(library, { runId: timer.runId, cycle: 1, phase: 'break' }, LATE + 31 * MIN)?.kind).toBe('break-done')
    expect(getTimer(library)?.cycle).toBe(2)
  })

  it('saves the note asked for after the session', () => {
    const library = setup()
    startTimer(library, { topicId: 't1', mode: 'free' }, LATE)
    stopTimer(library, LATE + 5 * MIN)
    expect(getPendingNote(library)?.note).toBe('')
    resolvePendingNote(library, '  Dative case ')
    expect(sessions(library)[0].note).toBe('Dative case')
    expect(getPendingNote(library)).toBeUndefined()
  })
})
