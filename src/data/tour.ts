import { db, getSettings, KV_KEYS, type LernzeitDB } from '@/db/db'
import type { TourFacts } from '@/lib/tour'

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

/**
 * What the tour can show in this browser: cards to practise, the story to
 * open (the first in the Stories list that has word notes, else the first),
 * and whether practice asks you to recall or to type. `wide` is the screen's
 * business, so the caller adds it.
 */
export async function getTourFacts(database: LernzeitDB = db): Promise<Omit<TourFacts, 'wide'>> {
  const [cards, stories, settings] = await Promise.all([database.cards.count(), database.stories.toArray(), getSettings(database)])
  // The order of the Stories page: last opened or added first.
  const listed = stories.sort((a, b) => (b.openedAt ?? b.createdAt) - (a.openedAt ?? a.createdAt))
  const story = listed.find((s) => s.words?.length) ?? listed[0]
  return { cards: cards > 0, story: story?.id, recall: !settings.typingMode && !settings.listeningMode }
}

/** The tour was finished or closed, so it does not start by itself again. */
export async function markTourSeen(database: LernzeitDB = db): Promise<void> {
  await database.kv.put({ key: KV_KEYS.tour, value: 'seen' })
}
