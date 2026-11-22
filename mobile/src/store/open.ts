/*
 * Opens the phone's library on its SQLite file (expo-sqlite's default folder, kept until the app is
 * uninstalled). Separate from adapter.ts so tests of the store never load the native module.
 */
import { openDatabaseSync } from 'expo-sqlite'
import { expoAdapter } from './adapter'
import { createLocalLibrary, type LocalLibrary, type LocalLibraryOptions } from './library'

export const DATABASE_NAME = 'lernzeit.db'

/** Open it once, when the app starts, and share it (LocalLibraryProvider in live.ts). */
export function openLocalLibrary(options?: LocalLibraryOptions): LocalLibrary {
  return createLocalLibrary(expoAdapter(openDatabaseSync(DATABASE_NAME)), options)
}
