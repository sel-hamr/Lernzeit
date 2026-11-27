/*
 * Flashcards over the local library, with the web's rules (src/data/cards.ts): saving a card keeps
 * one review per direction its deck practises, deleting takes its progress and unused images along,
 * a rating applies FSRS and writes a log that Undo can take back.
 */
import { CARD_PROGRESS_TABLES, reviewChanges } from '@lernzeit/core/cardPack'
import { cleanConjugation } from '@lernzeit/core/conjugation'
import { unusedImages } from '@lernzeit/core/docs'
import { splitArticle } from '@lernzeit/core/german'
import { splitAtMidnight } from '@lernzeit/core/sessions'
import { applyGrade } from '@lernzeit/core/srs'
import { dayKeyAt } from '@lernzeit/core/today'
import type { Card, CardReview, Deck, Doc, Grade, PracticeRun, ReviewLog, Session } from '@lernzeit/core/types'
import { useMemo } from 'react'
import { newId } from '../data/ids'
import type { ImageFile, LocalLibrary } from '../store/library'
import { useLiveQuery } from '../store/live'
import { zoneOf } from '../timer/timerStore'

export const INCOMPLETE_TAG = 'incomplete'

export type CardInput = Omit<Card, 'id' | 'createdAt' | 'updatedAt' | 'imageId'>

/** The image change the editor asks for; `set` brings a file already written (see images.ts). */
export type ImageChange = { kind: 'keep' } | { kind: 'remove' } | { kind: 'set'; file: ImageFile }

export const useDecks = (): Deck[] => useLiveQuery(['decks'], (l) => l.list<Deck>('decks').sort((a, b) => a.order - b.order), [])
export const useCards = (): Card[] => useLiveQuery(['cards'], (l) => l.list<Card>('cards'), [])
export const useReviews = (): CardReview[] => useLiveQuery(['reviews'], (l) => l.list<CardReview>('reviews'), [])

export function useCardMap() {
  const cards = useCards()
  return useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards])
}

function syncReviews(library: LocalLibrary, card: Card, deck: Deck) {
  const existing = library.list<CardReview>('reviews', { cardId: card.id })
  const { add, remove, put } = reviewChanges(card, deck, existing, Date.now())
  for (const r of add) library.put('reviews', r)
  for (const id of remove) library.remove('reviews', id)
  for (const r of put) library.put('reviews', r)
}

function deleteImageIfUnused(library: LocalLibrary, imageId: string | undefined, exceptCardId?: string) {
  if (!imageId) return
  const cards = library.list<Card>('cards', { imageId }).filter((c) => c.id !== exceptCardId)
  const docs = cards.length ? [] : library.list<Doc>('docs')
  if (unusedImages([imageId], cards, docs).length) library.remove('images', imageId)
}

export function normalizeInput(input: CardInput): CardInput {
  let { german, gender } = input
  if (input.type === 'word' && !gender) {
    const split = splitArticle(german)
    german = split.word
    gender = split.gender
  }
  const clean = (s?: string) => (s?.trim() ? s.trim() : undefined)
  return {
    ...input,
    english: input.english.trim(),
    german: german.trim(),
    gender: input.type === 'word' ? gender : undefined,
    plural: clean(input.plural),
    verbForms: clean(input.verbForms),
    conjugation: cleanConjugation(input.conjugation),
    exampleDe: clean(input.exampleDe),
    exampleEn: clean(input.exampleEn),
    emoji: clean(input.emoji),
    tags: [...new Set(input.tags.map((t) => t.trim()).filter(Boolean))],
  }
}

export function saveCard(library: LocalLibrary, input: CardInput, image: ImageChange, existingId?: string): Card {
  return library.write(() => {
    const now = Date.now()
    const deck = library.get<Deck>('decks', input.deckId)
    if (!deck) throw new Error('Deck not found')
    const previous = existingId ? library.get<Card>('cards', existingId) : undefined
    let imageId = previous?.imageId
    if (image.kind === 'set') {
      imageId = image.file.id
      library.putImageFile(image.file)
      library.put('images', { id: image.file.id, width: image.file.width, height: image.file.height, fit: image.file.fit, type: image.file.type })
    } else if (image.kind === 'remove') imageId = undefined
    const card: Card = { ...previous, ...normalizeInput(input), id: previous?.id ?? newId(), imageId, createdAt: previous?.createdAt ?? now, updatedAt: now }
    library.put('cards', card)
    if (previous?.imageId && previous.imageId !== imageId) deleteImageIfUnused(library, previous.imageId, card.id)
    syncReviews(library, card, deck)
    return card
  })
}

