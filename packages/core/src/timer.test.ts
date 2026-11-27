import { describe, expect, it } from 'vitest'
import { ownsTimer } from './timer'
import type { ActiveTimer } from './types'

const timer: ActiveTimer = {
  runId: 'r',
  topicId: 't',
  mode: 'free',
  startedAt: 0,
  pausedTotalMs: 0,
  phase: 'focus',
  cycle: 1,
  firstStartedAt: 0,
  note: '',
}

describe('ownsTimer', () => {
  it('is false on a device that did not start the timer', () => {
    expect(ownsTimer({ ...timer, deviceId: 'a' }, 'b')).toBe(false)
  })
  it('is true on the device that started it', () => {
    expect(ownsTimer({ ...timer, deviceId: 'a' }, 'a')).toBe(true)
  })
  it('is true everywhere for a timer from before devices were recorded', () => {
    expect(ownsTimer({ ...timer }, 'b')).toBe(true)
  })
})
