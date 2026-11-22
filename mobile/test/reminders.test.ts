import { createLocalLibrary } from '../src/store/library'
import { readSettings, saveSettings } from '../src/data/settings'
import { isTime, normalTime, planReminders } from '../src/timer/reminders'
import { nodeSqliteAdapter } from './store/nodeSqlite'

const NOON = new Date(2026, 10, 19, 12, 0).getTime()

describe('reminders', () => {
  it('skips the rest of today once the goals are met, but keeps the coming days', () => {
    const plan = planReminders({ times: ['10:00', '18:00'], now: NOON, open: [], days: 2 })
    expect(plan.map((p) => new Date(p.at).getDate())).toEqual([20, 20])
  })

  it('says what is left today while a goal is open', () => {
    const plan = planReminders({ times: ['10:00', '18:00'], now: NOON, open: [{ name: 'German', left: 90 }], days: 1 })
    expect(plan).toHaveLength(1)
    expect(plan[0].body).toContain('German')
    expect(new Date(plan[0].at).getHours()).toBe(18)
  })

  it('checks times', () => {
    expect(isTime('7:05')).toBe(true)
    expect(isTime('25:00')).toBe(false)
    expect(normalTime('7:05')).toBe('07:05')
  })
})

describe('settings', () => {
  it('keeps device settings out of the synced record', () => {
    const library = createLocalLibrary(nodeSqliteAdapter())
    saveSettings(library, { pomodoroFocus: 40, theme: 'dark', hiddenFeatures: ['docs'] })
    expect(library.get<{ value: object }>('kv', 'settings')?.value).toEqual({ pomodoroFocus: 40, hiddenFeatures: ['docs'] })
    expect(library.get<{ value: object }>('kv', 'deviceSettings')?.value).toEqual({ theme: 'dark' })
    expect(readSettings(library)).toMatchObject({ pomodoroFocus: 40, theme: 'dark', pomodoroBreak: 5 })
    expect(library.outbox().map((o) => o.id)).toEqual(['settings'])
  })
})
