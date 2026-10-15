import { db, type LernzeitDB } from '@/db/db'
import type { Deck, Story, Topic } from '@/db/types'
import { createDeck } from '@/data/cards'
import { writeCardPack, type CardPack, type CardPackCard } from '@/data/io'
import { defaultStoryTopicId, parseLevel, saveStory } from '@/data/stories'
import { createTask } from '@/data/tasks'
import { logManualSession } from '@/data/topics'
import { splitArticle } from '@/lib/german'
import { countWords, splitParagraphs } from '@/lib/reader'
import { dateKey, MINUTE } from '@/lib/time'
import {
  BridgeError,
  MAX_CARDS_PER_CALL,
  MAX_STORY_CHARS,
  MAX_STORY_TITLE,
  MAX_STUDY_MINUTES,
  toErrorBody,
  type ActionName,
  type ActionParams,
  type ActionResult,
  type CreateCardsParams,
  type CreateCardsResult,
  type CreateDeckParams,
  type CreateDeckResult,
  type CreateStoryParams,
  type CreateStoryResult,
  type CreateTaskParams,
  type DeckSummary,
  type LogStudyTimeParams,
  type NewCard,
  type RequestMessage,
  type ResponseMessage,
  type SessionSummary,
  type StorySummary,
  type TaskSummary,
  type TopicSummary,
} from './protocol'

/** Every card and story added through the bridge gets this tag, so it is easy to find and check. */
export const AI_TAG = 'ai'

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/

const key = (text: string) => text.trim().toLowerCase()
const nameList = (items: { name: string }[]) => items.map((i) => i.name).join(', ') || 'none'
const invalid = (message: string) => new BridgeError('invalid_input', message)