/** The "+": English and German only, tagged incomplete. */
export function quickAddCard(library: LocalLibrary, input: { english: string; german: string; deckId: string }): Card {
  return saveCard(library, { deckId: input.deckId, type: 'word', english: input.english, german: input.german, tags: [INCOMPLETE_TAG] }, { kind: 'keep' })
}

export function deleteCard(library: LocalLibrary, id: string): void {
  library.write(() => {
    const card = library.get<Card>('cards', id)
    if (!card) return
    library.remove('cards', id)
    for (const tbl of CARD_PROGRESS_TABLES) for (const rid of library.listIds(tbl, { cardId: id })) library.remove(tbl, rid)
    deleteImageIfUnused(library, card.imageId)
  })
}

/** Moves a card with its progress; the new deck's directions are added. */
export function moveCard(library: LocalLibrary, id: string, deckId: string): void {
  library.write(() => {
    const card = library.get<Card>('cards', id)
    const deck = library.get<Deck>('decks', deckId)
    if (!card || !deck || card.deckId === deckId) return
    const moved: Card = { ...card, deckId, updatedAt: Date.now() }
    library.put('cards', moved)
    syncReviews(library, moved, deck)
  })
}

export function createDeck(library: LocalLibrary, input: { name: string; topicId?: string }): Deck {
  const order = Math.max(-1, ...library.list<Deck>('decks').map((d) => d.order)) + 1
  const deck: Deck = { id: newId(), name: input.name.trim() || 'New deck', topicId: input.topicId, newPerDay: 15, reviewsPerDay: 150, directions: { imageToDe: true, enToDe: true, deToEn: false }, order, createdAt: Date.now() }
  library.put('decks', deck)
  return deck
}

/** Saves a deck and gives its cards the reviews its directions ask for. */
export function saveDeck(library: LocalLibrary, deck: Deck): void {
  library.write(() => {
    library.put('decks', deck)
    for (const card of library.list<Card>('cards', { deckId: deck.id })) syncReviews(library, card, deck)
  })
}

export interface GradeResult {
  previous: CardReview
  next: CardReview
  logId: string
}

/** Applies a rating and logs it; `practice` caps the next interval of cards studied ahead of schedule. */
export function gradeReview(library: LocalLibrary, reviewId: string, grade: Grade, durationMs: number, practice = false): GradeResult | undefined {
  return library.write(() => {
    const review = library.get<CardReview>('reviews', reviewId)
    if (!review) return undefined
    const now = Date.now()
    const fsrs = applyGrade(review.fsrs, grade, now, practice)
    const next: CardReview = { ...review, fsrs, due: fsrs.due, state: fsrs.state }
    const log: ReviewLog = {
      id: newId(),
      reviewId: review.id,
      cardId: review.cardId,
      deckId: review.deckId,
      direction: review.direction,
      rating: grade,
      prevState: review.state,
      reviewedAt: now,
      durationMs: Math.min(durationMs, 120_000),
      day: dayKeyAt(now, zoneOf(library)),
    }
    library.put('reviews', next)
    library.put('reviewLogs', log)
    return { previous: review, next, logId: log.id }
  })
}

export function undoGrade(library: LocalLibrary, previous: CardReview, logId: string): void {
  library.write(() => {
    library.put('reviews', previous)
    library.remove('reviewLogs', logId)
  })
}

/** Saved after every rating and undo; a session with no rating left is removed. */
export function savePracticeRun(library: LocalLibrary, run: PracticeRun): void {
  if (run.reviewed > 0) library.put('practiceRuns', run)
  else library.remove('practiceRuns', run.id)
}

/** Review time counted toward a topic: saving the same run again replaces it. */
export function recordReviewTime(library: LocalLibrary, run: { runId: string; topicId: string; start: number; end: number; minutes: number }): void {
  library.write(() => {
    for (const id of library.listIds('sessions', { runId: run.runId })) library.remove('sessions', id)
    splitAtMidnight(run.start, run.end, run.minutes, zoneOf(library)).forEach((p, i) => {
      const session: Session = { id: `${run.runId}:${i}`, topicId: run.topicId, start: p.start, end: p.end, minutes: p.minutes, date: p.date, note: 'Flashcard review', source: 'flashcards', runId: run.runId }
      library.put('sessions', session)
    })
  })
}

export function removeReviewTime(library: LocalLibrary, runId: string): void {
  library.write(() => {
    for (const id of library.listIds('sessions', { runId })) library.remove('sessions', id)
  })
}
