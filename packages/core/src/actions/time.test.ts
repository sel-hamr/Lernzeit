import { beforeEach, describe, expect, it } from 'vitest'
import type { Session } from '../types'
import { expectCode, makeStore } from './fixture.test-utils'
import { runAction } from './index'

let store: ReturnType<typeof makeStore>

beforeEach(() => {
  store = makeStore()
})

const sessions = async (s = store) => (await s.list<Session>('sessions')).sort((a, b) => a.start - b.start)

describe('log_study_time', () => {
  it('saves a session that ends now by default', async () => {
    const session = await runAction(store, 'log_study_time', { topic: 'German', minutes: 30, note: 'Past tense' })
    expect(session).toEqual({ topic: 'German', minutes: 30, start: '2026-10-15T09:30', end: '2026-10-15T10:00' })
    const saved = await sessions()
    expect(saved).toHaveLength(1)
    expect(saved[0]).toEqual({
      id: `${saved[0].runId}:0`,
      topicId: 'german',
      start: Date.parse('2026-10-15T09:30:00+02:00'),
      end: Date.parse('2026-10-15T10:00:00+02:00'),
      minutes: 30,
      date: '2026-10-15',
      note: 'Past tense',
      source: 'timer',
      runId: saved[0].runId,
    })
  })

  it('splits a session that crosses midnight', async () => {
    await runAction(store, 'log_study_time', { topic: 'AI', minutes: 60, start: '2026-10-14T23:30' })
    expect((await sessions()).map((s) => [s.date, s.minutes])).toEqual([
      ['2026-10-14', 30],
      ['2026-10-15', 30],
    ])
  })

  it('reads the start and splits at midnight in the owner’s time zone, not the machine’s', async () => {
    // 23:30 in Berlin is 21:30 UTC: a server in UTC would see one evening session.
    const result = await runAction(store, 'log_study_time', { topic: 'German', minutes: 60, start: '2026-10-14T23:30' })
    expect(result).toEqual({ topic: 'German', minutes: 60, start: '2026-10-14T23:30', end: '2026-10-15T00:30' })
    const [evening, night] = await sessions()
    const midnight = Date.parse('2026-10-15T00:00:00+02:00')
    expect(evening).toMatchObject({ date: '2026-10-14', minutes: 30, start: Date.parse('2026-10-14T23:30:00+02:00'), end: midnight })
    expect(night).toMatchObject({ date: '2026-10-15', minutes: 30, start: midnight, end: Date.parse('2026-10-15T00:30:00+02:00'), runId: evening.runId })
    expect([evening.id, night.id]).toEqual([`${evening.runId}:0`, `${evening.runId}:1`])

    const utc = makeStore(undefined, { timeZone: 'UTC' })
    await runAction(utc, 'log_study_time', { topic: 'German', minutes: 60, start: '2026-10-14T21:30' })
    expect((await sessions(utc)).map((s) => [s.date, s.minutes, s.start])).toEqual([['2026-10-14', 60, evening.start]])
  })

  it('splits a default start that began before the owner’s midnight', async () => {
    const now = Date.parse('2026-10-15T00:10:00+02:00')
    const late = makeStore(undefined, { now: () => now })
    expect(await runAction(late, 'log_study_time', { topic: 'German', minutes: 60 })).toEqual({ topic: 'German', minutes: 60, start: '2026-10-14T23:10', end: '2026-10-15T00:10' })
    expect((await sessions(late)).map((s) => [s.date, s.minutes])).toEqual([
      ['2026-10-14', 50],
      ['2026-10-15', 10],
    ])
  })

  it('takes a start with its own offset as that instant', async () => {
    await runAction(store, 'log_study_time', { topic: 'German', minutes: 30, start: '2026-10-15T06:00:00Z' })
    expect((await sessions())[0]).toMatchObject({ start: Date.parse('2026-10-15T06:00:00Z'), date: '2026-10-15' })
  })

  it('rejects time in the future and impossible lengths', async () => {
    await expectCode(runAction(store, 'log_study_time', { topic: 'German', minutes: 30, start: '2026-10-15T09:45' }), 'invalid_input')
    await expectCode(runAction(store, 'log_study_time', { topic: 'German', minutes: 0 }), 'invalid_input')
    await expectCode(runAction(store, 'log_study_time', { topic: 'German', minutes: 30, start: 'this morning' }), 'invalid_input')
    await expectCode(runAction(store, 'log_study_time', { topic: 'German', minutes: 30, start: '2026-10-15T25:00' }), 'invalid_input')
    expect(store.committed).toEqual([])
  })
})
