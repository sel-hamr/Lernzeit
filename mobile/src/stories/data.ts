/*
 * Stories over the local library, with the web's rules (src/data/stories.ts): saving keeps a
 * story's notes and read count, opening and finishing are not edits. Words added from the reader
 * are cards tagged incomplete and story.
 */
import { normalizeStory, pickStoryTopic, type StoryInput } from '@lernzeit/core/stories'
import type { Card, Deck, Story, Topic } from '@lernzeit/core/types'
import { useMemo } from 'react'
import { createDeck, INCOMPLETE_TAG, saveCard, useCards, useReviews } from '../cards/data'
import { newId } from '../data/ids'
import type { LocalLibrary } from '../store/library'
import { useLiveQuery } from '../store/live'
import { buildVocabulary, sortStories, type Vocabulary } from './model'

export const STORY_TAG = 'story'

export const useStories = (): Story[] => useLiveQuery(['stories'], (l) => sortStories(l.list<Story>('stories')), [])
export const useStory = (id: string): Story | undefined => useLiveQuery(['stories'], (l) => l.get<Story>('stories', id), [id])

export function useVocabulary(): Vocabulary {
  const cards = useCards()
  const reviews = useReviews()
  return useMemo(() => buildVocabulary(cards, reviews), [cards, reviews])
}

/** Reading (and grammar, question) time goes to the topic of the first deck that has one, else the first topic. */
export function defaultStoryTopicId(library: LocalLibrary): string | undefined {
  const decks = library.list<Deck>('decks').sort((a, b) => a.order - b.order)
  const topics = library.list<Topic>('topics').sort((a, b) => a.order - b.order)
  return pickStoryTopic(decks, topics)
}

export function saveStory(library: LocalLibrary, input: StoryInput, existingId?: string): Story {
  const data = normalizeStory(input)
  if (!data.title) throw new Error('A story needs a title')
  if (!data.text) throw new Error('A story needs some text')
  return library.write(() => {
    const now = Date.now()
    const previous = existingId ? library.get<Story>('stories', existingId) : undefined
    const story: Story = { ...previous, ...data, id: previous?.id ?? newId(), createdAt: previous?.createdAt ?? now, updatedAt: now, readCount: previous?.readCount ?? 0 }
    library.put('stories', story)
    return story
  })
}

export const deleteStory = (library: LocalLibrary, id: string) => library.remove('stories', id)

function patchStory(library: LocalLibrary, id: string, patch: (story: Story) => Partial<Story>) {
  library.write(() => {
    const story = library.get<Story>('stories', id)
    if (story) library.put('stories', { ...story, ...patch(story) })
  })
}

export const markStoryOpened = (library: LocalLibrary, id: string, now = Date.now()) => patchStory(library, id, () => ({ openedAt: now }))
export const markStoryRead = (library: LocalLibrary, id: string) => patchStory(library, id, (s) => ({ readCount: s.readCount + 1 }))

/** Adds a word from a story as a card, with the story's sentence as its example. With no deck yet, one is made. */
export function addStoryWord(library: LocalLibrary, input: { german: string; english: string; deckId?: string; sentence: string; partOfSpeech?: string }): Card {
  return library.write(() => {
    const decks = library.list<Deck>('decks').sort((a, b) => a.order - b.order)
    const deckId = decks.find((d) => d.id === input.deckId)?.id ?? decks[0]?.id ?? createDeck(library, { name: 'German words', topicId: library.list<Topic>('topics')[0]?.id }).id
    return saveCard(library, { deckId, type: 'word', english: input.english, german: input.german, partOfSpeech: input.partOfSpeech, exampleDe: input.sentence, tags: [INCOMPLETE_TAG, STORY_TAG] }, { kind: 'keep' })
  })
}
