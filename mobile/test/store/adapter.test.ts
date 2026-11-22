import { DatabaseSync } from 'node:sqlite'
import type { SQLiteDatabase } from 'expo-sqlite'
import { expoAdapter } from '../../src/store/adapter'
import { DATABASE_NAME, openLocalLibrary } from '../../src/store/open'

const mockOpenDatabaseSync = jest.fn()
jest.mock('expo-sqlite', () => ({ openDatabaseSync: (...args: unknown[]) => mockOpenDatabaseSync(...args) }))

/**
 * The synchronous expo-sqlite calls the adapter uses, run on Node's SQLite: what the native module
 * does on the phone, as its docs describe (getFirstSync answers null for no row, and
 * withTransactionSync is BEGIN, the task, then COMMIT or ROLLBACK).
 */
function fakeExpoDatabase() {
  const database = new DatabaseSync(':memory:')
  const calls: string[] = []
  const fake = {
    execSync(source: string) {
      calls.push(`exec ${source}`)
      database.exec(source)
    },
    runSync(source: string, params: (string | number | null)[]) {
      calls.push(`run ${source}`)
      const result = database.prepare(source).run(...params)
      return { lastInsertRowId: Number(result.lastInsertRowid), changes: Number(result.changes) }
    },
    getAllSync(source: string, params: (string | number | null)[]) {
      calls.push(`all ${source}`)
      return database.prepare(source).all(...params)
    },
    getFirstSync(source: string, params: (string | number | null)[]) {
      calls.push(`first ${source}`)
      return database.prepare(source).get(...params) ?? null
    },
    withTransactionSync(task: () => void) {
      calls.push('transaction')
      fake.execSync('BEGIN')
      try {
        task()
        fake.execSync('COMMIT')
      } catch (error) {
        fake.execSync('ROLLBACK')
        throw error
      }
    },
  }
  return { fake: fake as unknown as SQLiteDatabase, calls }
}

describe('expoAdapter', () => {
  it('maps the store’s SQL calls onto the synchronous expo-sqlite API', () => {
    const { fake, calls } = fakeExpoDatabase()
    const sql = expoAdapter(fake)
    sql.exec('CREATE TABLE t (a, b)')
    sql.run('INSERT INTO t VALUES (?, ?)', ['x', 1])
    sql.run('INSERT INTO t VALUES (?, ?)', [null, 2.5])
    expect(sql.all('SELECT a, b FROM t ORDER BY b')).toEqual([
      { a: 'x', b: 1 },
      { a: null, b: 2.5 },
    ])
    expect(sql.get('SELECT b FROM t WHERE a = ?', ['x'])).toEqual({ b: 1 })
    expect(sql.get('SELECT b FROM t WHERE a = ?', ['nope'])).toBeUndefined()
    expect(calls).toEqual([
      'exec CREATE TABLE t (a, b)',
      'run INSERT INTO t VALUES (?, ?)',
      'run INSERT INTO t VALUES (?, ?)',
      'all SELECT a, b FROM t ORDER BY b',
      'first SELECT b FROM t WHERE a = ?',
      'first SELECT b FROM t WHERE a = ?',
    ])
  })

  it('runs a transaction through withTransactionSync, handing back its result or rolling back', () => {
    const { fake, calls } = fakeExpoDatabase()
    const sql = expoAdapter(fake)
    sql.exec('CREATE TABLE t (a)')
    expect(sql.transaction(() => (sql.run('INSERT INTO t VALUES (?)', [1]), 'kept'))).toBe('kept')
    expect(() =>
      sql.transaction(() => {
        sql.run('INSERT INTO t VALUES (?)', [2])
        throw new Error('stop')
      }),
    ).toThrow('stop')
    expect(sql.all('SELECT a FROM t')).toEqual([{ a: 1 }])
    expect(calls.filter((call) => call === 'transaction' || call.startsWith('exec ROLLBACK'))).toEqual(['transaction', 'transaction', 'exec ROLLBACK'])
  })
})

describe('openLocalLibrary', () => {
  it('opens the app’s SQLite file through expo-sqlite and creates the tables', () => {
    const { fake } = fakeExpoDatabase()
    mockOpenDatabaseSync.mockReturnValue(fake)
    const library = openLocalLibrary({ now: () => 5000 })
    expect(mockOpenDatabaseSync).toHaveBeenCalledWith(DATABASE_NAME)
    library.put('decks', { id: 'd1', name: 'One' })
    expect(library.get('decks', 'd1')).toEqual({ id: 'd1', name: 'One' })
    expect(library.outbox()).toEqual([{ tbl: 'decks', id: 'd1', at: 5000 }])
  })
})
