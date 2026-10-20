import type { Card, StoryLevel } from '@/db/types'
import { germanText } from './german'
import type { Knowledge } from './reader'

/*
 * A prompt that asks Claude for a story built from a deck's words. The AI
 * connection cannot read cards, so the app writes the words into the prompt;
 * Claude Desktop or Claude Code then saves the story with create_story.
 */

/** Every word of the chosen deck, split by whether you can already read it. */
export interface PromptWords {
  /** Known or being learned, learning first. */
  familiar: string[]
  /** Not studied yet, in deck order. */
  upcoming: string[]
}

const KNOWLEDGE_ORDER: Record<Knowledge, number> = { learning: 0, known: 1, new: 2 }

/**
 * All the words in `cards` (one deck, or all) for the prompt. Only word
 * cards count; sentences, cloze cards and article lists such as
 * "der / die / das" are left out.
 */
export function pickPromptWords(cards: Card[], knowledgeOf: (cardId: string) => Knowledge | undefined): PromptWords {
  const words = cards
    .filter((c) => c.type === 'word' && !c.german.includes('/'))
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((card) => ({ text: germanText(card), knowledge: knowledgeOf(card.id) ?? 'new' }))
  const familiar = words
    .filter((w) => w.knowledge !== 'new')
    .sort((a, b) => KNOWLEDGE_ORDER[a.knowledge] - KNOWLEDGE_ORDER[b.knowledge])
    .map((w) => w.text)
  const upcoming = words.filter((w) => w.knowledge === 'new').map((w) => w.text)
  return { familiar: [...new Set(familiar)], upcoming: [...new Set(upcoming)] }
}

/** With fewer studied words than this, a story cannot be built from them alone, so it uses the whole deck. */
export const ENOUGH_FAMILIAR = 30

export type StoryLength = 'short' | 'medium' | 'long'

/** What a story at each CEFR level looks like. The level sets the length, the grammar and how strictly to keep to my words. */
interface LevelGuide {
  name: string
  words: Record<StoryLength, number>
  paragraphs: string
  plot: string
  /** Rules for any language. */
  rules: string[]
  /** The same rules with German grammar terms, used instead for German. */
  germanRules?: string[]
  /** How to use the words I know. */
  useWords: string
  /** How many of the next new words the story may bring in. */
  newWords: number
  otherWords: string
}

const LEVEL_GUIDE: Record<StoryLevel, LevelGuide> = {
  A1: {
    name: 'beginner',
    words: { short: 60, medium: 90, long: 130 },
    paragraphs: '3 short paragraphs',
    plot: 'Someone wants something, something small happens, and it ends well.',
    rules: [
      'Short sentences of 4 to 8 words, one idea each.',
      'Present tense only.',
      'Main clauses only, linked with simple words for and, but, or and then.',
      'Repeat key words instead of using synonyms.',
    ],
    germanRules: [
      'Short sentences of 4 to 8 words, one idea each.',
      'Present tense only. Modal verbs such as können and möchten are fine.',
      'Main clauses only. Link ideas with und, aber, oder and dann.',
      'Repeat key words instead of using synonyms.',
    ],
    useWords: 'Build the story mostly from the words below.',
    newWords: 3,
    otherWords: 'Any other word must be one of the most common words of the language.',
  },
  A2: {
    name: 'elementary',
    words: { short: 90, medium: 140, long: 200 },
    paragraphs: '3 or 4 paragraphs',
    plot: 'Someone wants something, a small problem comes up, and it is solved.',
    rules: [
      'Sentences of up to 12 words.',
      'Present tense, and the common past tense for what happened.',
      'A few clauses with because, that or if; keep most sentences simple.',
      'A little simple dialogue is fine.',
    ],
    germanRules: [
      'Sentences of up to 12 words.',
      'Present tense, and Perfekt for what happened. War and hatte are fine.',
      'A few clauses with weil, dass or wenn; keep most sentences simple.',
      'A little simple dialogue is fine.',
    ],
    useWords: 'Build the story mostly from the words below.',
    newWords: 5,
    otherWords: 'Other words should be common and simple.',
  },
  B1: {
    name: 'intermediate',
    words: { short: 150, medium: 250, long: 350 },
    paragraphs: '4 or 5 paragraphs',
    plot: 'A real story with a clear beginning, middle and end.',
    rules: [
      'Clear sentences of up to 18 words, with some subordinate and relative clauses.',
      'Tell the story in the past tenses stories use.',
      'Include some dialogue and some feelings and opinions.',
    ],
    germanRules: [
      'Clear sentences of up to 18 words, with some subordinate and relative clauses.',
      'Tell the story in Präteritum; use Perfekt in dialogue.',
      'Include some dialogue and some feelings and opinions.',
    ],
    useWords: 'Use as many of the words below as fit naturally.',
    newWords: 8,
    otherWords: 'Other words should suit level B1.',
  },
  B2: {
    name: 'upper intermediate',
    words: { short: 250, medium: 400, long: 550 },
    paragraphs: '4 to 6 paragraphs',
    plot: 'A real story with some tension and a satisfying end.',
    rules: [
      'Natural, varied sentences, some of them long.',
      'All tenses, the passive and the conditional where they sound natural.',
      'A wider vocabulary, with some common idioms.',
    ],
    germanRules: [
      'Natural, varied sentences, some of them long.',
      'All tenses, the passive and Konjunktiv II where they sound natural.',
      'A wider vocabulary, with some common idioms.',
    ],
    useWords: 'Use as many of the words below as fit naturally.',
    newWords: 12,
    otherWords: 'Other words should suit level B2.',
  },
  C1: {
    name: 'advanced',
    words: { short: 350, medium: 550, long: 750 },
    paragraphs: '5 to 7 paragraphs',
    plot: 'A rich story with characters, tension and a thoughtful end.',
    rules: [
      'Rich, idiomatic language with complex sentences.',
      'Any grammar, including reported speech.',
      'Precise, varied vocabulary, idioms and some figurative language.',
    ],
    germanRules: [
      'Rich, idiomatic German with complex sentences.',
      'Any grammar, including Konjunktiv I in reported speech.',
      'Precise, varied vocabulary, idioms and some figurative language.',
    ],
    useWords: 'Work in the words below where they fit.',
    newWords: 15,
    otherWords: 'Use any other words the story needs.',
  },
  C2: {
    name: 'proficient',
    words: { short: 450, medium: 700, long: 1000 },
    paragraphs: '5 to 8 paragraphs',
    plot: 'A story worth reading for its own sake.',
    rules: ['Write like a skilled native author, in any style or register.', 'Nuanced vocabulary, idioms, wordplay and literary devices are welcome.'],
    useWords: 'Work in the words below where they fit.',
    newWords: 15,
    otherWords: 'Use any other words the story needs.',
  },
}

