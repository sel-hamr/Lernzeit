import type { CardPack } from '@/data/io'
import type { StoryLevel } from '@/db/types'
import type { PackCard, PackContent } from '../types'
import { ART, ART_FOR_CARD } from './art'
import { STARTER_TOPICS } from './grammar'
import { withMyWords } from './my-words'
import { STARTER_QUESTIONS } from './questions'
import { STARTER_STORIES } from './stories'
import words from './words.json'

const LEVEL_TAG = /^[ABC][12]$/

/** The German pack keeps its first format (a card pack, stories, questions, topics) and is read into the pack shape here. */
const pack = withMyWords(words as CardPack)

export const content: PackContent = {
  decks: pack.decks.map(({ id, name, directions }) => ({ id, name, directions })),
  cards: pack.cards.map(
    (c): PackCard => ({
      id: c.id!,
      deckId: c.deckId,
      // Every card is tagged with its level; the few without one are basics.
      level: (c.tags?.find((t) => LEVEL_TAG.test(t)) as StoryLevel | undefined) ?? 'A1',
      type: c.type,
      text: c.german,
      meaning: c.english,
      gender: c.gender ?? undefined,
      plural: c.plural ?? undefined,
      verbForms: c.verbForms ?? undefined,
      conjugation: c.conjugation ?? undefined,
      partOfSpeech: c.partOfSpeech ?? undefined,
      example: c.exampleDe ?? undefined,
      exampleMeaning: c.exampleEn ?? undefined,
      tags: c.tags,
      emoji: c.emoji ?? undefined,
      imageQuery: c.imageQuery ?? undefined,
      art: ART_FOR_CARD[c.id!] && ART[ART_FOR_CARD[c.id!]],
    }),
  ),
  stories: STARTER_STORIES.map(({ id, level, title, text, translation, tags }) => ({ id, level: level ?? 'A1', title, text, translation, tags })),
  questions: STARTER_QUESTIONS.map(({ id, level, set, question, english, suggested, words, tags }) => ({
    id, level: level ?? 'A1', set, question, meaning: english, suggested, words, tags,
  })),
  grammar: STARTER_TOPICS.map((t) => ({
    id: t.id,
    level: t.level ?? 'A1',
    title: t.title,
    meaning: t.english,
    group: t.group,
    summary: t.summary,
    rule: t.rule,
    examples: t.examples.map((e) => ({ text: e.de, meaning: e.en })),
    exercises: t.exercises.map((e) => ({ id: e.id, text: e.text, meaning: e.en, why: e.why })),
    drill: t.drill,
  })),
}
