/*
 * Helpers that keep a pack's content short to write: rows instead of objects,
 * and ids made from the language code and a number. Ids must never change:
 * installing again skips the ids it has, and grammar scores are kept by
 * exercise id. Add new entries with new numbers.
 */
import type { StoryLevel } from '@/db/types'
import type { PackCard, PackExercise, PackGrammarTopic, PackQuestion, PackStory, Text } from './types'

const pad = (n: number, width: number) => String(n).padStart(width, '0')

/** [n, word, meaning, part of speech, emoji, example, its meaning] */
export type WordRow = [n: number, text: string, meaning: Text, partOfSpeech: string, emoji?: string, example?: string, exampleMeaning?: Text]

/** Word cards of one level. `n` becomes the id: 7 → "fr-0007". */
export function words(code: string, deckId: string, level: StoryLevel, rows: WordRow[]): PackCard[] {
  return rows.map(([n, text, meaning, partOfSpeech, emoji, example, exampleMeaning]) => ({
    id: `${code}-${pad(n, 4)}`,
    deckId,
    level,
    type: 'word',
    text,
    meaning,
    partOfSpeech,
    tags: [level, partOfSpeech],
    ...(emoji ? { emoji } : {}),
    ...(example ? { example } : {}),
    ...(exampleMeaning ? { exampleMeaning } : {}),
  }))
}

/** [n, sentence, meaning]. A sentence with {{ }} becomes a cloze card. */
export type SentenceRow = [n: number, text: string, meaning: Text]

/** Sentence cards of one level, numbered with the words: 501 → "fr-0501". */
export function sentences(code: string, deckId: string, level: StoryLevel, rows: SentenceRow[]): PackCard[] {
  return rows.map(([n, text, meaning]) => ({
    id: `${code}-${pad(n, 4)}`,
    deckId,
    level,
    type: text.includes('{{') ? 'cloze' : 'sentence',
    text,
    meaning,
    tags: [level, 'sentence'],
  }))
}

/** A story; `n` becomes its id: 3 → "fr-story-03". */
export function story(code: string, n: number, level: StoryLevel, title: string, text: string, translation: Text, theme: string): PackStory {
  return { id: `${code}-story-${pad(n, 2)}`, level, title, text, translation, tags: ['starter', theme] }
}

/** [n, question, meaning, suggested answer, useful words] */
export type QuestionRow = [n: number, question: string, meaning: Text, suggested: string, words: string[]]

/** Questions of one set; `n` becomes the id: 4 → "fr-question-04". */
export function questionSet(code: string, set: string, level: StoryLevel, rows: QuestionRow[]): PackQuestion[] {
  return rows.map(([n, question, meaning, suggested, words]) => ({
    id: `${code}-question-${pad(n, 2)}`,
    level,
    set,
    question,
    meaning,
    suggested,
    words,
    tags: ['starter'],
  }))
}

/** [exercise, its meaning, why]. See GrammarExercise for how an exercise is written. */
export type ExerciseRow = [text: string, meaning?: Text, why?: Text]

export interface TopicMeta {
  level: StoryLevel
  title: string
  meaning: Text
  group: string
  summary: Text
  rule: Text
}

/** A grammar topic; `n` becomes its id, "fr-grammar-03", and each exercise's adds its place, "fr-grammar-03-02". */
export function topic(code: string, n: number, meta: TopicMeta, examples: [text: string, meaning?: Text][], exercises: ExerciseRow[]): PackGrammarTopic {
  const id = `${code}-grammar-${pad(n, 2)}`
  return {
    id,
    ...meta,
    examples: examples.map(([text, meaning]) => (meaning ? { text, meaning } : { text })),
    exercises: exercises.map(([text, meaning, why], i): PackExercise => ({
      id: `${id}-${pad(i + 1, 2)}`,
      text,
      ...(meaning ? { meaning } : {}),
      ...(why ? { why } : {}),
    })),
  }
}

/** Lines of a rule, joined the way the rule format reads them. */
export const lines = (...parts: string[]) => parts.join('\n')
