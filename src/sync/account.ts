/*
 * The cloud account on this browser. `meta.account` says who signed in here; the app shows the
 * sign-in page only while it is missing, so a browser that signed in before opens on its own data
 * offline too. `meta.merged` says this browser's library went into the cloud (firstSignIn.ts);
 * the sync engine runs only after that.
 */
import { useSyncExternalStore } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type LernzeitDB } from '@/db/db'
import { SYNCED_KV_KEYS, SYNC_TABLES } from '@lernzeit/core/sync'
import { OfflineError, SignedOutError, login, logout } from './api'
import { startSync, stopSync, syncNow, withLock } from './engine'
import { MERGED_KEY, mergeIntoCloud, type MergeSummary } from './firstSignIn'
import { applyRemote } from './outbox'
import { getSyncStatus, subscribeSyncStatus } from './status'

const ACCOUNT_KEY = 'account'
/** The one `meta` row that outlives signing out. */
const DEVICE_ID_KEY = 'deviceId'

export interface Account {
  email: string
  /** This browser's library is in the cloud, so it syncs. */
  merged: boolean
}

/** The account signed in here, or null. Asks no server. */
export async function readAccount(database: LernzeitDB = db): Promise<Account | null> {
  const [account, merged] = await database.meta.bulkGet([ACCOUNT_KEY, MERGED_KEY])
  const email = (account?.value as { email?: unknown } | undefined)?.email
  return typeof email === 'string' ? { email, merged: merged?.value === true } : null
}

/** The account signed in here, null when none, undefined while loading. */
export function useAccount(): Account | null | undefined {
  return useLiveQuery(() => readAccount(), [])
}

// ---- The first-sign-in merge, which the merge dialog shows ----

export interface MergeProgress {
  state: 'idle' | 'running' | 'failed' | 'done'
  step?: string
  error?: string
  summary?: MergeSummary
}

let progress: MergeProgress = { state: 'idle' }
const listeners = new Set<() => void>()

function setProgress(next: MergeProgress) {
  progress = next
  for (const listener of listeners) listener()
}

export function getMergeProgress(): MergeProgress {
  return progress
}

function subscribeMerge(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useMergeProgress(): MergeProgress {
  return useSyncExternalStore(subscribeMerge, getMergeProgress)
}

/** Words for a merge or sign-in failure. */
export function failureMessage(error: unknown): string {
  if (error instanceof OfflineError) return 'Can’t reach your Lernzeit cloud. Check the connection and try again.'
  if (error instanceof SignedOutError) return 'You were signed out. Sign in again.'
  return error instanceof Error ? error.message : String(error)
}

let merging: Promise<boolean> | undefined

/**
 * Merges this browser into the cloud unless it is already, once at a time: holding the sync lock,
 * so another tab cannot merge or sync meanwhile. Never throws; the progress says how it went.
 * Resolves true once merged.
 */
export function runMerge(database: LernzeitDB = db): Promise<boolean> {
  merging ??= (async () => {
    setProgress({ state: 'running' })
    try {
      const summary = await withLock(async () => {
        // Another tab may have merged while this one waited.
        if ((await readAccount(database))?.merged) return undefined
        return mergeIntoCloud(database, (step) => setProgress({ state: 'running', step }))
      })
      setProgress(summary ? { state: 'done', summary } : { state: 'idle' })
      return true
    } catch (error) {
      setProgress({ state: 'failed', error: failureMessage(error) })
      return false
    } finally {
      merging = undefined
    }
  })()
  return merging
}

/** Closes the merge summary. */
export function finishMerge(): void {
  setProgress({ state: 'idle' })
}

/** Gives up a sign-in whose merge did not finish. This browser's data stays as it was. */
export async function cancelSignIn(database: LernzeitDB = db): Promise<void> {
  await database.meta.delete(ACCOUNT_KEY)
  setProgress({ state: 'idle' })
  await logout().catch(() => {})
}

// ---- Signing in and out ----

let stopAccount: (() => void) | undefined

/**
 * Starts the sync engine (see startSync) for the signed-in account. When the server says the
 * session is gone, the account is forgotten here and the sign-in page shows; local data and the
 * outbox stay, so signing in again pushes them.
 */
export function startAccountSync(database: LernzeitDB = db): void {
  if (stopAccount) return
  const unsubscribe = subscribeSyncStatus(() => {
    if (getSyncStatus().state !== 'signedOut') return
    stopAccountSync()
    void database.meta.delete(ACCOUNT_KEY)
  })
  stopAccount = () => {
    unsubscribe()
    stopSync()
  }
  startSync(database)
}

export function stopAccountSync(): void {
  stopAccount?.()
  stopAccount = undefined
}

/**
 * Signs in with the owner's email and password. The first time on this browser its library is
 * merged into the cloud (see runMerge); then syncing starts. A wrong password or a refused
 * sign-in throws an ApiError with the server's message, OfflineError without network.
 */
export async function signIn(email: string, password: string, database: LernzeitDB = db): Promise<void> {
  const account = await login(email.trim(), password)
  await database.meta.put({ key: ACCOUNT_KEY, value: { email: account.email } })
  if (!(await readAccount(database))?.merged && !(await runMerge(database))) return
  startAccountSync(database)
}

/**
 * Signs this browser out. It syncs first; when changes are still waiting it returns 'unsynced'
 * and changes nothing, so the app can ask. With `force`, or once nothing waits, the session ends
 * and every synced table, the outbox and `meta` (but this browser's id) are cleared: the library
 * lives in the cloud. This browser's own settings stay. Then the page reloads.
 */
export async function signOut({ force = false }: { force?: boolean } = {}, database: LernzeitDB = db): Promise<'done' | 'unsynced'> {
  if (!force) {
    await syncNow(database).catch(() => {})
    if ((await database.outbox.count()) > 0) return 'unsynced'
  }
  stopAccountSync()
  // Offline, the session stays valid on the server until it is removed from another device.
  await logout().catch(() => {})
  await applyRemote(database, async () => {
    await Promise.all([
      ...SYNC_TABLES.filter((tbl) => tbl !== 'kv').map((tbl) => database.table(tbl).clear()),
      database.kv.bulkDelete([...SYNCED_KV_KEYS]),
      database.outbox.clear(),
      database.meta.where('key').notEqual(DEVICE_ID_KEY).delete(),
    ])
  })
  // Reloading stops the engines that run while signed in (timer, reminders, AI connection).
  if (typeof window !== 'undefined') window.location.reload()
  return 'done'
}
