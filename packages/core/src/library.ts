/*
 * The owner's library as the AI tools see it: synced records per table, read
 * live and written as one batch. The Worker keeps it in D1; tests use the
 * memory store below. Rows are plain JSON, as they sync.
 */
import type { Library } from './fold'
import { recordId, type SyncChange, type SyncTable } from './sync'

/**
 * Equality on top-level JSON fields, each compared with a value of the field's own type: a
 * boolean field with true or false, a number with a number (`'0'` does not match 0). `null` also
 * matches a field that is missing. A value of any other kind, `undefined` included, is refused.
 */
export type Filter = Record<string, string | number | boolean | null>

/** Throws when a filter value is not a string, number, boolean or null (say `undefined`). */
export function checkFilter(filter?: Filter): void {
  for (const [field, value] of Object.entries(filter ?? {})) {
    const kind = typeof value
    if (value !== null && kind !== 'string' && kind !== 'number' && kind !== 'boolean') {
      throw new Error(`Cannot filter "${field}" on ${value === undefined ? 'undefined' : `a ${kind}`}: use a string, number, boolean, or null for a missing field.`)
    }
  }
}

export interface LibraryReader {
  /** Live rows, staged writes applied. In no particular order. */
  list<T>(tbl: SyncTable, filter?: Filter): Promise<T[]>
  /** The ids (a kv row's key) of the rows `list` would return, without reading the rows. In no particular order. */
  listIds(tbl: SyncTable, filter?: Filter): Promise<string[]>
  get<T>(tbl: SyncTable, id: string): Promise<T | undefined>
  count(tbl: SyncTable, filter?: Filter): Promise<number>
}

export interface LibraryStore extends LibraryReader {
  /** Staged: readable at once, written by `commit`. The row is copied. */
  put(tbl: SyncTable, row: object): void
  /** Staged tombstone. */
  remove(tbl: SyncTable, id: string): void
  /** Writes all staged changes at once. */
  commit(): Promise<void>
  /** The owner's IANA time zone, for local dates. */
  readonly timeZone: string
  readonly now: () => number
}

/** A staged write: `data` null for a delete. */
export interface StagedChange {
  tbl: SyncTable
  id: string
  data: object | null
}

/** A row as JSON stores it: a copy, with undefined fields left out. */
const copy = <T>(row: unknown): T => JSON.parse(JSON.stringify(row)) as T

export function matchesFilter(row: object, filter?: Filter): boolean {
  if (!filter) return true
  const fields = row as Record<string, unknown>
  return Object.entries(filter).every(([field, value]) => (value === null ? fields[field] === null || fields[field] === undefined : fields[field] === value))
}

/**
 * Writes staged on top of `base`: reads see them at once, nothing reaches
 * `base` until the caller takes `changes()`. One change per record, the last
 * write winning, in the order the records were first touched.
 */
export function stageWrites(base: LibraryReader): LibraryReader & {
  put(tbl: SyncTable, row: object): void
  remove(tbl: SyncTable, id: string): void
  changes(): StagedChange[]
  clear(): void
} {
  // Every change in the order its record was first touched, and the same changes by table, so a
  // read only looks at the staged rows of its own table.
  const staged = new Map<string, StagedChange>()
  const byTable = new Map<SyncTable, Map<string, StagedChange>>()
  const keyOf = (tbl: SyncTable, id: string) => `${tbl}\u0000${id}`
  const stagedIn = (tbl: SyncTable) => byTable.get(tbl)
  const stage = (change: StagedChange) => {
    staged.set(keyOf(change.tbl, change.id), change)
    let table = byTable.get(change.tbl)
    if (!table) byTable.set(change.tbl, (table = new Map()))
    table.set(change.id, change)
  }

  async function list<T>(tbl: SyncTable, filter?: Filter): Promise<T[]> {
    const rows = await base.list<T>(tbl, filter)
    const table = stagedIn(tbl)
    if (!table?.size) return rows
    const kept = rows.filter((row) => !table.has(recordId(tbl, row as object)))
    const fresh: T[] = []
    for (const change of table.values()) if (change.data && matchesFilter(change.data, filter)) fresh.push(copy<T>(change.data))
    return [...kept, ...fresh]
  }

  async function listIds(tbl: SyncTable, filter?: Filter): Promise<string[]> {
    const ids = await base.listIds(tbl, filter)
    const table = stagedIn(tbl)
    if (!table?.size) return ids
    const kept = ids.filter((id) => !table.has(id))
    for (const change of table.values()) if (change.data && matchesFilter(change.data, filter)) kept.push(change.id)
    return kept
  }

  return {
    list,
    listIds,
    async get<T>(tbl: SyncTable, id: string): Promise<T | undefined> {
      const change = stagedIn(tbl)?.get(id)
      if (change) return change.data ? copy<T>(change.data) : undefined
      return base.get<T>(tbl, id)
    },
    async count(tbl: SyncTable, filter?: Filter): Promise<number> {
      return stagedIn(tbl)?.size ? (await list(tbl, filter)).length : base.count(tbl, filter)
    },
    put(tbl, row) {
      const data = copy<object>(row)
      stage({ tbl, id: recordId(tbl, data), data })
    },
    remove(tbl, id) {
      stage({ tbl, id, data: null })
    },
    changes: () => [...staged.values()],
    clear: () => {
      staged.clear()
      byTable.clear()
    },
  }
}

/**
 * A library in memory, for tests. `committed` lists every change `commit`
 * wrote, oldest first, stamped with `now()` at the commit.
 */
export function createMemoryStore(seed: Library = {}, options: { timeZone?: string; now?: () => number } = {}): LibraryStore & { committed: SyncChange[] } {
  const tables = new Map<SyncTable, Map<string, object>>()
  const table = (tbl: SyncTable) => {
    let rows = tables.get(tbl)
    if (!rows) tables.set(tbl, (rows = new Map()))
    return rows
  }
  for (const [tbl, rows] of Object.entries(seed) as [SyncTable, object[]][]) {
    for (const row of rows) table(tbl).set(recordId(tbl, row), copy(row))
  }

  const stored: LibraryReader = {
    async list<T>(tbl: SyncTable, filter?: Filter) {
      checkFilter(filter)
      return [...table(tbl).values()].filter((row) => matchesFilter(row, filter)).map((row) => copy<T>(row))
    },
    async listIds(tbl: SyncTable, filter?: Filter) {
      checkFilter(filter)
      return [...table(tbl).entries()].filter(([, row]) => matchesFilter(row, filter)).map(([id]) => id)
    },
    async get<T>(tbl: SyncTable, id: string) {
      const row = table(tbl).get(id)
      return row ? copy<T>(row) : undefined
    },
    async count(tbl: SyncTable, filter?: Filter) {
      checkFilter(filter)
      return [...table(tbl).values()].filter((row) => matchesFilter(row, filter)).length
    },
  }
  const staging = stageWrites(stored)
  const now = options.now ?? (() => Date.now())
  const committed: SyncChange[] = []

  return {
    list: staging.list,
    listIds: staging.listIds,
    get: staging.get,
    count: staging.count,
    put: staging.put,
    remove: staging.remove,
    async commit() {
      const at = now()
      for (const { tbl, id, data } of staging.changes()) {
        if (data) table(tbl).set(id, data)
        else table(tbl).delete(id)
        committed.push({ tbl, id, data: data && copy(data), updatedAt: at, deleted: !data })
      }
      staging.clear()
    },
    timeZone: options.timeZone ?? 'UTC',
    now,
    committed,
  }
}
