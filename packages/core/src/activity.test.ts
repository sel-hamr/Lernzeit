import { describe, expect, it } from 'vitest'
import { hideActivity, noteInput, showActivity, startActivity, tickActivity } from './activity'

const SECOND = 1000

describe('activity', () => {
  it('counts time while there was input in the last two minutes', () => {
    let a = startActivity(0)
    a = tickActivity(a, 60 * SECOND)
    expect(a.activeMs).toBe(60 * SECOND)
    // Nothing touched for a while: only the first two minutes count.
    a = tickActivity(a, 200 * SECOND)
    expect(a.activeMs).toBe(120 * SECOND)
    a = noteInput(a, 300 * SECOND)
    expect(a.activeMs).toBe(120 * SECOND)
    a = tickActivity(a, 330 * SECOND)
    expect(a.activeMs).toBe(150 * SECOND)
  })

  it('stops counting while the page is hidden', () => {
    let a = hideActivity(startActivity(0), 10 * SECOND)
    a = tickActivity(a, 500 * SECOND)
    expect(a.activeMs).toBe(10 * SECOND)
    a = tickActivity(showActivity(a, 1000 * SECOND), 1030 * SECOND)
    expect(a.activeMs).toBe(40 * SECOND)
  })
})
