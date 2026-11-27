/*
 * How a story is saved: the story editor, the starter install and the AI's
 * create_story share these rules.
 */
import type { Deck, Story, StoryLevel, Topic } from './types'

export const STORY_LEVELS: StoryLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']

export type StoryInput = Pick<Story, 'title' | 'text' | 'translation' | 'level' | 'topicId' | 'tags' | 'words'>

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

/** A story's fields as they are saved: trimmed, a known level, tags without blanks or repeats. */
export function normalizeStory(input: StoryInput): StoryInput {
  return {
    title: input.title.trim(),
    text: input.text.trim(),
    translation: input.translation?.trim() || undefined,
    level: parseLevel(input.level),
    topicId: input.topicId || undefined,
    tags: [...new Set(input.tags.map((t) => t.trim()).filter(Boolean))],
    // Left out when there are none, so saving from the editor keeps the story's notes.
    ...(input.words?.length ? { words: input.words } : {}),
  }
}
