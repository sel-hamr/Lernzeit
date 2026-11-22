/*
 * The cloud account on this phone. Like the web's `meta.account`, the store's meta says who signed
 * in here (`{ email }`), so a phone that signed in before opens on its own data offline too; the
 * app shows the sign-in screen only while it is missing. The token is only in secure storage.
 * Signing in never touches local data. A 401 (SignedOutError) deletes the account and the token but
 * keeps the library and its outbox, so signing in again picks up where the phone left off.
 */
import * as Device from 'expo-device'
import { createContext, createElement, useContext, type ReactNode } from 'react'
import { OfflineError, SignedOutError, type Api } from './api'
import type { ImageFile, LocalLibrary } from './store/library'
import { useLiveQuery } from './store/live'
import type { TokenStore } from './token'

export const ACCOUNT_KEY = 'account'

export interface Account {
  email: string
}

/** "Android · Pixel 8", or "Android phone" when the model is unknown. The cloud lists devices by it. */
export function deviceName(): string {
  const model = Device.modelName?.trim()
  return model ? `Android · ${model}` : 'Android phone'
}

/** Words for a sign-in failure: the server's own message, or that the cloud cannot be reached. */
export function failureMessage(error: unknown): string {
  if (error instanceof OfflineError) return 'Can’t reach your Lernzeit cloud. Check the connection and try again.'
  if (error instanceof SignedOutError) return 'You were signed out. Sign in again.'
  return error instanceof Error ? error.message : 'Something went wrong. Try again.'
}

export interface AccountService {
  /** Signs in and keeps the token in secure storage and the email in the store. Throws the API's errors; the password goes nowhere else. */
  signIn(email: string, password: string): Promise<void>
  /**
   * Signs out of this phone. Without `force`, answers 'unsynced' and does nothing while changes wait
   * in the outbox. Forced (or with an empty outbox) it asks the cloud to end the session (best effort),
   * deletes the token, and clears the synced data, outbox, image files and meta except the device id.
   */
  signOut(options?: { force?: boolean }): Promise<'done' | 'unsynced'>
  /**
   * The 401 rule: the account and token go, the data and outbox stay. With `sentToken` (the token the
   * refused call carried), a stale 401 is ignored: when the current token differs, a newer sign-in is intact.
   */
  signedOut(sentToken?: string | null): Promise<void>
}

export interface AccountServiceOptions {
  library: LocalLibrary
  api: Pick<Api, 'login' | 'logout'>
  tokens: TokenStore
  /** Deletes the files of the image rows a forced sign-out removed. */
  deleteImageFiles?: (files: ImageFile[]) => Promise<void> | void
}

export function createAccountService({ library, api, tokens, deleteImageFiles }: AccountServiceOptions): AccountService {
  return {
    async signIn(email, password) {
      const result = await api.login(email.trim(), password, deviceName())
      await tokens.set(result.token)
      try {
        library.setMeta(ACCOUNT_KEY, { email: result.email })
      } catch (error) {
        // No account without a token and no token without an account.
        await tokens.clear().catch(() => {})
        throw error
      }
    },
    async signOut({ force = false } = {}) {
      if (!force && library.outboxSize() > 0) return 'unsynced'
      // Offline, the session stays valid on the server until it is removed from another device.
      await api.logout().catch(() => {})
      await tokens.clear()
      const files = library.clearAccountData()
      await Promise.resolve(deleteImageFiles?.(files)).catch(() => {})
      return 'done'
    },
    async signedOut(sentToken) {
      if (sentToken !== undefined && (await tokens.get()) !== sentToken) return
      library.removeMeta(ACCOUNT_KEY)
      await tokens.clear()
    },
  }
}

const AccountServiceContext = createContext<AccountService | null>(null)

export function AccountProvider({ service, children }: { service: AccountService; children?: ReactNode }) {
  return createElement(AccountServiceContext.Provider, { value: service }, children)
}

export function useAccountService(): AccountService {
  const service = useContext(AccountServiceContext)
  if (!service) throw new Error('useAccountService needs an AccountProvider above it.')
  return service
}

/** The account signed in here, null when none. Reads the local store only, so it answers offline; live. */
export function useAccount(): Account | null {
  return useLiveQuery(['meta'], (library) => {
    const email = library.getMeta<{ email?: unknown }>(ACCOUNT_KEY)?.email
    return typeof email === 'string' ? { email } : null
  }, [])
}
