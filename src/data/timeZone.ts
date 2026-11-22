import { db, KV_KEYS, type LernzeitDB } from '@/db/db'
import { readAccount } from '@/sync/account'

/**
 * Writes this browser's time zone into its own synced record (`kv/timeZone`) when signed in and it
 * differs from the stored one. The Worker runs in UTC and dates study sessions with the owner's zone.
 * It is not a setting: rewriting the shared settings record would put this device's copy of every
 * other setting over newer changes made on another device.
 */
export async function recordTimeZone(database: LernzeitDB = db, zone = Intl.DateTimeFormat().resolvedOptions().timeZone): Promise<void> {
  if (!zone || !(await readAccount(database))) return
  await database.transaction('rw', database.kv, async () => {
    if ((await database.kv.get(KV_KEYS.timeZone))?.value === zone) return
    await database.kv.put({ key: KV_KEYS.timeZone, value: zone })
  })
}
