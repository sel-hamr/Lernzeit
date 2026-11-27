/*
 * Change events of the local store, by table: after each committed transaction the store tells the
 * subscribers of every table it wrote, once. Plain TS; the React side is live.ts.
 */
import type { SyncTable } from '@lernzeit/core/sync'

/** What a subscriber can listen to: a synced table, or the store's own `outbox`, `meta` and image files. */
export type LiveTable = SyncTable | 'outbox' | 'meta' | 'imageFiles'

export interface ChangeEvent {
  /** Every table the transaction wrote. */
  tables: ReadonlySet<LiveTable>
  /** Whether it recorded a local change in the outbox, one the sync should push. */
  local: boolean
}

export type ChangeListener = (event: ChangeEvent) => void

export interface ChangeBus {
  /** Calls `listener` after each committed transaction that wrote one of `tables`. Returns an unsubscribe. */
  subscribe(tables: readonly LiveTable[], listener: ChangeListener): () => void
  emit(event: ChangeEvent): void
  /**
   * A number that grows with every committed write to one of `tables`. A screen that read before it
   * subscribed compares it to tell whether it missed a write in between.
   */
  version(tables: readonly LiveTable[]): number
}

export function createChangeBus(): ChangeBus {
  const subscriptions = new Set<{ tables: ReadonlySet<LiveTable>; listener: ChangeListener }>()
  const versions = new Map<LiveTable, number>()
  return {
    subscribe(tables, listener) {
      const subscription = { tables: new Set(tables), listener }
      subscriptions.add(subscription)
      return () => void subscriptions.delete(subscription)
    },
    emit(event) {
      for (const table of event.tables) versions.set(table, (versions.get(table) ?? 0) + 1)
      for (const subscription of [...subscriptions]) {
        if (![...event.tables].some((table) => subscription.tables.has(table))) continue
        try {
          subscription.listener(event)
        } catch (error) {
          // The write is committed: a failing listener must not look like a failed write to its
          // caller, nor keep the other listeners from hearing of it.
          queueMicrotask(() => {
            throw error
          })
        }
      }
    },
    version(tables) {
      let sum = 0
      for (const table of new Set(tables)) sum += versions.get(table) ?? 0
      return sum
    },
  }
}
