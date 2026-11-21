import type { CreateDeckParams, CreateDeckResult, DeckSummary, DeleteDeckParams, DeleteDeckResult } from '../protocol'
import type { Card, Deck, Topic } from '../types'
import { deleteImageIfUnused, removeProgress } from './cards'
import { byId, findDeck, findTopic, invalid, key, sortedDecks, type ActionContext } from './shared'

async function describeDeck(ctx: ActionContext, deck: Deck): Promise<DeckSummary> {
  const [topic, cards] = await Promise.all([
    deck.topicId ? ctx.store.get<Topic>('topics', deck.topicId) : undefined,
    ctx.store.count('cards', { deckId: deck.id }),
  ])
  return { id: deck.id, name: deck.name, topic: topic?.name, cards }
}

export async function listDecks(_params: unknown, ctx: ActionContext): Promise<DeckSummary[]> {
  const [decks, topics] = await Promise.all([sortedDecks(ctx), ctx.store.list<Topic>('topics')])
  const topicName = new Map(topics.map((t) => [t.id, t.name]))
  const counts = await Promise.all(decks.map((d) => ctx.store.count('cards', { deckId: d.id })))
  return decks.map((d, i) => ({ id: d.id, name: d.name, topic: d.topicId ? topicName.get(d.topicId) : undefined, cards: counts[i] }))
}

export async function createDeck({ name, topic }: CreateDeckParams, ctx: ActionContext): Promise<CreateDeckResult> {
  const trimmed = name.trim()
  if (!trimmed) throw invalid('A deck needs a name.')
  const linked = topic ? await findTopic(ctx, topic) : undefined
  const decks = await sortedDecks(ctx)
  const existing = [...decks].sort(byId).find((d) => key(d.name) === key(trimmed))
  if (existing) return { deck: await describeDeck(ctx, existing), created: false }
  const deck: Deck = {
    id: ctx.newId(),
    name: trimmed,
    topicId: linked?.id,
    newPerDay: 15,
    reviewsPerDay: 150,
    directions: { imageToDe: true, enToDe: true, deToEn: false },
    order: (decks.at(-1)?.order ?? -1) + 1,
    createdAt: ctx.now,
  }
  ctx.store.put('decks', deck)
  return { deck: { id: deck.id, name: deck.name, topic: linked?.name, cards: 0 }, created: true }
}

/** Deletes a deck with its cards and their progress, the way the deck dialog does. */
export async function deleteDeck({ deck: deckRef, cardCount }: DeleteDeckParams, ctx: ActionContext): Promise<DeleteDeckResult> {
  if (!Number.isInteger(cardCount) || cardCount < 0) throw invalid('cardCount must be the number of cards in the deck, from list_decks.')
  const deck = await findDeck(ctx, deckRef)
  const cards = await ctx.store.list<Card>('cards', { deckId: deck.id })
  if (cards.length !== cardCount) {
    throw invalid(`"${deck.name}" has ${cards.length} ${cards.length === 1 ? 'card' : 'cards'}, not ${cardCount}. Nothing was deleted; tell the user the real number and ask again.`)
  }
  await Promise.all(cards.map((card) => removeProgress(ctx, card.id)))
  for (const card of cards) ctx.store.remove('cards', card.id)
  ctx.store.remove('decks', deck.id)
  for (const imageId of new Set(cards.map((c) => c.imageId))) await deleteImageIfUnused(ctx, imageId)
  return { deck: deck.name, deletedCards: cards.length }
}
