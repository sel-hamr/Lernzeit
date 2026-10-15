import { db, newId, type LernzeitDB } from '@/db/db'
import type { StarterStory } from '@/db/starter/stories'
import type { Deck, Story, StoryLevel, Topic } from '@/db/types'

/** Cards added from the reader get this tag, so they are easy to find in the Library. */
export const STORY_TAG = 'story'

export const STORY_LEVELS: StoryLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']

export type StoryInput = Pick<Story, 'title' | 'text' | 'translation' | 'level' | 'topicId' | 'tags'>

/** "a2 " -> "A2"; anything else -> undefined. */
export function parseLevel(value: string | undefined): StoryLevel | undefined {
  const level = value?.trim().toUpperCase()
  return STORY_LEVELS.find((l) => l === level)
}

/** Reading time goes to the topic of the first deck that has one (German, out of the box), else the first topic. */
export function pickStoryTopic(decks: Pick<Deck, 'topicId'>[], topics: Pick<Topic, 'id' | 'archived'>[]): string | undefined {
  const active = topics.filter((t) => !t.archived)
  return decks.map((d) => d.topicId).find((id) => active.some((t) => t.id === id)) ?? active[0]?.id
}

export async function defaultStoryTopicId(database: LernzeitDB = db): Promise<string | undefined> {
  const [decks, topics] = await Promise.all([database.decks.orderBy('order').toArray(), database.topics.orderBy('order').toArray()])
  return pickStoryTopic(decks, topics)
}

function normalizeStory(input: StoryInput): StoryInput {
  return {
    title: input.title.trim(),
    text: input.text.trim(),
    translation: input.translation?.trim() || undefined,
    level: parseLevel(input.level),
    topicId: input.topicId || undefined,
    tags: [...new Set(input.tags.map((t) => t.trim()).filter(Boolean))],
  }
}

export async function saveStory(input: StoryInput, existingId?: string, database: LernzeitDB = db): Promise<Story> {
  const data = normalizeStory(input)
  if (!data.title) throw new Error('A story needs a title')
  if (!data.text) throw new Error('A story needs some German text')
  return database.transaction('rw', database.stories, async () => {
    const now = Date.now()
    const previous = existingId ? await database.stories.get(existingId) : undefined
    const story: Story = {
      ...previous,
      ...data,
      id: previous?.id ?? newId(),
      createdAt: previous?.createdAt ?? now,
      updatedAt: now,
      readCount: previous?.readCount ?? 0,
    }
    await database.stories.put(story)
    return story
  })
}

/** Deletes a story. Reading time already saved stays in History. */
export async function deleteStory(id: string, database: LernzeitDB = db) {
  await database.stories.delete(id)
}

export async function markStoryOpened(id: string, database: LernzeitDB = db) {
  await database.stories.update(id, { openedAt: Date.now() })
}

export async function markStoryRead(id: string, database: LernzeitDB = db) {
  await database.stories.where('id').equals(id).modify((story) => {
    story.readCount += 1
  })
}

/** The bundled starter stories, loaded on demand so they stay out of the main bundle. */
export async function loadStarterStories(): Promise<StarterStory[]> {
  const { STARTER_STORIES } = await import('@/db/starter/stories')
  return STARTER_STORIES
}

/**
 * Adds the starter stories that are missing. Returns how many were added.
 * Inside another transaction, pass `stories` loaded beforehand: a transaction
 * cannot wait for a module to load.
 */
export async function installStarterStories(database: LernzeitDB = db, stories?: StarterStory[]): Promise<number> {
  const starter = stories ?? (await loadStarterStories())
  return database.transaction('rw', [database.stories, database.topics], async () => {
    const present = new Set((await database.stories.bulkGet(starter.map((s) => s.id))).filter((s) => !!s).map((s) => s.id))
    const topics = await database.topics.toArray()
    const now = Date.now()
    const fresh: Story[] = starter.filter((s) => !present.has(s.id)).map(({ topic, ...story }, i) => ({
      ...story,
      topicId: topics.find((t) => !t.archived && t.name.toLowerCase() === topic.toLowerCase())?.id,
      // The Stories page shows the newest first, so later entries get earlier times to keep the list's order.
      createdAt: now - i,
      updatedAt: now - i,
      readCount: 0,
    }))
    await database.stories.bulkAdd(fresh)
    return fresh.length
  })
}
