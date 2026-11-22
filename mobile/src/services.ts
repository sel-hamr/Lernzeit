/*
 * What the app opens once, when it starts: the local library on its SQLite file, the cloud client
 * (token from secure storage, address from the app config) and the account service. The root layout
 * calls createServices; tests replace it with in-memory ones.
 */
import Constants from 'expo-constants'
import { createAccountService, type AccountService } from './account'
import { createApi, type Api } from './api'
import type { LocalLibrary } from './store/library'
import { openLocalLibrary } from './store/open'
import { secureTokenStore } from './token'

export interface Services {
  library: LocalLibrary
  account: AccountService
  /** For the sync engine (Task 5); the screens go through `account` and the library. */
  api?: Api
}

export function createServices(): Services {
  const library = openLocalLibrary()
  const baseUrl = String(Constants.expoConfig?.extra?.apiUrl ?? '')
  // A 401 on any call signs this phone out of the account, keeping its data (see account.tsx).
  const api = createApi({ baseUrl, getToken: secureTokenStore.get, onSignedOut: () => void account.signedOut() })
  const account = createAccountService({ library, api, tokens: secureTokenStore })
  return { library, account, api }
}
