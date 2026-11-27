/*
 * How sync is doing, for the sidebar and Settings. The engine writes it; components read it with
 * `useSyncStatus`, which adds how many local changes wait in the outbox.
 */
import { useSyncExternalStore } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type LernzeitDB } from '@/db/db'

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

/** A local change the cloud cannot take as it is. It waits in the outbox until the record changes, and gets one more try each time the app starts. */
export interface StuckChange {
  tbl: string
  id: string
  reason: string
}

const NONE: StuckChange[] = []

export async function stuckChanges(database: LernzeitDB = db): Promise<StuckChange[]> {
  const entries = await database.outbox.filter((entry) => entry.stuck !== undefined).toArray()
  return entries.map(({ tbl, id, stuck }) => ({ tbl, id, reason: stuck! }))
}

/** The status, how many local changes wait in the outbox (stuck ones included) and which are stuck. */
export function useSyncStatus(): SyncStatus & { pending: number; stuck: StuckChange[] } {
  const current = useSyncExternalStore(subscribeSyncStatus, getSyncStatus)
  const pending = useLiveQuery(() => db.outbox.count(), [], 0)
  const stuck = useLiveQuery(() => stuckChanges(), [], NONE)
  return { ...current, pending, stuck }
}
