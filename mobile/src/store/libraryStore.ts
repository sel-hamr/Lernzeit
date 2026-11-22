/*
 * Core's LibraryStore over the phone's library, so the shared actions (packages/core/src/actions)
 * run on the phone as they do in the Worker. Writes are staged as in every LibraryStore, and
 * `commit()` stores them as local writes in one transaction: each synced record goes in the outbox
 * and the subscribers hear of it once. The same contract suite as the memory and D1 stores tests it.
 */
import { stageWrites, type Filter, type LibraryReader, type LibraryStore } from '@lernzeit/core/library'
import { isSynced, recordId, type SyncTable } from '@lernzeit/core/sync'
import type { LocalLibrary } from './library'

/** This phone's IANA time zone, UTC when the platform cannot tell. */
function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

/**
 * A LibraryStore for one action. Its `timeZone` is this phone's own (the one it records in
 * `kv/timeZone`) unless given, and its clock the library's. A failed commit drops the staged
 * writes, having stored none of them, as the D1 store does.
 */
export function createPhoneLibraryStore(library: LocalLibrary, options: { timeZone?: string } = {}): LibraryStore {
  // The reads are synchronous underneath; async functions also turn a bad filter into a rejection.
  // Only synced records, as in the D1 store: this phone's own kv rows (theme, say) are not the library's.
  const synced = (tbl: SyncTable, row: object) => tbl !== 'kv' || isSynced(tbl, recordId(tbl, row))
  const stored: LibraryReader = {
    list: async <T>(tbl: SyncTable, filter?: Filter) => library.list<T & object>(tbl, filter).filter((row) => synced(tbl, row)),
    listIds: async (tbl, filter) => library.listIds(tbl, filter).filter((id) => isSynced(tbl, id)),
    get: async <T>(tbl: SyncTable, id: string) => (isSynced(tbl, id) ? library.get<T>(tbl, id) : undefined),
    count: async (tbl, filter) => (tbl === 'kv' ? library.listIds(tbl, filter).filter((id) => isSynced(tbl, id)).length : library.count(tbl, filter)),
  }
  const staging = stageWrites(stored)

  return {
    list: staging.list,
    listIds: staging.listIds,
    get: staging.get,
    count: staging.count,
    put: staging.put,
    remove: staging.remove,
    async commit() {
      const staged = staging.changes()
      staging.clear()
      if (staged.length === 0) return
      library.write(() => {
        for (const { tbl, id, data } of staged) {
          if (data) library.put(tbl, data)
          else library.remove(tbl, id)
        }
      })
    },
    timeZone: options.timeZone ?? deviceTimeZone(),
    now: library.now,
  }
}
