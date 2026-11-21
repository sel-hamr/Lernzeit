import type { LibraryReader, LibraryStore } from '../library'
import { BridgeError, type ActionName, type ActionParams, type ActionResult } from '../protocol'
import { localDateTimeIn } from '../time'
import type { Deck, Topic } from '../types'

/** Every card, story, question and doc the AI adds gets this tag, so it is easy to find and check. */
export const AI_TAG = 'ai'

/** What an action works with: the library with this call's writes staged on top, and the call's clock. */
export interface ActionContext {
  store: LibraryReader & Pick<LibraryStore, 'put' | 'remove'>
  /** When the call runs. */
  now: number
  /** The owner's time zone: local dates and times are read and written in it. */
  timeZone: string
  newId(): string
}

export type Handler<A extends ActionName> = (params: ActionParams<A>, ctx: ActionContext) => Promise<ActionResult<A>>

export const key = (text: string) => text.trim().toLowerCase()
export const nameList = (items: { name: string }[]) => items.map((i) => i.name).join(', ') || 'none'
export const invalid = (message: string) => new BridgeError('invalid_input', message)

/** Ids in the order the web app's database keeps them, so ties come out the same. */
export const byId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
export const byOrder = (a: { id: string; order: number }, b: { id: string; order: number }) => a.order - b.order || byId(a, b)

/** "2026-10-15T08:30" in the owner's time. */
export const localDateTime = (ctx: ActionContext, ms: number) => localDateTimeIn(ms, ctx.timeZone)

export async function sortedDecks(ctx: ActionContext): Promise<Deck[]> {
  return (await ctx.store.list<Deck>('decks')).sort(byOrder)
}

export async function activeTopics(ctx: ActionContext): Promise<Topic[]> {
  return (await ctx.store.list<Topic>('topics')).sort(byOrder).filter((t) => !t.archived)
}

export async function findTopic(ctx: ActionContext, nameOrId: string): Promise<Topic> {
  const topics = await activeTopics(ctx)
  const topic = topics.find((t) => t.id === nameOrId) ?? topics.find((t) => key(t.name) === key(nameOrId))
  if (!topic) throw new BridgeError('topic_not_found', `No topic named "${nameOrId}". Topics: ${nameList(topics)}.`)
  return topic
}

export async function findDeck(ctx: ActionContext, nameOrId: string): Promise<Deck> {
  const decks = await sortedDecks(ctx)
  const deck = decks.find((d) => d.id === nameOrId) ?? decks.find((d) => key(d.name) === key(nameOrId))
  if (!deck) throw new BridgeError('deck_not_found', `No deck named "${nameOrId}". Decks: ${nameList(decks)}.`)
  return deck
}
