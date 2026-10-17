import { db, newId, type LernzeitDB } from '@/db/db'
import type { Card, CardReview, Deck, DeckDirections, Grade, ReviewLog } from '@/db/types'
import { cleanConjugation } from '@/lib/conjugation'
import { splitArticle } from '@/lib/german'
import { prepareImage } from '@/lib/image'
import { applyGrade, directionsFor, newReview } from '@/lib/srs'
import { dateKey } from '@/lib/time'

export const INCOMPLETE_TAG = 'incomplete'

export type CardInput = Omit<Card, 'id' | 'createdAt' | 'updatedAt' | 'imageId'>

/** Image change requested by the editor. */
export type ImageChange = { kind: 'keep' } | { kind: 'remove' } | { kind: 'set'; file: Blob }

/** Creates review rows for every enabled direction that does not have one yet. */
async function syncReviews(database: LernzeitDB, card: Card, deck: Deck) {
  const wanted = directionsFor(card, deck)
  const existing = await database.reviews.where('cardId').equals(card.id).toArray()
  const have = new Set(existing.map((r) => r.direction))
  const now = Date.now()
  const missing = wanted.filter((d) => !have.has(d)).map((d) => newReview(card, d, now))
  if (missing.length) await database.reviews.bulkAdd(missing)
  // A cloze card that changed type keeps no stale directions.
  const stale = existing.filter((r) => (card.type === 'cloze') !== (r.direction === 'cloze'))
  if (stale.length) await database.reviews.bulkDelete(stale.map((r) => r.id))
  const moved = existing.filter((r) => r.deckId !== card.deckId)
  if (moved.length) await database.reviews.bulkPut(moved.map((r) => ({ ...r, deckId: card.deckId })))
}

async function deleteImageIfUnused(database: LernzeitDB, imageId: string | undefined, exceptCardId?: string) {
  if (!imageId) return
  const users = await database.cards.filter((c) => c.imageId === imageId && c.id !== exceptCardId).count()
  if (!users) await database.images.delete(imageId)
}

function normalizeInput(input: CardInput): CardInput {
  let { german, gender } = input
  if (input.type === 'word' && !gender) {
    const split = splitArticle(german)
    german = split.word
    gender = split.gender
  }
  const tags = [...new Set(input.tags.map((t) => t.trim()).filter(Boolean))]
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
    tags,
  }
}

export async function saveCard(
  input: CardInput,
  image: ImageChange,
  existingId?: string,
  database: LernzeitDB = db,
): Promise<Card> {
  // Resize before the transaction: IndexedDB transactions cannot await other work.
  const prepared = image.kind === 'set' ? await prepareImage(image.file) : null
  return database.transaction('rw', [database.cards, database.reviews, database.images, database.decks], async () => {
    const now = Date.now()
    const deck = await database.decks.get(input.deckId)
    if (!deck) throw new Error('Deck not found')
    const previous = existingId ? await database.cards.get(existingId) : undefined
    let imageId = previous?.imageId

    if (prepared) {
      imageId = newId()
      await database.images.add({ id: imageId, ...prepared })
    } else if (image.kind === 'remove') {
      imageId = undefined
    }

    const data = normalizeInput(input)
    const card: Card = {
      // Fields the editor does not show (part of speech, photo search words) are kept.
      ...previous,
      ...data,
      id: previous?.id ?? newId(),
      imageId,
      createdAt: previous?.createdAt ?? now,
      updatedAt: now,
    }
    await database.cards.put(card)
    if (previous?.imageId && previous.imageId !== imageId) await deleteImageIfUnused(database, previous.imageId, card.id)
    await syncReviews(database, card, deck)
    return card
  })
}

/** The always-visible "+": English and German only, tagged incomplete. */
export async function quickAddCard(input: { english: string; german: string; deckId: string }, database: LernzeitDB = db) {
  return saveCard(
    { deckId: input.deckId, type: 'word', english: input.english, german: input.german, tags: [INCOMPLETE_TAG] },
    { kind: 'keep' },
    undefined,
    database,
  )
}

