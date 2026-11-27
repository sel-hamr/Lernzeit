/*
 * The store's SQL adapter over Node's built-in SQLite, so the store's tests run the real SQL
 * without the phone's native expo-sqlite module. Test code only: Metro never bundles it.
 */
import { DatabaseSync } from 'node:sqlite'
import type { SqlAdapter, SqlValue } from '../../src/store/adapter'

/** A database in memory, gone when the test drops it. */
export function nodeSqliteAdapter(database = new DatabaseSync(':memory:')): SqlAdapter & { database: DatabaseSync } {
  return {
    database,
    exec: (sql) => database.exec(sql),
    run: (sql, params: SqlValue[] = []) => void database.prepare(sql).run(...params),
    all: <T>(sql: string, params: SqlValue[] = []) => database.prepare(sql).all(...params) as T[],
    get: <T>(sql: string, params: SqlValue[] = []) => database.prepare(sql).get(...params) as T | undefined,
    transaction<T>(fn: () => T): T {
      database.exec('BEGIN')
      try {
        const result = fn()
        database.exec('COMMIT')
        return result
      } catch (error) {
        database.exec('ROLLBACK')
        throw error
      }
    },
  }
}
