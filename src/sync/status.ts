/*
 * How sync is doing, for the sidebar and Settings. The engine writes it; components read it with
 * `useSyncStatus`, which adds how many local changes wait in the outbox.
 */
import { useSyncExternalStore } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/db'

export type SyncState = 'idle' | 'syncing' | 'offline' | 'signedOut' | 'error'

export interface SyncStatus {
  state: SyncState
  lastSyncedAt?: number
  error?: string
}

let status: SyncStatus = { state: 'idle' }
const listeners = new Set<() => void>()

export function getSyncStatus(): SyncStatus {
  return status
}

/** Replaces the state; `lastSyncedAt` carries over unless given. */
export function setSyncStatus(next: SyncStatus): void {
  status = { lastSyncedAt: status.lastSyncedAt, ...next }
  for (const listener of listeners) listener()
}

export function subscribeSyncStatus(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useSyncStatus(): SyncStatus & { pending: number } {
  const current = useSyncExternalStore(subscribeSyncStatus, getSyncStatus)
  const pending = useLiveQuery(() => db.outbox.count(), [], 0)
  return { ...current, pending }
}
