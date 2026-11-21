import { cardTextKey, newCardsFor, packCardRows, reviewChanges } from '../cardPack'
import { splitArticle } from '../german'
import {
  MAX_CARDS_PER_CALL,
  MAX_CARDS_PER_LIST,
  type CardDetails,
  type CreateCardsParams,
  type CreateCardsResult,
  type DeleteCardsParams,
  type DeleteCardsResult,
  type ListCardsParams,
  type ListCardsResult,
  type MoveCardsParams,
  type MoveCardsResult,
} from '../protocol'
import type { Card, CardReview, Deck } from '../types'
import { AI_TAG, byId, findDeck, invalid, key, sortedDecks, type ActionContext } from './shared'

export async function createCards({ deck: deckRef, cards }: CreateCardsParams, ctx: ActionContext): Promise<CreateCardsResult> {
  if (!cards.length) throw invalid('Send at least one card.')
  if (cards.length > MAX_CARDS_PER_CALL) throw invalid(`Send at most ${MAX_CARDS_PER_CALL} cards per call.`)
  cards.forEach((card, i) => {
    if (!card.english.trim() || !card.german.trim()) throw invalid(`Card ${i + 1} needs both english (the meaning) and german (the word in the language you learn).`)
  })

  const deck = await findDeck(ctx, deckRef)
  const inDeck = await ctx.store.list<Card>('cards', { deckId: deck.id })
  const { fresh, skipped } = newCardsFor(cards, inDeck.map((c) => c.german))
  fresh.forEach((card, index) => {
    const pc = { ...card, deckId: deck.id, tags: [...new Set([...(card.tags ?? []), AI_TAG])] }
    const rows = packCardRows(pc, deck, { id: ctx.newId(), now: ctx.now, index })
    ctx.store.put('cards', rows.card)
    for (const review of rows.reviews) ctx.store.put('reviews', review)
  })
  return { deck: deck.name, added: fresh.length, skipped }
}

/** What the card shows: "der Hund" for a noun, the German text otherwise. */
const shownText = (card: Card) => (card.gender ? `${card.gender} ${card.german}` : card.german)

function describeCard(card: Card, deck: string): CardDetails {
  const { id, type, german, english, gender, plural, verbForms, conjugation, partOfSpeech, exampleDe, exampleEn, tags, emoji, imageQuery } = card
  return { id, deck, type, german, english, gender, plural, verbForms, conjugation, partOfSpeech, exampleDe, exampleEn, tags, emoji, imageQuery, hasImage: !!card.imageId }
}

export async function listCards({ deck: deckRef, search, tag, limit = MAX_CARDS_PER_LIST, offset = 0 }: ListCardsParams, ctx: ActionContext): Promise<ListCardsResult> {
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_CARDS_PER_LIST) throw invalid(`limit must be a whole number from 1 to ${MAX_CARDS_PER_LIST}.`)
  if (!Number.isInteger(offset) || offset < 0) throw invalid('offset must be a whole number, 0 or more.')

  const decks = deckRef ? [await findDeck(ctx, deckRef)] : await sortedDecks(ctx)
  const place = new Map(decks.map((d, i) => [d.id, i]))
  const query = key(search ?? '')
  const wanted = key(tag ?? '')
  const all = deckRef ? await ctx.store.list<Card>('cards', { deckId: decks[0].id }) : await ctx.store.list<Card>('cards')
  const cards = all
    .filter((c) => place.has(c.deckId))
    .filter((c) => !wanted || c.tags.some((t) => key(t) === wanted))
    .filter((c) => !query || key(shownText(c)).includes(query) || key(c.english).includes(query))
    .sort((a, b) => place.get(a.deckId)! - place.get(b.deckId)! || a.createdAt - b.createdAt || byId(a, b))
  const names = new Map(decks.map((d) => [d.id, d.name]))
  return { total: cards.length, offset, cards: cards.slice(offset, offset + limit).map((c) => describeCard(c, names.get(c.deckId)!)) }
}

function checkCardRefs(refs: string[]) {
  if (!refs.length) throw invalid('Send at least one card: its id from list_cards or its German text.')
  if (refs.length > MAX_CARDS_PER_CALL) throw invalid(`Send at most ${MAX_CARDS_PER_CALL} cards per call.`)
  if (refs.some((ref) => !ref.trim())) throw invalid('Each card needs its id from list_cards or its German text.')
}

