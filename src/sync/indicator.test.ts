import { describe, expect, it } from 'vitest'
import { syncIndicator, timeAgo } from './indicator'

const base = { state: 'idle' as const, pending: 0, stuck: [] }

describe('syncIndicator', () => {
  it('says the sync state in plain words', () => {
    expect(syncIndicator(base)).toEqual({ label: 'Synced', level: 'ok' })
    expect(syncIndicator({ ...base, state: 'syncing', pending: 2 })).toMatchObject({ label: 'Syncing…', level: 'waiting' })
    expect(syncIndicator({ ...base, state: 'offline', pending: 3 })).toMatchObject({ label: 'Offline · 3 changes waiting', level: 'waiting' })
    expect(syncIndicator({ ...base, state: 'offline', pending: 1 })).toMatchObject({ label: 'Offline · 1 change waiting' })
    expect(syncIndicator({ ...base, state: 'offline' })).toMatchObject({ label: 'Offline' })
    expect(syncIndicator({ ...base, state: 'signedOut' })).toMatchObject({ label: 'Signed out', level: 'error' })
    expect(syncIndicator({ ...base, state: 'error', error: 'D1 is down' })).toEqual({ label: 'Sync failed', level: 'error', hint: 'D1 is down' })
    expect(syncIndicator({ ...base, pending: 2 })).toMatchObject({ label: '2 changes waiting', level: 'waiting', passing: true })
    expect(syncIndicator({ ...base, state: 'syncing' }).passing).toBe(true)
    expect(syncIndicator({ ...base, state: 'offline' }).passing).toBeUndefined()
  })

  it('names changes the cloud cannot take, with the reasons as the hint', () => {
    const stuck = [{ tbl: 'docs', id: 'd1', reason: 'This is too large to sync: 1.2 MB, and the most is 1.0 MB.' }]
    expect(syncIndicator({ ...base, pending: 1, stuck })).toEqual({ label: '1 change can’t be uploaded', level: 'error', hint: stuck[0].reason })
    const two = [...stuck, { tbl: 'images', id: 'i1', reason: 'This file is not an image.' }]
    expect(syncIndicator({ ...base, pending: 3, stuck: two })).toMatchObject({ label: '2 changes can’t be uploaded', hint: `${two[0].reason}\n${two[1].reason}` })
  })
})

describe('timeAgo', () => {
  const now = new Date(2026, 10, 21, 12).getTime()
  it('says how long ago, in rough steps', () => {
    expect(timeAgo(now - 20_000, now)).toBe('just now')
    expect(timeAgo(now - 5 * 60_000, now)).toBe('5 min ago')
    expect(timeAgo(now - 3 * 3_600_000, now)).toBe('3 h ago')
    expect(timeAgo(now - 30 * 3_600_000, now)).toBe('Yesterday')
  })
})
