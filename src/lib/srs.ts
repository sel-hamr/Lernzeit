import { createEmptyCard, fsrs, generatorParameters, Rating, State, type Card as FsrsCard, type Grade as FsrsGrade } from 'ts-fsrs'
import type { Card, CardReview, Deck, Direction, Grade, StoredFsrs } from '@/db/types'
import { isNoun } from './german'
import { DAY, HOUR, MINUTE } from './time'

export { State }

const scheduler = fsrs(generatorParameters({ enable_fuzz: true, enable_short_term: true }))

export function toFsrs(s: StoredFsrs): FsrsCard {
  return {
    ...s,
    due: new Date(s.due),
    last_review: s.last_review !== undefined ? new Date(s.last_review) : undefined,
  }
}

export function fromFsrs(c: FsrsCard): StoredFsrs {
  return {
    due: c.due.getTime(),
    stability: c.stability,
    difficulty: c.difficulty,
    elapsed_days: c.elapsed_days,
    scheduled_days: c.scheduled_days,
    learning_steps: c.learning_steps,
    reps: c.reps,
    lapses: c.lapses,
    state: c.state,
    last_review: c.last_review ? c.last_review.getTime() : undefined,
  }
}

export function newFsrs(now: number = Date.now()): StoredFsrs {
  return fromFsrs(createEmptyCard(new Date(now)))
}

export const GRADES: Grade[] = [1, 2, 3, 4]

export const GRADE_LABEL: Record<Grade, string> = { 1: 'Again', 2: 'Hard', 3: 'Good', 4: 'Easy' }

const RATING: Record<Grade, FsrsGrade> = {
  1: Rating.Again,
  2: Rating.Hard,
  3: Rating.Good,
  4: Rating.Easy,
}

/**
 * Longest wait after a rating in a practice round (cards studied ahead of
 * schedule). Practising ahead brings a card back soon instead of pushing it
 * weeks out; its next due review is scheduled by FSRS as usual.
 */
export const PRACTICE_MAX_INTERVAL: Record<Grade, number> = { 1: 10 * MINUTE, 2: HOUR, 3: DAY, 4: 2 * DAY }

/** Caps the next due date for a practice round. Never makes it later than FSRS would. */
function capForPractice(next: StoredFsrs, grade: Grade, now: number): StoredFsrs {
  const due = Math.min(next.due, now + PRACTICE_MAX_INTERVAL[grade])
  return { ...next, due, scheduled_days: Math.floor((due - now) / DAY) }
}

/** What each button would do, without saving anything. */
export function previewGrades(state: StoredFsrs, now: number, practice = false): Record<Grade, StoredFsrs> {
  const preview = scheduler.repeat(toFsrs(state), new Date(now))
  const card = (g: Grade) => {
    const next = fromFsrs(preview[RATING[g]].card)
    return practice ? capForPractice(next, g, now) : next
  }
  return { 1: card(1), 2: card(2), 3: card(3), 4: card(4) }
}

export function applyGrade(state: StoredFsrs, grade: Grade, now: number, practice = false): StoredFsrs {
  const next = fromFsrs(scheduler.next(toFsrs(state), new Date(now), RATING[grade]).card)
  return practice ? capForPractice(next, grade, now) : next
}

/**
 * Whether the card's picture alone can ask for the word: any uploaded image,
 * or an emoji on a noun (an emoji for a verb or adjective is too ambiguous).
 */
export function canPractiseFromPicture(card: Pick<Card, 'type' | 'imageId' | 'emoji' | 'gender' | 'partOfSpeech'>): boolean {
  if (card.type !== 'word') return false
  return !!card.imageId || (!!card.emoji && isNoun(card))
}

/** Directions a card should practise, given its deck settings. */
export function directionsFor(card: Pick<Card, 'type' | 'imageId' | 'emoji' | 'gender' | 'partOfSpeech'>, deck: Pick<Deck, 'directions'>): Direction[] {
  if (card.type === 'cloze') return ['cloze']
  const dirs: Direction[] = []
  const { imageToDe, enToDe, deToEn } = deck.directions
  const picture = canPractiseFromPicture(card)
  // A sentence front always shows its English text with the picture.
  if (imageToDe && picture) dirs.push('imageToDe')
  if (enToDe || card.type === 'sentence') dirs.push('enToDe')
  if (deToEn) dirs.push('deToEn')
  // Never leave a card with nothing to practise.
  if (!dirs.length) dirs.push(picture ? 'imageToDe' : 'enToDe')
  return dirs
}

/**
 * "English → French". The ids say German and English from before language
 * packs; they stand for the language you learn and your own.
 */
export function directionLabel(direction: Direction, names: { learning: string; native: string }): string {
  return {
    imageToDe: `Image → ${names.learning}`,
    enToDe: `${names.native} → ${names.learning}`,
    deToEn: `${names.learning} → ${names.native}`,
    cloze: 'Cloze',
  }[direction]
}

export function reviewId(cardId: string, direction: Direction): string {
  return `${cardId}:${direction}`
}

export function newReview(card: Pick<Card, 'id' | 'deckId'>, direction: Direction, now: number): CardReview {
  const state = newFsrs(now)
  return {
    id: reviewId(card.id, direction),
    cardId: card.id,
    deckId: card.deckId,
    direction,
    fsrs: state,
    due: state.due,
    state: state.state,
  }
}

