import { newId, type LernzeitDB } from '@/db/db'
import { installLanguage } from '@/data/languages'
import { createTopic } from '@/data/topics'
import { uniformGoals } from '@/lib/goals'
import { packInfo } from '@/languages'

/**
 * Every level of the German pack, as installs from before language packs
 * had it, and an AI topic with an empty deck, for tests about more than one
 * topic.
 */
export async function seedGerman(database: LernzeitDB): Promise<void> {
  await installLanguage({ learning: 'de', native: 'en', levels: packInfo('de')!.levels }, database)
  const ai = await createTopic({ name: 'AI', color: 'blue', goals: uniformGoals(120) }, database)
  await database.decks.add({
    id: newId(), name: 'AI terms', topicId: ai.id, newPerDay: 15, reviewsPerDay: 150,
    directions: { imageToDe: false, enToDe: true, deToEn: true }, order: 100, createdAt: Date.now(),
  })
}
