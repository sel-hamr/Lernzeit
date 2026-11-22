import { splitSettings } from './sync'
import type { Settings } from './types'

export const DEFAULT_SETTINGS: Settings = {
  defaultTimerMode: 'countdown',
  pomodoroFocus: 25,
  pomodoroBreak: 5,
  endSound: 'bell',
  voiceEngine: 'browser',
  speechRate: 0.95,
  autoPlayAudio: true,
  countReviewTime: true,
  countReadingTime: true,
  countQuestionTime: true,
  countGrammarTime: true,
  typingMode: false,
  listeningMode: false,
  theme: 'light',
  remindersEnabled: false,
  reminderTimes: ['18:00'],
  levels: [],
  hiddenFeatures: [],
}

/** Defaults, then the shared settings, then this device's own. Old installs kept everything in `settings`, so it still answers for device keys not yet in `deviceSettings`. */
export function mergeSettings(shared: unknown, device: unknown): Settings {
  const s = (shared as Partial<Settings> | undefined) ?? {}
  const d = (device as Partial<Settings> | undefined) ?? {}
  const legacy = splitSettings(s).device
  return { ...DEFAULT_SETTINGS, ...s, ...legacy, ...d }
}

