/*
 * The outbox: every local write to a synced table leaves an entry `{ tbl, id, at }` saying that
 * record changed at `at`, written in the same transaction as the change. The sync engine pushes
 * the record as it is then (a missing row is a delete) and removes the entry once the server has it.
 *
 * Writes are caught in Dexie's DBCore layer, below every table method, so no code path that changes
 * a synced table can forget to record. Writes the engine applies from the server run inside
 * `applyRemote` and are not recorded, or every pulled change would be pushed straight back.
 */
import Dexie, { type DBCore, type DBCoreMutateRequest, type DBCoreMutateResponse, type DBCoreTable, type DBCoreTransaction, type Middleware } from 'dexie'
import { SYNC_TABLES, isSynced } from '@lernzeit/core/sync'
import { nextAt } from '@lernzeit/core/syncRules'
import type { LernzeitDB } from '@/db/db'

const OUTBOX = 'outbox'
const syncedTables = new Set<string>(SYNC_TABLES)

/** The transactions `applyRemote` opened. Their writes come from the server. */
const remoteTransactions = new WeakSet<DBCoreTransaction>()

type Listener = (databaseName: string) => void
const listeners = new Set<Listener>()

/** Calls `listener` with the database's name after each recorded local write. Returns an unsubscribe. */
export function onLocalChange(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/*
 * The steps below chain with Dexie.Promise, not async/await: Dexie's own middlewares further down
 * find the current transaction through Dexie's zone, which Dexie.Promise carries and a native await
 * loses.
 */

/** The primary keys a write touches, in request order. */
function keysOf(table: DBCoreTable, req: DBCoreMutateRequest): PromiseLike<unknown[]> {
  switch (req.type) {
    case 'add':
    case 'put':
      return Dexie.Promise.resolve(req.keys ?? req.values.map((value) => table.schema.primaryKey.extractKey!(value)))
    case 'delete':
      return Dexie.Promise.resolve(req.keys)
    case 'deleteRange':
      return Dexie.Promise.resolve(
        table.query({ trans: req.trans, values: false, query: { index: table.schema.primaryKey, range: req.range } }),
      ).then(({ result }) => result)
  }
}

function recording(down: DBCore, table: DBCoreTable): DBCoreTable {
  const outbox = down.table(OUTBOX)

  /** Writes an entry for each synced id the write touched, in the write's transaction. */
  function record(trans: DBCoreTransaction, ids: string[]): PromiseLike<void> {
    if (ids.length === 0) return Dexie.Promise.resolve()
    const keys = ids.map((id) => [table.name, id])
    return Dexie.Promise.resolve(outbox.getMany({ trans, keys }))
      .then((previous: ({ at: number } | undefined)[]) => {
        const now = Date.now()
        // `at` always moves forward, so the engine can tell an entry was rewritten while its push
        // was in flight even when the clock has not ticked (or went back).
        const values = ids.map((id, i) => ({ tbl: table.name, id, at: nextAt(previous[i]?.at, now) }))
        return outbox.mutate({ trans, type: 'put', values })
      })
      .then(() => {
        for (const listener of listeners) listener(down.schema.name)
      })
  }

  return {
    ...table,
    mutate(req): Promise<DBCoreMutateResponse> {
      if (remoteTransactions.has(req.trans)) return table.mutate(req)
      return Dexie.Promise.resolve(keysOf(table, req)).then((keys) =>
        Dexie.Promise.resolve(table.mutate(req)).then((res) => {
          const ids = new Set<string>()
          keys.forEach((key, i) => {
            if (res.failures[i]) return
            const id = String(key)
            if (isSynced(table.name, id)) ids.add(id)
          })
          return Dexie.Promise.resolve(record(req.trans, [...ids])).then(() => res)
        }),
      )
    },
  }
}

/** Records local writes to synced tables in `outbox`. Registered in the `LernzeitDB` constructor. */
export const syncMiddleware: Middleware<DBCore> = {
  stack: 'dbcore',
  name: 'sync-outbox',
  create(down) {
    if (!down.schema.tables.some((table) => table.name === OUTBOX)) return down
    return {
      ...down,
      // A write to a synced table writes its outbox entry in the same transaction, so the
      // transaction must cover `outbox` too.
      transaction(stores, mode, options) {
        const widen = mode === 'readwrite' && !stores.includes(OUTBOX) && stores.some((name) => syncedTables.has(name))
        return down.transaction(widen ? [...stores, OUTBOX] : stores, mode, options)
      },
      table(name) {
        const table = down.table(name)
        return syncedTables.has(name) ? recording(down, table) : table
      },
    }
  },
}

/** Every table a pulled change can touch, the outbox and the cursor's `meta`. */
const REMOTE_STORES = [...SYNC_TABLES, OUTBOX, 'meta']

/**
 * Runs `fn` in one read-write transaction over the synced tables, `outbox` and `meta`, whose writes
 * are not recorded in the outbox. Use it for changes that came from the server. `fn` may only await
 * database calls, as in any Dexie transaction; fetch what it needs first. Call it outside other
 * transactions: a nested one would share, and so stop recording, its parent's transaction.
 */
export function applyRemote<T>(database: LernzeitDB, fn: () => Promise<T>): Promise<T> {
  return database.transaction('rw', REMOTE_STORES, (tx) => {
    remoteTransactions.add(tx.idbtrans as unknown as DBCoreTransaction)
    return fn()
  })
}