export async function deleteCard(id: string, database: LernzeitDB = db) {
  await database.transaction('rw', [database.cards, database.reviews, database.reviewLogs, database.drillStats, database.images], async () => {
    const card = await database.cards.get(id)
    if (!card) return
    await database.cards.delete(id)
    await database.reviews.where('cardId').equals(id).delete()
    await database.reviewLogs.where('cardId').equals(id).delete()
    await database.drillStats.where('cardId').equals(id).delete()
    await deleteImageIfUnused(database, card.imageId)
  })
}

export async function createDeck(input: { name: string; topicId?: string }, database: LernzeitDB = db): Promise<Deck> {
  const order = ((await database.decks.orderBy('order').last())?.order ?? -1) + 1
  const deck: Deck = {
    id: newId(),
    name: input.name.trim() || 'New deck',
    topicId: input.topicId,
    newPerDay: 15,
    reviewsPerDay: 150,
    directions: { imageToDe: true, enToDe: true, deToEn: false },
    order,
    createdAt: Date.now(),
  }
  await database.decks.add(deck)
  return deck
}

export async function updateDeck(
  id: string,
  patch: Partial<Pick<Deck, 'name' | 'topicId' | 'newPerDay' | 'reviewsPerDay'>> & { directions?: DeckDirections },
  database: LernzeitDB = db,
) {
  await database.transaction('rw', [database.decks, database.cards, database.reviews], async () => {
    const deck = await database.decks.get(id)
    if (!deck) return
    const next: Deck = { ...deck, ...patch }
    if (patch.name !== undefined) next.name = patch.name.trim() || deck.name
    await database.decks.put(next)
    if (patch.directions) {
      const cards = await database.cards.where('deckId').equals(id).toArray()
      for (const card of cards) await syncReviews(database, card, next)
    }
  })
}

/** Deletes a deck with all of its cards and their progress. */
export async function deleteDeck(id: string, database: LernzeitDB = db) {
  await database.transaction('rw', [database.decks, database.cards, database.reviews, database.reviewLogs, database.drillStats, database.images], async () => {
    const cards = await database.cards.where('deckId').equals(id).toArray()
    const cardIds = cards.map((c) => c.id)
    await database.reviews.where('cardId').anyOf(cardIds).delete()
    await database.reviewLogs.where('cardId').anyOf(cardIds).delete()
    await database.drillStats.where('cardId').anyOf(cardIds).delete()
    await database.cards.bulkDelete(cardIds)
    await database.decks.delete(id)
    const imageIds = [...new Set(cards.map((c) => c.imageId).filter((x): x is string => !!x))]
    for (const imageId of imageIds) await deleteImageIfUnused(database, imageId)
  })
}

export interface GradeResult {
  previous: CardReview
  next: CardReview
  logId: string
}

/** Applies a rating and logs it. `practice` caps the next interval for cards studied ahead of schedule (see PRACTICE_MAX_INTERVAL). */
export async function gradeReview(reviewIdValue: string, grade: Grade, durationMs: number, database: LernzeitDB = db, practice = false): Promise<GradeResult | undefined> {
  return database.transaction('rw', [database.reviews, database.reviewLogs], async () => {
    const review = await database.reviews.get(reviewIdValue)
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
      // Cap idle time so a card left open does not distort stats.
      durationMs: Math.min(durationMs, 120_000),
      day: dateKey(now),
    }
    await database.reviews.put(next)
    await database.reviewLogs.add(log)
    return { previous: review, next, logId: log.id }
  })
}

/** Undo the last rating: restore the previous review state and drop the log. */
export async function undoGrade(previous: CardReview, logId: string, database: LernzeitDB = db) {
  await database.transaction('rw', [database.reviews, database.reviewLogs], async () => {
    await database.reviews.put(previous)
    await database.reviewLogs.delete(logId)
  })
}

