/*
 * The phone's local database: one generic table that mirrors the cloud's `records`, so a pulled
 * change is stored as the JSON it came in, plus this device's bookkeeping.
 *
 *  - records: every synced record (and kv rows that stay on this device), `data` the row's JSON as
 *    /api/sync/pull hands it out, `updated_at` the cloud's time for a pulled change and the outbox
 *    stamp for a local write. A deleted record is simply gone: the outbox entry tells the push.
 *  - outbox: one entry per locally changed record, `at` its latest write (see library.ts).
 *    `stuck` is why the cloud refused it, while it is parked.
 *  - meta: this device's own values as JSON, such as the pull cursor.
 *  - images: where each image's file is on this phone, with what the app needs to show it.
 *
 * `records` is an ordinary rowid table: its rows hold whole JSON records (a doc can be most of a
 * megabyte), which a WITHOUT ROWID table stores badly. The small bookkeeping tables are WITHOUT ROWID.
 */
import type { SqlAdapter } from './adapter'

/** Bumped with each change to the schema below; `PRAGMA user_version` holds the one a database has. */
export const SCHEMA_VERSION = 1

const SCHEMA_V1 = `
CREATE TABLE IF NOT EXISTS records (
  tbl TEXT NOT NULL,
  id TEXT NOT NULL,
  data TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (tbl, id)
);
CREATE TABLE IF NOT EXISTS outbox (
  tbl TEXT NOT NULL,
  id TEXT NOT NULL,
  at INTEGER NOT NULL,
  stuck TEXT,
  PRIMARY KEY (tbl, id)
) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS images (
  id TEXT PRIMARY KEY NOT NULL,
  path TEXT NOT NULL,
  type TEXT NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  fit TEXT NOT NULL
) WITHOUT ROWID;
`

/** Creates the tables of a new database, or brings an older one up to SCHEMA_VERSION. */
export function migrate(sql: SqlAdapter): void {
  const version = sql.get<{ user_version: number }>('PRAGMA user_version')?.user_version ?? 0
  if (version >= SCHEMA_VERSION) return
  sql.transaction(() => {
    sql.exec(SCHEMA_V1)
    sql.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`)
  })
}
