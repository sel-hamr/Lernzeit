import { describe, expect, it } from 'vitest'
import { DEVICE_SETTING_KEYS, SYNC_TABLES, SYNCED_KV_KEYS, imageMeta, isSynced, recordId, splitSettings, wins } from './sync'

describe('what syncs', () => {
  it('lists the synced tables with kv last', () => {
    expect(SYNC_TABLES).toHaveLength(18)
    expect(SYNC_TABLES[SYNC_TABLES.length - 1]).toBe('kv')
    expect(SYNCED_KV_KEYS).toHaveLength(6)
    expect(DEVICE_SETTING_KEYS).toHaveLength(6)
  })

  it('syncs whole tables, and kv only for its synced keys', () => {
    expect(isSynced('kv', 'tour')).toBe(false)
    expect(isSynced('kv', 'settings')).toBe(true)
    expect(isSynced('cards', 'x')).toBe(true)
    expect(isSynced('clips', 'x')).toBe(false)
    expect(isSynced('outbox', 'x')).toBe(false)
  })

  it('takes the key of a kv row as its id', () => {
    expect(recordId('kv', { key: 'settings', value: {} })).toBe('settings')
    expect(recordId('cards', { id: 'c1', german: 'Hund' })).toBe('c1')
  })
})

describe('wins', () => {
  it('lets the newer change win, and the later arrival a tie', () => {
    expect(wins({ updatedAt: 5 }, { updatedAt: 5 })).toBe(true)
    expect(wins({ updatedAt: 4 }, { updatedAt: 5 })).toBe(false)
    expect(wins({ updatedAt: 6 }, { updatedAt: 5 })).toBe(true)
    expect(wins({ updatedAt: 1 })).toBe(true)
  })
})

describe('splitSettings', () => {
  it('keeps voice, theme and reminders on the device', () => {
    expect(splitSettings({ theme: 'dark', pomodoroFocus: 30 })).toEqual({ shared: { pomodoroFocus: 30 }, device: { theme: 'dark' } })
    expect(splitSettings({ voiceEngine: 'thorsten', speechRate: 0.9, reminderTimes: ['09:00'], typingMode: true })).toEqual({
      shared: { typingMode: true },
      device: { voiceEngine: 'thorsten', speechRate: 0.9, reminderTimes: ['09:00'] },
    })
  })
})

describe('imageMeta', () => {
  it('keeps the size, fit and type, not the bytes', () => {
    const blob = new Blob(['x'], { type: 'image/webp' })
    expect(imageMeta({ id: 'i1', blob, width: 40, height: 30, fit: 'cover' })).toEqual({ id: 'i1', width: 40, height: 30, fit: 'cover', type: 'image/webp' })
  })
})
