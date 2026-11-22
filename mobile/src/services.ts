/*
 * What the app opens once per process, when it starts: the local library on its SQLite file, the
 * image files, the cloud client (token from secure storage, address from the app config), the
 * account service and the one sync engine. The root layout calls createServices and starts the
 * sync triggers; tests replace it with in-memory ones.
 */
import Constants from 'expo-constants'
import { createAccountService, type AccountService } from './account'
import { createApi, type Api } from './api'
import type { LocalLibrary } from './store/library'
import { openLocalLibrary } from './store/open'
import { createSyncEngine, type SyncEngine } from './sync/engine'
import { expoImageFiles } from './sync/expoFiles'
import { deleteImageFiles } from './sync/imageFiles'
import { secureTokenStore } from './token'

export interface Services {
  library: LocalLibrary
  account: AccountService
  api?: Api
  /** Absent in tests that need no cloud: the app then starts no sync triggers. */
  engine?: SyncEngine
}

let opened: Services | undefined

/** The app's services, opened on the first call and the same ever after: one database, one engine. */
export function createServices(): Services {
  if (opened) return opened
  const files = expoImageFiles
  // Deleted image records take their files along once the delete commits (see store/library.ts).
  const library = openLocalLibrary({ onImageFilesRemoved: (removed) => void deleteImageFiles(files, removed) })
  const baseUrl = String(Constants.expoConfig?.extra?.apiUrl ?? '')
  // A 401 on any call signs this phone out of the account, keeping its data (see account.tsx).
  const api = createApi({ baseUrl, getToken: secureTokenStore.get, onSignedOut: (sent) => account.signedOut(sent).catch((error) => console.warn('Could not clear the account after a 401', error)) })
  const account = createAccountService({ library, api, tokens: secureTokenStore, deleteImageFiles: (removed) => deleteImageFiles(files, removed) })
  opened = { library, account, api, engine: createSyncEngine({ library, api, files }) }
  return opened
}
