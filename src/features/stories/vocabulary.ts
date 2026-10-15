import { useMemo } from 'react'
import type { Card, Story } from '@/db/types'
import { useAllReviews, useCards } from '@/data/hooks'
import { groupByCard } from '@/features/flashcards/summary'
import {
  alignTranslation,
  annotate,
  buildLexicon,
  cardKnowledge,
  coverage,
  splitParagraphs,
  wordStatus,
  type Coverage,
  type Knowledge,
  type Lexicon,
  type Piece,
  type WordStatus,
} from '@/lib/reader'

/** Every card as a form to find in a text, with how well each one is known. */
export interface Vocabulary {
  lexicon: Lexicon
  cards: Map<string, Card>
  knowledge: Map<string, Knowledge>
  loaded: boolean
}

export function useVocabulary(): Vocabulary {
  const cards = useCards()
  const reviews = useAllReviews()
  const lexicon = useMemo(() => buildLexicon(cards ?? []), [cards])
  const byId = useMemo(() => new Map((cards ?? []).map((c) => [c.id, c])), [cards])
  const knowledge = useMemo(() => {
    const map = new Map<string, Knowledge>()
    for (const [cardId, list] of groupByCard(reviews ?? [])) map.set(cardId, cardKnowledge(list))
    return map
  }, [reviews])
  const loaded = !!cards && !!reviews
  return useMemo(() => ({ lexicon, cards: byId, knowledge, loaded }), [lexicon, byId, knowledge, loaded])
}

export function statusOf(piece: Piece, vocabulary: Vocabulary): WordStatus {
  return wordStatus(piece.cardIds, (id) => vocabulary.knowledge.get(id))
}

export interface StoryParagraph {
  text: string
  pieces: Piece[]
}

export interface AnnotatedStory {
  paragraphs: StoryParagraph[]
  /** One per paragraph, or `null` when the translation does not line up. */
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
