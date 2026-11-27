import { db, newId, type LernzeitDB } from '@/db/db'
import type { Story } from '@lernzeit/core/types'
import { normalizeStory, pickStoryTopic, type StoryInput } from '@lernzeit/core/stories'

/** Cards added from the reader get this tag, so they are easy to find in the Library. */
export const STORY_TAG = 'story'

/** A story from the German pack, as it is installed. */
export interface StarterStory extends Pick<Story, 'id' | 'title' | 'text' | 'translation' | 'level' | 'tags'> {
  /** Topic name; reading time counts toward it. */
  topic: string
}

export { parseLevel, pickStoryTopic, STORY_LEVELS, type StoryInput } from '@lernzeit/core/stories'

export async function defaultStoryTopicId(database: LernzeitDB = db): Promise<string | undefined> {
  const [decks, topics] = await Promise.all([database.decks.orderBy('order').toArray(), database.topics.orderBy('order').toArray()])
  return pickStoryTopic(decks, topics)
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
