import { db, KV_KEYS, type LernzeitDB } from '@/db/db'

/** Where the tour stands: never asked for, waiting to run, or done. */
export type TourState = 'none' | 'pending' | 'seen'

export async function getTourState(database: LernzeitDB = db): Promise<TourState> {
  const value = (await database.kv.get(KV_KEYS.tour))?.value
  return value === 'pending' || value === 'seen' ? value : 'none'
}

/** Asks for the tour: it starts as soon as nothing else is in the way, and again after a reload until it ends. */
export async function queueTour(database: LernzeitDB = db): Promise<void> {
  await database.kv.put({ key: KV_KEYS.tour, value: 'pending' })
}

/** The tour was finished or closed, so it does not start by itself again. */
export async function markTourSeen(database: LernzeitDB = db): Promise<void> {
  await database.kv.put({ key: KV_KEYS.tour, value: 'seen' })
}
