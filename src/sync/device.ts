import { db, newId, type LernzeitDB } from '@/db/db'

/** This browser's id, made on first use and kept in `meta`. */
export async function getDeviceId(database: LernzeitDB = db): Promise<string> {
  return database.transaction('rw', database.meta, async () => {
    const row = await database.meta.get('deviceId')
    if (typeof row?.value === 'string') return row.value
    const id = newId()
    await database.meta.put({ key: 'deviceId', value: id })
    return id
  })
}