/** "2026-10-15T08:30" in local time, the way people say it. */
function localDateTime(ms: number): string {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${dateKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

async function activeTopics(database: LernzeitDB): Promise<Topic[]> {
  return (await database.topics.orderBy('order').toArray()).filter((t) => !t.archived)
}

async function findTopic(database: LernzeitDB, nameOrId: string): Promise<Topic> {
  const topics = await activeTopics(database)
  const topic = topics.find((t) => t.id === nameOrId) ?? topics.find((t) => key(t.name) === key(nameOrId))
  if (!topic) throw new BridgeError('topic_not_found', `No topic named "${nameOrId}". Topics: ${nameList(topics)}.`)
  return topic
}

async function findDeck(database: LernzeitDB, nameOrId: string): Promise<Deck> {
  const decks = await database.decks.orderBy('order').toArray()
  const deck = decks.find((d) => d.id === nameOrId) ?? decks.find((d) => key(d.name) === key(nameOrId))
  if (!deck) throw new BridgeError('deck_not_found', `No deck named "${nameOrId}". Decks: ${nameList(decks)}.`)
  return deck
}

async function describeDeck(database: LernzeitDB, deck: Deck): Promise<DeckSummary> {
  const [topic, cards] = await Promise.all([
    deck.topicId ? database.topics.get(deck.topicId) : undefined,
    database.cards.where('deckId').equals(deck.id).count(),
  ])
  return { id: deck.id, name: deck.name, topic: topic?.name, cards }
}

async function describeStory(database: LernzeitDB, story: Story): Promise<StorySummary> {
  const topic = story.topicId ? await database.topics.get(story.topicId) : undefined
  return {
    id: story.id,
    title: story.title,
    level: story.level,
    words: countWords(story.text),
    paragraphs: splitParagraphs(story.text).length,
    topic: topic?.name,
  }
}

/** Fills in the card type and moves a leading article into `gender`, as the CSV import does. */
function normalizeCard(card: NewCard): NewCard {
  const german = card.german.trim()
  const type = card.type ?? (german.includes('{{') ? 'cloze' : 'word')
  if (type !== 'word') return { ...card, german, type, gender: undefined }
  const split = splitArticle(german)
  return { ...card, german: split.word, type, gender: card.gender ?? split.gender }
}

/* ------------------------------------------------------------ Handlers ---- */

async function listTopics(_params: unknown, database: LernzeitDB): Promise<TopicSummary[]> {
  return (await activeTopics(database)).map(({ id, name }) => ({ id, name }))
}

async function listDecks(_params: unknown, database: LernzeitDB): Promise<DeckSummary[]> {
  const [decks, topics, cardDeckIds] = await Promise.all([
    database.decks.orderBy('order').toArray(),
    database.topics.toArray(),
    database.cards.orderBy('deckId').keys(),
  ])
  const topicName = new Map(topics.map((t) => [t.id, t.name]))
  const counts = new Map<string, number>()
  for (const id of cardDeckIds) counts.set(String(id), (counts.get(String(id)) ?? 0) + 1)
  return decks.map((d) => ({ id: d.id, name: d.name, topic: d.topicId ? topicName.get(d.topicId) : undefined, cards: counts.get(d.id) ?? 0 }))
}

async function createDeckAction({ name, topic }: CreateDeckParams, database: LernzeitDB): Promise<CreateDeckResult> {
  const trimmed = name.trim()
  if (!trimmed) throw invalid('A deck needs a name.')
  const linked = topic ? await findTopic(database, topic) : undefined
  const existing = (await database.decks.toArray()).find((d) => key(d.name) === key(trimmed))
  if (existing) return { deck: await describeDeck(database, existing), created: false }
  const deck = await createDeck({ name: trimmed, topicId: linked?.id }, database)
  return { deck: { id: deck.id, name: deck.name, topic: linked?.name, cards: 0 }, created: true }
}

async function createCards({ deck: deckRef, cards }: CreateCardsParams, database: LernzeitDB): Promise<CreateCardsResult> {
  if (!cards.length) throw invalid('Send at least one card.')
  if (cards.length > MAX_CARDS_PER_CALL) throw invalid(`Send at most ${MAX_CARDS_PER_CALL} cards per call.`)
  cards.forEach((card, i) => {
    if (!card.english.trim() || !card.german.trim()) throw invalid(`Card ${i + 1} needs both English and German.`)
  })

  const tables = [database.topics, database.decks, database.cards, database.reviews, database.images]
  return database.transaction('rw', tables, async () => {
    const deck = await findDeck(database, deckRef)
    const seen = new Set((await database.cards.where('deckId').equals(deck.id).toArray()).map((c) => key(c.german)))
    const fresh: CardPackCard[] = []
    const skipped: string[] = []

    for (const card of cards.map(normalizeCard)) {
      if (seen.has(key(card.german))) {
        skipped.push(card.german)
        continue
      }
      seen.add(key(card.german))
      fresh.push({ ...card, deckId: deck.id, tags: [...new Set([...(card.tags ?? []), AI_TAG])] })
    }

    const pack: CardPack = { format: 'lernzeit-cards', version: 1, decks: [{ id: deck.id, name: deck.name }], cards: fresh }
    const { cards: added } = await writeCardPack({ pack, images: new Map() }, {}, database)
    return { deck: deck.name, added, skipped }
  })
}

async function createStory({ title, text, translation, level, tags, topic }: CreateStoryParams, database: LernzeitDB): Promise<CreateStoryResult> {
  if (!title.trim()) throw invalid('A story needs a title.')
  if (title.length > MAX_STORY_TITLE) throw invalid(`Keep the title under ${MAX_STORY_TITLE} characters.`)
  if (!text.trim()) throw invalid('A story needs German text.')
  if (text.length > MAX_STORY_CHARS || (translation?.length ?? 0) > MAX_STORY_CHARS) {
    throw invalid(`Keep the text and the translation under ${MAX_STORY_CHARS} characters each.`)
  }
  if (level !== undefined && !parseLevel(level)) throw invalid('level must be one of A1, A2, B1, B2, C1 or C2.')

  return database.transaction('rw', [database.stories, database.topics, database.decks], async () => {
    const linked = topic ? await findTopic(database, topic) : undefined
    const existing = (await database.stories.toArray()).find((s) => s.text === text.trim())
    if (existing) return { story: await describeStory(database, existing), created: false }
    const story = await saveStory(
      {
        title,
        text,
        translation,
        level,
        topicId: linked?.id ?? (await defaultStoryTopicId(database)),
        tags: [...(tags ?? []), AI_TAG],
      },
      undefined,
      database,
    )
    return { story: await describeStory(database, story), created: true }
  })
}

async function createTaskAction(
  { title, description, priority = 'medium', status = 'todo', dueDate, topic }: CreateTaskParams,
  database: LernzeitDB,
): Promise<TaskSummary> {
  if (!title.trim()) throw invalid('A task needs a title.')
  if (dueDate && (!DATE_KEY_RE.test(dueDate) || Number.isNaN(Date.parse(dueDate)))) throw invalid('dueDate must be a date like 2026-10-20.')
  const linked = topic ? await findTopic(database, topic) : undefined
  const task = await createTask({ title, description, priority, status, dueDate, topicId: linked?.id }, database)
  return { id: task.id, title: task.title, status: task.status, priority: task.priority, dueDate: task.dueDate, topic: linked?.name }
}

async function logStudyTime({ topic, minutes, start, note }: LogStudyTimeParams, database: LernzeitDB): Promise<SessionSummary> {
  if (!(minutes > 0 && minutes <= MAX_STUDY_MINUTES)) throw invalid(`minutes must be more than 0 and at most ${MAX_STUDY_MINUTES}.`)
  const linked = await findTopic(database, topic)
  const now = Date.now()
  const startMs = start ? Date.parse(start) : now - minutes * MINUTE
  if (Number.isNaN(startMs)) throw invalid('start must be a local date and time like 2026-10-15T08:30.')
  const endMs = startMs + minutes * MINUTE
  if (endMs > now + MINUTE) throw invalid('Study time cannot end in the future.')
  await logManualSession({ topicId: linked.id, start: startMs, minutes, note }, database)
  return { topic: linked.name, minutes, start: localDateTime(startMs), end: localDateTime(endMs) }
}

/* ------------------------------------------------------------ Dispatch ---- */

type Handler<A extends ActionName> = (params: ActionParams<A>, database: LernzeitDB) => Promise<ActionResult<A>>

const handlers: { [A in ActionName]: Handler<A> } = {
  list_topics: listTopics,
  list_decks: listDecks,
  create_deck: createDeckAction,
  create_cards: createCards,
  create_story: createStory,
  create_task: createTaskAction,
  log_study_time: logStudyTime,
}

export function runAction<A extends ActionName>(action: A, params: ActionParams<A>, database: LernzeitDB = db): Promise<ActionResult<A>> {
  const handler: Handler<A> = handlers[action]
  return handler(params, database)
}

/** Runs a request from the MCP server and turns the outcome, error or not, into a response. */
export async function handleRequest({ id, action, params }: RequestMessage, database: LernzeitDB = db): Promise<ResponseMessage> {
  try {
    if (!Object.hasOwn(handlers, action)) throw invalid(`Unknown action "${action}".`)
    return { type: 'response', id, ok: true, result: await runAction(action, params, database) }
  } catch (error) {
    return { type: 'response', id, ok: false, error: toErrorBody(error) }
  }
}
