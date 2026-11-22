/*
 * The few SQL calls the local store makes, so the same store runs on the phone (expo-sqlite) and in
 * the tests (Node's built-in SQLite, test/store/nodeSqlite.ts).
 *
 * Synchronous on purpose. expo-sqlite's sync API (runSync, getAllSync, withTransactionSync) runs on
 * the JS thread, so a transaction can never interleave with another write: `applyRemote` can tell
 * pulled writes from local ones with a plain flag, the change events of a transaction go out right
 * after its COMMIT, and a screen's first render already has its data. The phone's library is a few
 * thousand small JSON rows and a pull page is at most 500 of them, so a call takes milliseconds;
 * a query that grows slow later can move to the async API behind the same store methods.
 */
import type { SQLiteDatabase } from 'expo-sqlite'

/** What SQLite stores: booleans go in as 1 and 0, JSON as text. */
export type SqlValue = string | number | null

export interface SqlAdapter {
  /** Runs one or more statements without parameters, such as the schema. */
  exec(sql: string): void
  run(sql: string, params?: SqlValue[]): void
  all<T>(sql: string, params?: SqlValue[]): T[]
  /** The first row, undefined when there is none. */
  get<T>(sql: string, params?: SqlValue[]): T | undefined
  /** Runs `fn` between BEGIN and COMMIT; a throw rolls back and is rethrown. Not nested: the store keeps one at a time. */
  transaction<T>(fn: () => T): T
}

/** The store's SQL over an expo-sqlite database opened with `openDatabaseSync`. */
export function expoAdapter(database: SQLiteDatabase): SqlAdapter {
  return {
    exec: (sql) => database.execSync(sql),
    run: (sql, params = []) => void database.runSync(sql, params),
    all: <T>(sql: string, params: SqlValue[] = []) => database.getAllSync<T>(sql, params),
    get: <T>(sql: string, params: SqlValue[] = []) => database.getFirstSync<T>(sql, params) ?? undefined,
    transaction<T>(fn: () => T): T {
      let result!: T
      database.withTransactionSync(() => {
        result = fn()
      })
      return result
    },
  }
}
