import { db, newId, type LernzeitDB } from '@/db/db'
import type { ExerciseStat, GrammarTopic } from '@/db/types'
import { nextExerciseStat } from '@/lib/grammar'
import { parseLevel } from './stories'

/** Topics added without a section go here. */
export const DEFAULT_GROUP = 'My topics'

/** A grammar topic from a language pack, as it is installed. */
export type StarterTopic = Omit<GrammarTopic, 'createdAt' | 'updatedAt'>

export type TopicInput = Pick<GrammarTopic, 'title' | 'english' | 'group' | 'level' | 'summary' | 'rule' | 'examples' | 'exercises' | 'drill'>

function normalizeTopic(input: TopicInput): TopicInput {
  const clean = (s?: string) => s?.trim() || undefined
  return {
    title: input.title.trim().replace(/\s+/g, ' '),
    english: clean(input.english),
    group: input.group.trim().replace(/\s+/g, ' ') || DEFAULT_GROUP,
    level: parseLevel(input.level),
    summary: clean(input.summary),
    rule: input.rule.trim(),
    examples: input.examples.flatMap(({ de, en }) => (de.trim() ? [en?.trim() ? { de: de.trim(), en: en.trim() } : { de: de.trim() }] : [])),
    exercises: input.exercises.flatMap(({ id, text, en, why }) =>
      text.trim() ? [{ id, text: text.trim(), ...(en?.trim() ? { en: en.trim() } : {}), ...(why?.trim() ? { why: why.trim() } : {}) }] : [],
    ),
    drill: input.drill,
  }
}

/** Saves a topic. Exercises that were removed take their scores with them. */
export async function saveTopic(input: TopicInput, existingId?: string, database: LernzeitDB = db): Promise<GrammarTopic> {
  const data = normalizeTopic(input)
  if (!data.title) throw new Error('A topic needs a title')
  return database.transaction('rw', [database.grammarTopics, database.exerciseStats], async () => {
    const now = Date.now()
    const previous = existingId ? await database.grammarTopics.get(existingId) : undefined
    const topic: GrammarTopic = { ...data, id: previous?.id ?? newId(), createdAt: previous?.createdAt ?? now, updatedAt: now }
    if (!topic.drill) delete topic.drill
    await database.grammarTopics.put(topic)
    if (previous) {
      const kept = new Set(topic.exercises.map((e) => e.id))
      const gone = previous.exercises.filter((e) => !kept.has(e.id)).map((e) => e.id)
      await database.exerciseStats.bulkDelete(gone)
    }
    return topic
  })
}

/** Deletes a topic with the scores of its exercises. */
export async function deleteTopic(id: string, database: LernzeitDB = db) {
  await database.transaction('rw', [database.grammarTopics, database.exerciseStats], async () => {
    await database.grammarTopics.delete(id)
    await database.exerciseStats.where('topicId').equals(id).delete()
  })
}

/** Saves one answer to an exercise's stat. */
export async function saveExerciseAnswer(topicId: string, exerciseId: string, correct: boolean, database: LernzeitDB = db): Promise<ExerciseStat> {
  return database.transaction('rw', database.exerciseStats, async () => {
    const stat = nextExerciseStat(await database.exerciseStats.get(exerciseId), topicId, exerciseId, correct, Date.now())
    await database.exerciseStats.put(stat)
    return stat
  })
}

/** Adds the starter topics that are missing. Returns how many were added. */
export async function installStarterTopics(starter: StarterTopic[], database: LernzeitDB = db): Promise<number> {
  return database.transaction('rw', database.grammarTopics, async () => {
    const present = new Set((await database.grammarTopics.bulkGet(starter.map((t) => t.id))).filter((t) => !!t).map((t) => t.id))
    const now = Date.now()
    // The page lists topics oldest first, so later entries get later times to keep the file's order.
    const fresh: GrammarTopic[] = starter.filter((t) => !present.has(t.id)).map((t, i) => ({ ...t, createdAt: now + i, updatedAt: now + i }))
    await database.grammarTopics.bulkAdd(fresh)
    return fresh.length
  })
}

/** Bump when a pack's grammar topics change, so every install picks up the new version once. */
export const STARTER_GRAMMAR_VERSION = 2

const CONTENT: (keyof StarterTopic)[] = ['title', 'english', 'group', 'level', 'summary', 'rule', 'examples', 'exercises', 'drill']

/**
 * Brings the starter topics you have not edited up to the app's version.
 * Exercise ids stay with their exercise, so scores are kept; exercises that
 * were removed take their scores with them. A topic you edited is left alone.
 * Returns how many topics were updated.
 */
export async function refreshStarterTopics(database: LernzeitDB, topics: StarterTopic[]): Promise<number> {
  return database.transaction('rw', [database.grammarTopics, database.exerciseStats], async () => {
    const stored = await database.grammarTopics.bulkGet(topics.map((t) => t.id))
    let updated = 0
    for (const [i, current] of stored.entries()) {
      const starter = topics[i]
      // Installed topics start with updatedAt equal to createdAt; saving in the editor moves it on.
      if (!current || current.updatedAt !== current.createdAt) continue
      if (CONTENT.every((field) => JSON.stringify(current[field]) === JSON.stringify(starter[field]))) continue
      await database.grammarTopics.put({ ...starter, createdAt: current.createdAt, updatedAt: current.createdAt })
      const kept = new Set(starter.exercises.map((e) => e.id))
      await database.exerciseStats.bulkDelete(current.exercises.filter((e) => !kept.has(e.id)).map((e) => e.id))
      updated++
    }
    return updated
  })
}
