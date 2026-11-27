/*
 * The device token, in the Android Keystore through expo-secure-store. It lives nowhere else: not in
 * the SQLite file, not in logs. The account's email is the local store's business (account.ts).
 */
import * as SecureStore from 'expo-secure-store'

const TOKEN_KEY = 'lernzeit.token'

export interface TokenStore {
  get(): Promise<string | null>
  set(token: string): Promise<void>
  clear(): Promise<void>
}

export const secureTokenStore: TokenStore = {
  get: () => SecureStore.getItemAsync(TOKEN_KEY),
  set: (token) => SecureStore.setItemAsync(TOKEN_KEY, token),
  clear: () => SecureStore.deleteItemAsync(TOKEN_KEY),
}
