/*
 * Settings as the web keeps them: shared ones in kv/settings (syncs), this device's own (voice, theme,
 * reminders) in kv/deviceSettings (stays here). Reads merge defaults, shared, then device.
 */
import { DEFAULT_SETTINGS, mergeSettings } from '@lernzeit/core/settings'
import { splitSettings } from '@lernzeit/core/sync'
import type { Settings } from '@lernzeit/core/types'
import { useMemo } from 'react'
import type { LocalLibrary } from '../store/library'
import { useLiveQuery, useLocalLibrary } from '../store/live'

const kvValue = (library: LocalLibrary, key: string) => library.get<{ value?: unknown }>('kv', key)?.value

export function readSettings(library: LocalLibrary): Settings {
  return mergeSettings(kvValue(library, 'settings'), kvValue(library, 'deviceSettings'))
}

export function saveSettings(library: LocalLibrary, patch: Partial<Settings>): void {
  const { shared, device } = splitSettings(patch)
  library.write(() => {
    if (Object.keys(shared).length) library.put('kv', { key: 'settings', value: { ...(kvValue(library, 'settings') as object | undefined), ...shared } })
    if (Object.keys(device).length) library.put('kv', { key: 'deviceSettings', value: { ...(kvValue(library, 'deviceSettings') as object | undefined), ...device } })
  })
}

export function useSettings(): Settings {
  const shared = useLiveQuery(['kv'], (l) => kvValue(l, 'settings'), [])
  const device = useLiveQuery(['kv'], (l) => kvValue(l, 'deviceSettings'), [])
  return useMemo(() => mergeSettings(shared, device), [shared, device])
}

/** A function that patches the settings of this library. */
export function useSaveSettings(): (patch: Partial<Settings>) => void {
  const library = useLocalLibrary()
  return useMemo(() => (patch) => saveSettings(library, patch), [library])
}

export { DEFAULT_SETTINGS }