/** About how many words a story of this level and length has. */
export function storyWordCount(level: StoryLevel, length: StoryLength): number {
  return LEVEL_GUIDE[level].words[length]
}

export interface StoryPromptInput {
  level: StoryLevel
  length: StoryLength
  /** What the story is about; empty for anything. */
  theme: string
  words: PromptWords
  /** The language of the story, and of its translation. German and English when left out. */
  language?: { code: string; name: string; native: string }
}

/**
 * The prompt for Claude, in plain sections. It ends by asking Claude to save
 * the story with the create_story tool, so it shows up in Lernzeit by itself.
 */
export function buildStoryPrompt({ level, length, theme, words, language = { code: 'de', name: 'German', native: 'English' } }: StoryPromptInput): string {
  const guide = LEVEL_GUIDE[level]
  const { name, native } = language
  const rules = (language.code === 'de' && guide.germanRules) || guide.rules
  const lines = [
    `I am learning ${name} at level ${level} (${guide.name}). Please write a story for me to read.`,
    '',
    'THE STORY',
    `- Topic: ${theme.trim() || 'something from everyday life'}.`,
    `- About ${guide.words[length]} words, in ${guide.paragraphs}.`,
    `- ${guide.plot}`,
    `- A short ${name} title.`,
    '',
    `LANGUAGE FOR LEVEL ${level}`,
    ...rules.map((rule) => `- ${rule}`),
    '',
    'MY WORDS',
  ]
  const { familiar, upcoming } = words
  if (familiar.length || upcoming.length) lines.push(`- ${guide.useWords}`)
  if (familiar.length >= ENOUGH_FAMILIAR) {
    // Enough studied words for a whole story: keep to them and bring in only a few new ones.
    lines.push(`- Words I know or am learning: ${familiar.join(', ')}.`)
    if (upcoming.length) lines.push(`- You may also use up to ${guide.newWords} of these new words: ${upcoming.join(', ')}.`)
  } else {
    // Too few studied words for a story: use the whole deck, and the studied words as often as possible.
    if (familiar.length) lines.push(`- Words I know or am learning, to use as often as you can: ${familiar.join(', ')}.`)
    if (upcoming.length) lines.push(`- ${familiar.length ? 'More words' : 'Words'} from my deck: ${upcoming.join(', ')}.`)
  }
  lines.push(
    `- ${guide.otherWords} Names are fine.`,
    '',
    'BEFORE YOU SAVE',
    `- Check that every sentence is correct, natural ${name}.`,
    `- Write a translation into ${native} that matches the ${name} paragraph by paragraph.`,
    '',
    'SAVE IT IN LERNZEIT',
    'Save the story with the Lernzeit create_story tool:',
    `- title: the ${name} title`,
    `- level: ${level}`,
    `- text: the ${name} story, with an empty line between paragraphs`,
    `- translation: the ${native} translation, with the same paragraphs`,
    'Then show me the story and tell me it is saved. If the tool is not available, tell me to turn on Settings → AI connection in Lernzeit.',
  )
  return lines.join('\n')
}
