/*
 * How sync is doing, for the menu's sync row and Settings, as on the web (src/sync/status.ts). The
 * engine sets the state; `useSyncStatus` adds what the local store knows, live: how many changes
 * wait in the outbox, which of them the cloud refused, and when this phone last synced (kept in
 * meta, so it survives a restart). Without an account the state is always `signedOut`.
 */
import { useSyncExternalStore } from 'react'
import { ACCOUNT_KEY, type LocalLibrary } from '../store/library'
import { useLiveQuery } from '../store/live'

export type SyncState = 'idle' | 'syncing' | 'offline' | 'signedOut' | 'error'

export interface SyncStatus {
  state: SyncState
  /** What went wrong, in the state `error`. */
  error?: string
}

/** `meta` key of when this phone last finished a sync, in ms. */
export const LAST_SYNCED_KEY = 'lastSyncedAt'

let status: SyncStatus = { state: 'idle' }
const listeners = new Set<() => void>()

export function getSyncStatus(): SyncStatus {
  return status
}

export function setSyncStatus(next: SyncStatus): void {
  status = next
  for (const listener of [...listeners]) listener()
}

export function subscribeSyncStatus(listener: () => void): () => void {
  listeners.add(listener)
  return () => void listeners.delete(listener)
}

/** A local change the cloud cannot take as it is. It waits in the outbox until the record changes, and gets one more try each time the app starts. */
export interface StuckChange {
  tbl: string
  id: string
  reason: string
}

export function stuckChanges(library: LocalLibrary): StuckChange[] {
  return library.outbox().flatMap(({ tbl, id, stuck }) => (stuck === undefined ? [] : [{ tbl, id, reason: stuck }]))
}

export interface SyncStatusView extends SyncStatus {
  /** Local changes waiting in the outbox, stuck ones included. */
  pending: number
  stuck: StuckChange[]
  lastSyncedAt?: number
}

/** The sync status with the outbox and the last sync, live. Needs a LocalLibraryProvider above it. */
export function useSyncStatus(): SyncStatusView {
  const current = useSyncExternalStore(subscribeSyncStatus, getSyncStatus)
  const pending = useLiveQuery(['outbox'], (library) => library.outboxSize(), [])
  const stuck = useLiveQuery(['outbox'], stuckChanges, [])
  const { signedIn, lastSyncedAt } = useLiveQuery(
    ['meta'],
    (library) => ({ signedIn: library.getMeta(ACCOUNT_KEY) !== undefined, lastSyncedAt: library.getMeta<number>(LAST_SYNCED_KEY) }),
    [],
  )
  return { ...(signedIn ? current : { state: 'signedOut' }), pending, stuck, lastSyncedAt }
}

/**
 * The phone's very first sync is under way: nothing has come down yet, so an empty list means
 * "on its way", not "you have none". Screens show a loading skeleton then instead of an empty state.
 */
export function isFirstSync(status: Pick<SyncStatusView, 'state' | 'lastSyncedAt'>): boolean {
  return status.state === 'syncing' && status.lastSyncedAt === undefined
}

/** `isFirstSync` for the current status, live. */
export function useFirstSync(): boolean {
  return isFirstSync(useSyncStatus())
}
