import { db, newId, type LernzeitDB } from '@/db/db'
import type { Deck, Story, StoryLevel, Topic } from '@/db/types'

/** Cards added from the reader get this tag, so they are easy to find in the Library. */
export const STORY_TAG = 'story'

export const STORY_LEVELS: StoryLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']

/** A story from a language pack, as it is installed. */
export interface StarterStory extends Pick<Story, 'id' | 'title' | 'text' | 'translation' | 'level' | 'tags'> {
  /** Topic name; reading time counts toward it. */
  topic: string
}

export type StoryInput = Pick<Story, 'title' | 'text' | 'translation' | 'level' | 'topicId' | 'tags'>

/** "a2 " -> "A2"; anything else -> undefined. */
export function parseLevel(value: string | undefined): StoryLevel | undefined {
  const level = value?.trim().toUpperCase()
  return STORY_LEVELS.find((l) => l === level)
}

/** Reading time goes to the topic of the first deck that has one (the language's, out of the box), else the first topic. */
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
  if (!data.text) throw new Error('A story needs some text')
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

/** Adds the starter stories that are missing. Returns how many were added. */
export async function installStarterStories(starter: StarterStory[], database: LernzeitDB = db): Promise<number> {
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