/**
 * The cards a ref names: a card id, or the German text in any case. When no
 * card has that text, "der Hund" also finds the word card "Hund".
 */
function cardsNamed(cards: Card[], ref: string): Card[] {
  const byRefId = cards.filter((c) => c.id === ref.trim())
  if (byRefId.length) return byRefId
  const exact = cards.filter((c) => key(c.german) === key(ref))
  if (exact.length) return exact
  const word = key(splitArticle(ref).word)
  return cards.filter((c) => c.type === 'word' && key(c.german) === word)
}

/** Looks up every ref in a deck's cards; a card named twice comes back once. */
function resolveCards(cards: Card[], refs: string[]): { found: Card[]; notFound: string[] } {
  const found = new Map<string, Card>()
  const notFound: string[] = []
  const sorted = [...cards].sort(byId)
  for (const ref of refs) {
    const matches = cardsNamed(sorted, ref)
    if (!matches.length) notFound.push(ref.trim())
    for (const card of matches) found.set(card.id, card)
  }
  return { found: [...found.values()], notFound }
}

/** Moves a card to another deck with its progress, as picking another deck in the editor does. */
async function moveCard(ctx: ActionContext, card: Card, deck: Deck) {
  if (card.deckId === deck.id) return
  const moved: Card = { ...card, deckId: deck.id, updatedAt: ctx.now }
  ctx.store.put('cards', moved)
  const { add, remove, put } = reviewChanges(moved, deck, await ctx.store.list<CardReview>('reviews', { cardId: card.id }), ctx.now)
  for (const review of add) ctx.store.put('reviews', review)
  for (const id of remove) ctx.store.remove('reviews', id)
  for (const review of put) ctx.store.put('reviews', review)
}

/** Moves cards with their progress; a card whose text the target deck already has stays put. */
export async function moveCards({ deck: fromRef, to: toRef, cards: refs }: MoveCardsParams, ctx: ActionContext): Promise<MoveCardsResult> {
  checkCardRefs(refs)
  const from = await findDeck(ctx, fromRef)
  const to = await findDeck(ctx, toRef)
  if (from.id === to.id) throw invalid(`The cards are in "${from.name}" already. Name another deck in to.`)
  const { found, notFound } = resolveCards(await ctx.store.list<Card>('cards', { deckId: from.id }), refs)
  const taken = new Set((await ctx.store.list<Card>('cards', { deckId: to.id })).map((c) => cardTextKey(c.german)))
  const moved: string[] = []
  const skipped: string[] = []
  for (const card of found) {
    if (taken.has(cardTextKey(card.german))) {
      skipped.push(card.german)
      continue
    }
    taken.add(cardTextKey(card.german))
    await moveCard(ctx, card, to)
    moved.push(card.german)
  }
  return { from: from.name, to: to.name, moved, skipped, notFound }
}

/** Removes a card's reviews, review logs and drill stats. */
export async function removeProgress(ctx: ActionContext, cardId: string) {
  const [reviews, logs, drills] = await Promise.all([
    ctx.store.list<{ id: string }>('reviews', { cardId }),
    ctx.store.list<{ id: string }>('reviewLogs', { cardId }),
    ctx.store.list<{ id: string }>('drillStats', { cardId }),
  ])
  for (const r of reviews) ctx.store.remove('reviews', r.id)
  for (const l of logs) ctx.store.remove('reviewLogs', l.id)
  for (const d of drills) ctx.store.remove('drillStats', d.id)
}

/** Removes an image once no card uses it. */
export async function deleteImageIfUnused(ctx: ActionContext, imageId: string | undefined) {
  if (!imageId) return
  if (!(await ctx.store.count('cards', { imageId }))) ctx.store.remove('images', imageId)
}

/** Deletes a card with its progress, the way the card editor does. */
async function deleteCard(ctx: ActionContext, card: Card) {
  ctx.store.remove('cards', card.id)
  await removeProgress(ctx, card.id)
  await deleteImageIfUnused(ctx, card.imageId)
}

export async function deleteCards({ deck: deckRef, cards: refs }: DeleteCardsParams, ctx: ActionContext): Promise<DeleteCardsResult> {
  checkCardRefs(refs)
  const deck = await findDeck(ctx, deckRef)
  const { found, notFound } = resolveCards(await ctx.store.list<Card>('cards', { deckId: deck.id }), refs)
  for (const card of found) await deleteCard(ctx, card)
  return { deck: deck.name, deleted: found.map((c) => c.german), notFound }
}
