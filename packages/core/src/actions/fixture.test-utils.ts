/*
 * Test code only (no test runner imports, so nothing else pulls one in).
 * A small library for the action tests: a German topic with three decks, an
 * AI topic with an empty deck, a few cards with their reviews, and a question
 * set. Times are in Europe/Berlin, like the owner's.
 */
import type { Library } from '../fold'
import { createMemoryStore } from '../library'
import { BridgeError, type BridgeErrorCode } from '../protocol'
import { newReview } from '../srs'
import type { Card, Deck, DeckDirections, Question, Topic } from '../types'

export const TIME_ZONE = 'Europe/Berlin'
/** 15 October 2026, 10:00 in Berlin. */
export const NOW = Date.parse('2026-10-15T10:00:00+02:00')

const ALL: DeckDirections = { imageToDe: true, enToDe: true, deToEn: true }
const week = { mon: 30, tue: 30, wed: 30, thu: 30, fri: 30, sat: 30, sun: 30 }

const topic = (id: string, name: string, order: number): Topic => ({
  id, name, color: 'blue', goalMinutes: week, goalHistory: [{ since: '2026-01-01', goals: week }], archived: false, order, createdAt: 1,
})
const deck = (id: string, name: string, order: number, topicId: string, directions = ALL): Deck => ({
  id, name, topicId, newPerDay: 15, reviewsPerDay: 150, directions, order, createdAt: 1,
})
const card = (id: string, deckId: string, german: string, english: string, extra: Partial<Card> = {}): Card => ({
  id, deckId, type: 'word', german, english, tags: [], createdAt: 1, updatedAt: 1, ...extra,
})
const question = (id: string, text: string): Question => ({ id, set: 'Sich vorstellen', question: text, tags: [], createdAt: 1, updatedAt: 1 })

export const MY_WORDS_CARDS = 3
export const SEEDED_QUESTIONS = 3

export function seedLibrary(): Library {
  const cards = [
    card('c-haus', 'my-words', 'Haus', 'house', { gender: 'das' }),
    card('c-katze', 'my-words', 'Katze', 'cat', { gender: 'die' }),
    card('c-laufen', 'my-words', 'laufen', 'to run'),
    card('c-hund', 'german-top-words', 'Hund', 'dog', { gender: 'der' }),
    card('c-hallo', 'german-everyday-sentences', 'Hallo!', 'Hello!', { type: 'sentence' }),
  ]
  const decks = [
    deck('my-words', 'My Words', 0, 'german'),
    deck('german-top-words', 'German Top Words', 1, 'german'),
    deck('german-everyday-sentences', 'German Everyday Sentences', 2, 'german'),
    deck('ai-terms', 'AI terms', 100, 'ai', { imageToDe: false, enToDe: true, deToEn: true }),
  ]
  return {
    topics: [topic('german', 'German', 0), topic('ai', 'AI', 1)],
    decks,
    cards,
    reviews: cards.map((c) => newReview(c, 'enToDe', 1)),
    questions: [question('q-1', 'Wie heißt du?'), question('q-2', 'Woher kommst du?'), question('q-3', 'Was machst du beruflich?')],
  } as unknown as Library
}

export function makeStore(seed: Library = seedLibrary(), options: { timeZone?: string; now?: () => number } = {}) {
  return createMemoryStore(seed, { timeZone: TIME_ZONE, now: () => NOW, ...options })
}

/** Waits for `promise` to fail with a BridgeError of `code`, and returns that error. */
export async function expectCode(promise: Promise<unknown>, code: BridgeErrorCode): Promise<BridgeError> {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  )
  if (!(error instanceof BridgeError)) throw new Error(`Expected a BridgeError "${code}", got ${error === undefined ? 'success' : String(error)}`)
  if (error.code !== code) throw new Error(`Expected a BridgeError "${code}", got "${error.code}": ${error.message}`)
  return error
}
