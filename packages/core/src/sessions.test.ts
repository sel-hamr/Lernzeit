import { describe, expect, it } from 'vitest'
import { manualSessions, splitAtMidnight } from './sessions'
import { MINUTE } from './time'

const berlin = (iso: string) => Date.parse(`${iso}+02:00`)

describe('splitAtMidnight in a time zone', () => {
  it('splits at the zone’s midnight and dates each part in the zone', () => {
    const parts = splitAtMidnight(berlin('2026-10-14T23:30:00'), berlin('2026-10-15T00:30:00'), undefined, 'Europe/Berlin')
    expect(parts).toEqual([
      { start: berlin('2026-10-14T23:30:00'), end: berlin('2026-10-15T00:00:00'), date: '2026-10-14', minutes: 30 },
      { start: berlin('2026-10-15T00:00:00'), end: berlin('2026-10-15T00:30:00'), date: '2026-10-15', minutes: 30 },
    ])
    // The same hour is one evening session in UTC.
    expect(splitAtMidnight(berlin('2026-10-14T23:30:00'), berlin('2026-10-15T00:30:00'), undefined, 'UTC')).toEqual([
      { start: berlin('2026-10-14T23:30:00'), end: berlin('2026-10-15T00:30:00'), date: '2026-10-14', minutes: 60 },
    ])
  })
})

describe('manualSessions', () => {
  it('makes one timer session per local day, sharing a run id', () => {
    const start = berlin('2026-10-14T23:30:00')
    expect(manualSessions({ topicId: 't', start, minutes: 60, note: '  Perfekt ' }, 'run', 'Europe/Berlin')).toEqual([
      { id: 'run:0', topicId: 't', start, end: start + 30 * MINUTE, minutes: 30, date: '2026-10-14', note: 'Perfekt', source: 'timer', runId: 'run' },
      { id: 'run:1', topicId: 't', start: start + 30 * MINUTE, end: start + 60 * MINUTE, minutes: 30, date: '2026-10-15', note: 'Perfekt', source: 'timer', runId: 'run' },
    ])
  })

  it('leaves a blank note out', () => {
    expect(manualSessions({ topicId: 't', start: 0, minutes: 5, note: ' ' }, 'run', 'UTC')[0].note).toBeUndefined()
  })
})
