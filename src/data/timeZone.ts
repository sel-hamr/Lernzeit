import { db, getSettings, updateSettings, type LernzeitDB } from '@/db/db'
import { readAccount } from '@/sync/account'

/**
 * Writes this browser's time zone into the shared settings when signed in and it differs from the
 * stored one, so it syncs. The Worker runs in UTC and dates study sessions with the owner's zone.
 */
export async function recordTimeZone(database: LernzeitDB = db, zone = Intl.DateTimeFormat().resolvedOptions().timeZone): Promise<void> {
  if (!zone || !(await readAccount(database))) return
  if ((await getSettings(database)).timeZone === zone) return
  await updateSettings({ timeZone: zone }, database)
}
