/*
 * Turning new cards into rows: the card itself and one review per direction
 * its deck practises. The web app's pack import and the AI's create_cards
 * share these rules.
 */
import { cleanConjugation } from './conjugation'
import { splitArticle } from './german'
import type { NewCard } from './protocol'
import { directionsFor, newReview } from './srs'
import type { Card, CardReview, CardType, Conjugation, Deck, DeckDirections, Gender } from './types'

/**
 * A shareable set of decks and cards (`"format": "lernzeit-cards"`), as in
 * the German starter file. Cards keep their ids, so importing a pack twice
 * only adds what is missing.
 */
export interface CardPackDeck {
  id: string
  name: string
  /** Topic name, e.g. "German". */
  topic?: string
  directions?: Partial<DeckDirections>
  newPerDay?: number
  reviewsPerDay?: number
}

export interface CardPackCard {
  id?: string
  deckId: string
  type?: CardType
  english: string
  german: string
  gender?: Gender | null
  plural?: string | null
  verbForms?: string | null
  /** Each tense as six forms for ich, du, er/sie/es, wir, ihr, sie. */
  conjugation?: Conjugation | null
  partOfSpeech?: string | null
  exampleDe?: string | null
  exampleEn?: string | null
  tags?: string[]
  /** A data: URL; other image links are ignored (they would not work offline). */
  image?: string | null
  emoji?: string | null
  imageQuery?: string | null
}

export interface CardPack {
  format: 'lernzeit-cards'
  version: number
  description?: string
  decks: CardPackDeck[]
  cards: CardPackCard[]
}

const GENDERS = new Set<string>(['der', 'die', 'das'])

const clean = (v: string | null | undefined) => (typeof v === 'string' && v.trim() ? v.trim() : undefined)

/** How two cards' text is compared for duplicates: trimmed, ignoring case. */
export const cardTextKey = (text: string) => text.trim().toLowerCase()

/** Fills in the card type and moves a leading article into `gender`, as the CSV import does. */
export function normalizeNewCard(card: NewCard): NewCard {
  const german = card.german.trim()
  const type = card.type ?? (german.includes('{{') ? 'cloze' : 'word')
  if (type !== 'word') return { ...card, german, type, gender: undefined }
  const split = splitArticle(german)
  return { ...card, german: split.word, type, gender: card.gender ?? split.gender }
}

/**
 * Normalises new cards and leaves out the ones whose text a deck already has
 * (`existing`, the German of its cards) or that come twice in `cards`.
 * `skipped` holds their text as normalised.
 */
export function newCardsFor(cards: NewCard[], existing: Iterable<string>): { fresh: NewCard[]; skipped: string[] } {
  const seen = new Set([...existing].map(cardTextKey))
  const fresh: NewCard[] = []
  const skipped: string[] = []
  for (const card of cards.map(normalizeNewCard)) {
    if (seen.has(cardTextKey(card.german))) {
      skipped.push(card.german)
      continue
    }
    seen.add(cardTextKey(card.german))
    fresh.push(card)
  }
  return { fresh, skipped }
}

/**
 * A pack card as stored, with a new review for each direction its deck
 * practises. `index` keeps the pack's order: the card is created at `now + index`.
 */
export function packCardRows(pc: CardPackCard, deck: Deck, at: { id: string; now: number; index: number; imageId?: string }): { card: Card; reviews: CardReview[] } {
  const type: CardType = pc.type === 'sentence' || pc.type === 'cloze' ? pc.type : 'word'
  const card: Card = {
    id: at.id,
    deckId: deck.id,
    type,
    english: pc.english.trim(),
    german: pc.german.trim(),
    gender: type === 'word' && pc.gender && GENDERS.has(pc.gender) ? pc.gender : undefined,
    plural: clean(pc.plural),
    verbForms: clean(pc.verbForms),
    conjugation: cleanConjugation(pc.conjugation),
    partOfSpeech: clean(pc.partOfSpeech),
    exampleDe: clean(pc.exampleDe),
    exampleEn: clean(pc.exampleEn),
    emoji: clean(pc.emoji),
    imageQuery: clean(pc.imageQuery),
    imageId: at.imageId,
    tags: (pc.tags ?? []).map((t) => t.trim()).filter(Boolean),
    createdAt: at.now + at.index,
    updatedAt: at.now + at.index,
  }
  return { card, reviews: directionsFor(card, deck).map((direction) => newReview(card, direction, at.now)) }
}

/**
 * What a card's reviews need after the card or its deck changed: a new review
 * for each direction the deck practises that has none, none of the wrong kind
 * for a cloze card (or a cloze review on another card), and the card's deck on
 * every review. Apply `add`, then `remove`, then `put`.
 */
export function reviewChanges(card: Card, deck: Deck, existing: CardReview[], now: number): { add: CardReview[]; remove: string[]; put: CardReview[] } {
  const have = new Set(existing.map((r) => r.direction))
  const add = directionsFor(card, deck)
    .filter((d) => !have.has(d))
    .map((d) => newReview(card, d, now))
  const remove = existing.filter((r) => (card.type === 'cloze') !== (r.direction === 'cloze')).map((r) => r.id)
  const put = existing.filter((r) => r.deckId !== card.deckId).map((r) => ({ ...r, deckId: card.deckId }))
  return { add, remove, put }
}
