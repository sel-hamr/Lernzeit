/**
 * The language packs: one folder per language you can learn, found by its
 * files, so adding a folder (`npm run lang:add`) is all it takes.
 *
 * - `<code>/info.ts` exports `info`, a PackInfo. It is small and always loaded.
 * - `<code>/content.ts` exports `content`, a PackContent. It is loaded only
 *   when a level is installed, so packs stay out of the main bundle.
 */
import type { CardPack, CardPackCard } from '@/data/io'
import type { StarterTopic } from '@/data/grammar'
import type { StarterQuestion } from '@/data/questions'
import type { StarterStory } from '@/data/stories'
import type { StoryLevel } from '@/db/types'
import type { LangCode, PackContent, PackInfo, Text } from './types'

export type * from './types'

const infos = import.meta.glob<PackInfo>('./*/info.ts', { eager: true, import: 'info' })
const contents = import.meta.glob<PackContent>('./*/content.ts', { import: 'content' })

/** Every language you can learn, by name. */
export const PACKS: readonly PackInfo[] = Object.values(infos).sort((a, b) => a.name.localeCompare(b.name))

export const LEVELS: readonly StoryLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']

export function packInfo(code: LangCode): PackInfo | undefined {
  return PACKS.find((p) => p.code === code)
}

export async function loadPack(code: LangCode): Promise<PackContent> {
  const load = contents[`./${code}/content.ts`]
  if (!load) throw new Error(`There is no ${languageName(code)} pack`)
  return load()
}

function displayName(code: LangCode, locale: string): string | undefined {
  try {
    return new Intl.DisplayNames([locale], { type: 'language' }).of(code)
  } catch {
    return undefined
  }
}

/** "French", also for a native language that has no pack of its own. */
export function languageName(code: LangCode): string {
  return packInfo(code)?.name ?? displayName(code, 'en') ?? code
}

/** "Français": the name in the language itself. */
export function endonym(code: LangCode): string {
  return packInfo(code)?.endonym ?? displayName(code, code) ?? code
}

/** The tag the browser voice speaks: "fr-FR". */
export function speechLang(code: LangCode): string {
  return packInfo(code)?.speech ?? code
}

const RTL = new Set(['ar', 'fa', 'he', 'ur'])

/** Written right to left. Native languages without a pack count too. */
export function isRtl(code: LangCode): boolean {
  return packInfo(code)?.rtl ?? RTL.has(code)
}

/** Every native language some pack is written for, by name. */
export function allNatives(): LangCode[] {
  return [...new Set(PACKS.flatMap((p) => p.natives))].sort((a, b) => languageName(a).localeCompare(languageName(b)))
}

/** The text in this native language. A plain string is English. */
export function localize(text: Text | undefined, native: LangCode): string | undefined {
  if (text === undefined) return undefined
  if (typeof text === 'string') return text
  return text[native] ?? text.en ?? Object.values(text).find(Boolean)
}

/** True when the text is written in this native language, without falling back to another. */
export function hasText(text: Text, native: LangCode): boolean {
  return typeof text === 'string' ? native === 'en' && !!text.trim() : !!text[native]?.trim()
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

/** A pack's levels in one native language, in the shapes the installers take. */
export interface LocalizedPack {
  cards: CardPack
  /** Card id -> SVG drawing. */
  art: Map<string, string>
  stories: StarterStory[]
  questions: StarterQuestion[]
  topics: StarterTopic[]
}

/** Picks these levels and writes every meaning and explanation in the native language. */
export function localizePack(info: PackInfo, content: PackContent, native: LangCode, levels: readonly StoryLevel[]): LocalizedPack {
  const wanted = new Set(levels)
  const text = (t: Text | undefined) => localize(t, native)
  const cards = content.cards.filter((c) => wanted.has(c.level))
  const used = new Set(cards.map((c) => c.deckId))
  return {
    cards: {
      format: 'lernzeit-cards',
      version: 1,
      decks: content.decks.filter((d) => used.has(d.id)).map((d) => ({ ...d, topic: info.name })),
      cards: cards.map(
        (c): CardPackCard => ({
          id: c.id,
          deckId: c.deckId,
          type: c.type,
          english: text(c.meaning) ?? '',
          german: c.text,
          gender: c.gender,
          plural: c.plural,
          verbForms: c.verbForms,
          conjugation: c.conjugation,
          partOfSpeech: c.partOfSpeech,
          exampleDe: c.example,
          exampleEn: text(c.exampleMeaning),
          tags: c.tags,
          emoji: c.emoji,
          imageQuery: c.imageQuery,
        }),
      ),
    },
    art: new Map(cards.flatMap((c) => (c.art ? [[c.id, c.art] as const] : []))),
    stories: content.stories
      .filter((s) => wanted.has(s.level))
      .map((s) => ({ id: s.id, title: s.title, text: s.text, translation: text(s.translation), level: s.level, tags: s.tags ?? [], topic: info.name })),
    questions: content.questions
      .filter((q) => wanted.has(q.level))
      .map((q) => ({ id: q.id, set: q.set, question: q.question, english: text(q.meaning), suggested: q.suggested, words: q.words, level: q.level, tags: q.tags ?? [] })),
    topics: content.grammar
      .filter((t) => wanted.has(t.level))
      .map((t) => ({
        id: t.id,
        title: t.title,
        english: text(t.meaning),
        group: t.group,
        level: t.level,
        summary: text(t.summary),
        rule: text(t.rule) ?? '',
        examples: t.examples.map((e) => ({ de: e.text, ...(e.meaning ? { en: text(e.meaning) } : {}) })),
        exercises: t.exercises.map((e) => ({ id: e.id, text: e.text, ...(e.meaning ? { en: text(e.meaning) } : {}), ...(e.why ? { why: text(e.why) } : {}) })),
        ...(t.drill ? { drill: t.drill } : {}),
      })),
  }
}
