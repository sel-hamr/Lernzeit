import { describe, expect, it } from 'vitest'
import { dateKeyIn, nextMidnightIn } from './time'

describe('time zones', () => {
  it('dates an instant in the given zone', () => {
    const at = Date.UTC(2026, 10, 21, 23, 30)
    expect(dateKeyIn(at, 'Europe/Berlin')).toBe('2026-11-22')
    expect(dateKeyIn(at, 'America/New_York')).toBe('2026-11-21')
    expect(dateKeyIn(at, 'UTC')).toBe('2026-11-21')
  })

  it('finds the next local midnight', () => {
    // 2026-11-21 23:30 UTC is 00:30 on the 22nd in Berlin (UTC+1); next midnight is 23:00 UTC on the 22nd.
    expect(nextMidnightIn(Date.UTC(2026, 10, 21, 23, 30), 'Europe/Berlin')).toBe(Date.UTC(2026, 10, 22, 23, 0))
    expect(nextMidnightIn(Date.UTC(2026, 10, 21, 12, 0), 'UTC')).toBe(Date.UTC(2026, 10, 22, 0, 0))
  })

  it('is right across the Berlin spring change (a 23 hour day)', () => {
    // 2026-03-29: CET -> CEST at 02:00. Midnight on the 29th is 23:00 UTC on the 28th; on the 30th it is 22:00 UTC on the 29th.
    expect(nextMidnightIn(Date.UTC(2026, 2, 28, 12, 0), 'Europe/Berlin')).toBe(Date.UTC(2026, 2, 28, 23, 0))
    expect(nextMidnightIn(Date.UTC(2026, 2, 28, 23, 0), 'Europe/Berlin')).toBe(Date.UTC(2026, 2, 29, 22, 0))
  })

  it('is right across the Berlin autumn change (a 25 hour day)', () => {
    // 2026-10-25: CEST -> CET at 03:00. Midnight on the 25th is 22:00 UTC on the 24th; on the 26th it is 23:00 UTC on the 25th.
    expect(nextMidnightIn(Date.UTC(2026, 9, 24, 12, 0), 'Europe/Berlin')).toBe(Date.UTC(2026, 9, 24, 22, 0))
    expect(nextMidnightIn(Date.UTC(2026, 9, 24, 22, 0), 'Europe/Berlin')).toBe(Date.UTC(2026, 9, 25, 23, 0))
  })
})
