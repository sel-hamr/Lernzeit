/**
 * The German pack: everything Lernzeit installs.
 *
 * - `de/info.ts` exports `info`, a PackInfo. It is small and always loaded.
 * - `de/content.ts` exports `content`, a PackContent. It is loaded only when
 *   a level is installed, so the pack stays out of the main bundle.
 */
import type { CardPack, CardPackCard } from '@/data/io'
import type { StarterTopic } from '@/data/grammar'
import type { StarterQuestion } from '@/data/questions'
import type { StarterStory } from '@/data/stories'
import type { StoryLevel } from '@/db/types'
import { info } from './de/info'
import type { PackContent } from './types'

export type * from './types'

export const PACK = info

export const LEVELS: readonly StoryLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']

export async function loadPack(): Promise<PackContent> {
  return (await import('./de/content')).content
}

/** How much one level holds, for choosing it. */
export interface LevelSummary {
  words: number
  sentences: number
  stories: number
  questions: number
  grammar: number
}

export function levelSummary(content: PackContent, level: StoryLevel): LevelSummary {
  const cards = content.cards.filter((c) => c.level === level)
  return {
    words: cards.filter((c) => (c.type ?? 'word') === 'word').length,
    sentences: cards.filter((c) => c.type === 'sentence' || c.type === 'cloze').length,
    stories: content.stories.filter((s) => s.level === level).length,
    questions: content.questions.filter((q) => q.level === level).length,
    grammar: content.grammar.filter((t) => t.level === level).length,
  }
}

/** The pack's levels, in the shapes the installers take. */
export interface PackLevels {
  cards: CardPack
  /** Card id -> SVG drawing. */
  art: Map<string, string>
  stories: StarterStory[]
  questions: StarterQuestion[]
  topics: StarterTopic[]
}

/** Picks these levels of the pack. */
export function packLevels(content: PackContent, levels: readonly StoryLevel[]): PackLevels {
  const wanted = new Set(levels)
  const cards = content.cards.filter((c) => wanted.has(c.level))
  const used = new Set(cards.map((c) => c.deckId))
  return {
    cards: {
      format: 'lernzeit-cards',
      version: 1,
      decks: content.decks.filter((d) => used.has(d.id)).map((d) => ({ ...d, topic: PACK.name })),
      cards: cards.map(
        (c): CardPackCard => ({
          id: c.id,
          deckId: c.deckId,
          type: c.type,
          english: c.meaning,
          german: c.text,
          gender: c.gender,
          plural: c.plural,
          verbForms: c.verbForms,
          conjugation: c.conjugation,
          partOfSpeech: c.partOfSpeech,
          exampleDe: c.example,
          exampleEn: c.exampleMeaning,
          tags: c.tags,
          emoji: c.emoji,
          imageQuery: c.imageQuery,
        }),
      ),
    },
    art: new Map(cards.flatMap((c) => (c.art ? [[c.id, c.art] as const] : []))),
    stories: content.stories
      .filter((s) => wanted.has(s.level))
      .map((s) => ({ id: s.id, title: s.title, text: s.text, translation: s.translation, level: s.level, tags: s.tags ?? [], topic: PACK.name })),
    questions: content.questions
      .filter((q) => wanted.has(q.level))
      .map((q) => ({ id: q.id, set: q.set, question: q.question, english: q.meaning, suggested: q.suggested, words: q.words, level: q.level, tags: q.tags ?? [] })),
    topics: content.grammar
      .filter((t) => wanted.has(t.level))
      .map((t) => ({
        id: t.id,
        title: t.title,
        english: t.meaning,
        group: t.group,
        level: t.level,
        summary: t.summary,
        rule: t.rule,
        examples: t.examples.map((e) => ({ de: e.text, ...(e.meaning ? { en: e.meaning } : {}) })),
        exercises: t.exercises.map((e) => ({ id: e.id, text: e.text, ...(e.meaning ? { en: e.meaning } : {}), ...(e.why ? { why: e.why } : {}) })),
        ...(t.drill ? { drill: t.drill } : {}),
      })),
  }
}
