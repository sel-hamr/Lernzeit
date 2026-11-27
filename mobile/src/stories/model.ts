/*
 * What the Stories screens show, from core's reader rules (as src/features/stories on the web):
 * every card as a form to find in a text with how well it is known, a story's coverage by your
 * decks, how hard it reads now, and the lines on its tile.
 */
import { alignTranslation, annotate, buildLexicon, cardKnowledge, countWords, coverage, readingMinutes, splitParagraphs, wordStatus, type Coverage, type Knowledge, type Lexicon, type Piece, type WordStatus } from '@lernzeit/core/reader'
import { count } from '@lernzeit/core/text'
import type { Card, CardReview, Gender, Story } from '@lernzeit/core/types'

export interface Vocabulary {
  lexicon: Lexicon
  cards: Map<string, Card>
  knowledge: Map<string, Knowledge>
}

export function buildVocabulary(cards: Card[], reviews: Pick<CardReview, 'cardId' | 'state' | 'fsrs'>[]): Vocabulary {
  const byCard = new Map<string, Pick<CardReview, 'state' | 'fsrs'>[]>()
  for (const r of reviews) byCard.set(r.cardId, [...(byCard.get(r.cardId) ?? []), r])
  const knowledge = new Map<string, Knowledge>()
  for (const [cardId, list] of byCard) knowledge.set(cardId, cardKnowledge(list))
  return { lexicon: buildLexicon(cards), cards: new Map(cards.map((c) => [c.id, c])), knowledge }
}

export const statusOf = (piece: Piece, vocabulary: Vocabulary): WordStatus => wordStatus(piece.cardIds, (id) => vocabulary.knowledge.get(id))

/** The gender every noun card behind a word agrees on; none when they disagree or are not nouns. */
export function genderOf(piece: Piece, vocabulary: Vocabulary): Gender | undefined {
  const genders = new Set(piece.cardIds.map((id) => vocabulary.cards.get(id)?.gender))
  return genders.size === 1 ? [...genders][0] : undefined
}

export interface AnnotatedStory {
  paragraphs: { text: string; pieces: Piece[] }[]
  /** One per paragraph, or null when the translation does not line up. */
  translation: string[] | null
  coverage: Coverage
}

export function annotateStory(story: Pick<Story, 'text' | 'translation'>, vocabulary: Vocabulary): AnnotatedStory {
  const paragraphs = splitParagraphs(story.text).map((text) => ({ text, pieces: annotate(text, vocabulary.lexicon) }))
  return {
    paragraphs,
    translation: alignTranslation(story.text, story.translation),
    coverage: coverage(
      paragraphs.map((p) => p.pieces),
      (piece) => statusOf(piece, vocabulary),
    ),
  }
}

export const percent = (part: number, total: number): number => (total ? Math.round((part / total) * 100) : 0)

export type DifficultyTone = 'lime' | 'accent' | 'neutral' | 'danger'

/** How hard the story is for you now: easy from about 95 % familiar words, good practice from 85 %. */
export function difficulty(c: Coverage): { label: string; tone: DifficultyTone } | null {
  if (!c.words) return null
  const familiar = (c.known + c.learning) / c.words
  if (familiar >= 0.95) return { label: 'Easy read', tone: 'lime' }
  if (familiar >= 0.85) return { label: 'Good challenge', tone: 'accent' }
  // Names are never in a deck, so this bar sits a little lower.
  if ((c.words - c.unknown) / c.words >= 0.8) return { label: 'Study its words first', tone: 'neutral' }
  return { label: 'Hard for now', tone: 'danger' }
}

export const readLabel = (readCount: number): string | undefined => (readCount <= 0 ? undefined : readCount === 1 ? 'Read once' : `Read ${readCount} times`)

/** The lines on a story's tile. */
export function storyTile(story: Story, vocabulary: Vocabulary) {
  const { coverage: c, paragraphs } = annotateStory(story, vocabulary)
  return {
    coverage: c,
    preview: paragraphs[0]?.text ?? '',
    meta: `${count(c.words, 'word')} · ${readingMinutes(countWords(story.text))} min`,
    inDecks: `${percent(c.words - c.unknown, c.words)}% in your decks`,
    difficulty: difficulty(c),
    read: readLabel(story.readCount),
    /** The cover's big letter. */
    initial: (story.title.trim()[0] ?? '?').toLocaleUpperCase('de-DE'),
  }
}

/** Newest first, as on the web. */
export const sortStories = (stories: Story[]): Story[] => [...stories].sort((a, b) => b.createdAt - a.createdAt)

/** The coverage bar's parts, in order. */
export const COVERAGE_PARTS: { status: WordStatus; label: string }[] = [
  { status: 'known', label: 'Known' },
  { status: 'learning', label: 'Learning' },
  { status: 'new', label: 'New' },
  { status: 'unknown', label: 'Not in your decks' },
]
