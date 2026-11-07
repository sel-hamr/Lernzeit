/**
 * The messages between a Lernzeit tab and the MCP server in `mcp/`.
 *
 * Both sides import this file. The server runs it with Node's type stripping,
 * outside the Vite build, so it uses relative imports with extensions and only
 * erasable TypeScript.
 */
import type { CardType, Conjugation, DocStatus, Gender, Priority, StoryLevel, StoryWord, TaskStatus } from '../db/types.ts'

export const PROTOCOL_VERSION = 1
export const DEFAULT_PORT = 47821
export const MAX_CARDS_PER_CALL = 100
/** Most cards list_cards returns at once; `offset` pages through the rest. */
export const MAX_CARDS_PER_LIST = 200
export const MAX_STUDY_MINUTES = 12 * 60
export const MAX_STORY_TITLE = 120
/** For the text and for the translation, each. About 3,000 words. */
export const MAX_STORY_CHARS = 20_000
/** Teaching notes on one story: enough for nearly every word of a story up to B1. */
export const MAX_STORY_WORDS = 150
/** For each text of a teaching note. */
export const MAX_STORY_WORD_TEXT = 300
/** For the sentence a teaching note copies from the story. */
export const MAX_STORY_SENTENCE = 1_000
export const MAX_QUESTIONS_PER_CALL = 50
export const MAX_SET_NAME = 60
/** For the question and for each answer. */
export const MAX_QUESTION_CHARS = 500
export const MAX_HINT_WORDS = 12
export const MAX_GRAMMAR_EXERCISES_PER_CALL = 50
export const MAX_GRAMMAR_EXAMPLES_PER_CALL = 20
/** For a topic's title, and for each exercise, example and explanation. */
export const MAX_GRAMMAR_TEXT = 300
export const MAX_RULE_CHARS = 8_000
export const MAX_DOC_TITLE = 200
/** About 30,000 words. */
export const MAX_DOC_CHARS = 200_000
/** Most docs list_docs returns at once; `offset` pages through the rest. */
export const MAX_DOCS_PER_LIST = 200

/** Page origins the server always accepts: the Vite dev server and `vite preview`. */
export const LOCAL_ORIGINS: readonly string[] = ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:4173', 'http://127.0.0.1:4173']

/** WebSocket close code sent to a tab when another browser connects with the same name. */
export const CLOSE_REPLACED = 4000

/* ------------------------------------------------------------- Actions ---- */

export interface TopicSummary {
  id: string
  name: string
}

export interface DeckSummary {
  id: string
  name: string
  /** Topic name. */
  topic?: string
  cards: number
}

export interface NewCard {
  english: string
  /** Without the article; cloze cards mark the gap with {{word}}. */
  german: string
  type?: CardType
  gender?: Gender
  plural?: string
  verbForms?: string
  /** Each tense as six forms for ich, du, er/sie/es, wir, ihr, sie. Grammar practice asks these. */
  conjugation?: Conjugation
  /** noun, verb, adjective… Only nouns are practised from the picture. */
  partOfSpeech?: string
  exampleDe?: string
  exampleEn?: string
  tags?: string[]
  emoji?: string
  imageQuery?: string
}

export interface CreateDeckParams {
  name: string
  /** Topic name or id. */
  topic?: string
}

export interface CreateDeckResult {
  deck: DeckSummary
  /** False when a deck with that name already existed. */
  created: boolean
}

export interface CreateCardsParams {
  /** Deck name or id. */
  deck: string
  cards: NewCard[]
}

export interface CreateCardsResult {
  deck: string
  added: number
  /** Text of the cards that were already in the deck. */
  skipped: string[]
}

export interface ListCardsParams {
  /** Deck name or id. Every deck when left out. */
  deck?: string
  /** Text to find in the German (with its article) or the English, ignoring case. */
  search?: string
  tag?: string
  /** Defaults to MAX_CARDS_PER_LIST. */
  limit?: number
  offset?: number
}

/** A card as the AI reads it: its contents, not its review history. */
export interface CardDetails {
  id: string
  /** Deck name. */
  deck: string
  type: CardType
  german: string
  english: string
  gender?: Gender
  plural?: string
  verbForms?: string
  conjugation?: Conjugation
  partOfSpeech?: string
  exampleDe?: string
  exampleEn?: string
  tags: string[]
  emoji?: string
  imageQuery?: string
  /** True when the card has an uploaded picture. */
  hasImage: boolean
}

export interface ListCardsResult {
  /** Cards that match, before limit and offset. */
  total: number
  offset: number
  cards: CardDetails[]
}

/** Each entry is a card id from list_cards, or its German text as in create_cards; a leading article is ignored for words. */
export interface DeleteCardsParams {
  /** Deck name or id. */
  deck: string
  cards: string[]
}

export interface DeleteCardsResult {
  deck: string
  /** German text of the deleted cards, as saved. */
  deleted: string[]
  /** Texts that matched no card in the deck. */
  notFound: string[]
}

export interface MoveCardsParams {
  /** Deck name or id the cards are in. */
  deck: string
  /** Deck name or id to move them to. */
  to: string
  /** Card ids or German texts, as in delete_cards. */
  cards: string[]
}

export interface MoveCardsResult {
  from: string
  to: string
  /** German text of the moved cards. */
  moved: string[]
  /** Cards left where they were, because the target deck has a card with the same text. */
  skipped: string[]
  notFound: string[]
}

export interface DeleteDeckParams {
  /** Deck name or id. */
  deck: string
  /** How many cards the deck has, from list_decks. The deck is kept when it has a different number. */
  cardCount: number
}

export interface DeleteDeckResult {
  deck: string
  /** Cards deleted with the deck. */
  deletedCards: number
}

export interface CreateStoryParams {
  title: string
  /** In the language you learn; an empty line starts a new paragraph. */
  text: string
  /** English translation with the same paragraphs. */
  translation?: string
  level?: StoryLevel
  tags?: string[]
  /** Topic name or id that reading time counts toward. */
  topic?: string
  /** Teaching notes, up to MAX_STORY_WORDS. They replace the notes of a story with the same text. */
  words?: StoryWord[]
}

export interface StorySummary {
  id: string
  title: string
  level?: StoryLevel
  words: number
  paragraphs: number
  /** Topic name. */
  topic?: string
}

export interface CreateStoryResult {
  story: StorySummary
  /** False when a story with the same text already existed. */
  created: boolean
  /** How the teaching notes went, when the call sent any. */
  words?: {
    saved: number
    /** Notes left out. The story is saved without them. */
    skipped: { word: string; sentence: string; reason: string }[]
  }
}

export interface NewQuestion {
  /** German question, e.g. "Was ist dein Beruf?" */
  question: string
  english?: string
  /** A model answer in German. The user writes their own answer in the app. */
  suggested?: string
  /** Useful words for an answer, shown as hints. */
  words?: string[]
  level?: StoryLevel
  tags?: string[]
}

export interface CreateQuestionsParams {
  /** Set name, e.g. "Arbeit". A new name starts a new set. */
  set: string
  questions: NewQuestion[]
}

export interface CreateQuestionsResult {
  set: string
  added: number
  /** Questions that were already in the set. */
  skipped: string[]
}

export interface GrammarTopicSummary {
  id: string
  /** German name, e.g. "Der Dativ". */
  title: string
  english?: string
  level?: StoryLevel
  /** Section on the Grammar page. */
  group: string
  exercises: number
}

export interface NewGrammarExercise {
  /**
   * One exercise: "Ich helfe {{dem|den|der}} Mann." (choices, the first one right),
   * "Du {{fährst}} zu schnell." (typed), "Ich helfe {{den>dem}} Mann." (find the
   * mistake), "~ Ich gebe dem Mann das Buch." (word order) or
   * "Ich esse Pizza. (Perfekt) => Ich habe Pizza gegessen." (write the sentence).
   */
  text: string
  en?: string
  /** One short sentence: why the answer is right. */
  why?: string
}

export interface AddGrammarParams {
  /** Title or id of a topic. A new title starts a new topic. */
  topic: string
  english?: string
  /** Section for a new topic, e.g. "Cases". Defaults to "My topics". */
  group?: string
  level?: StoryLevel
  summary?: string
  /** The explanation, for a new topic or one without a rule yet. */
  rule?: string
  examples?: { de: string; en?: string }[]
  exercises?: NewGrammarExercise[]
}

export interface AddGrammarResult {
  topic: GrammarTopicSummary
  created: boolean
  added: number
  /** Exercises the topic already had. */
  skipped: string[]
}

export interface DocSummary {
  id: string
  title: string
  /** Folder path like "Recipes/Italian". Empty at the top level. */
  folder: string
  tags: string[]
  status: DocStatus
  words: number
  /** Local date and time. */
  updatedAt: string
}

export interface ListDocsParams {
  /** Folder path, with the folders inside it. Every doc when left out. */
  folder?: string
  /** Text to find in the title, tags or text, ignoring case. */
  search?: string
  tag?: string
  /** Defaults to MAX_DOCS_PER_LIST. */
  limit?: number
  offset?: number
}

export interface ListDocsResult {
  /** Every folder path. */
  folders: string[]
  /** Docs that match, before limit and offset. */
  total: number
  offset: number
  docs: DocSummary[]
}

export interface ReadDocParams {
  /** Doc id or exact title. */
  doc: string
}

export interface DocDetails extends DocSummary {
  /** The Markdown text. */
  body: string
}

export interface CreateDocParams {
  /** Left out: the first heading, or else the first line of the text. */
  title?: string
  /** Markdown. */
  body: string
  /** Folder path like "Recipes/Italian". Folders that are missing are made. The top level when left out. */
  folder?: string
  tags?: string[]
}

export interface CreateDocResult {
  doc: DocSummary
  /** False when the folder already had a doc with the same text. */
  created: boolean
}

export interface CreateTaskParams {
  title: string
  description?: string
  priority?: Priority
  status?: TaskStatus
  /** YYYY-MM-DD */
  dueDate?: string
  /** Topic name or id. */
  topic?: string
}

export interface TaskSummary {
  id: string
  title: string
  status: TaskStatus
  priority: Priority
  dueDate?: string
  topic?: string
}

export interface LogStudyTimeParams {
  /** Topic name or id. */
  topic: string
  minutes: number
  /** Local date and time, e.g. 2026-10-15T08:30. Defaults to `minutes` ago. */
  start?: string
  note?: string
}

export interface SessionSummary {
  topic: string
  minutes: number
  /** Local date and time. */
  start: string
  end: string
}

type NoParams = Record<string, never>

/** What each action takes and returns. `list_browsers` is answered by the server itself. */
export interface ActionMap {
  list_topics: { params: NoParams; result: TopicSummary[] }
  list_decks: { params: NoParams; result: DeckSummary[] }
  list_cards: { params: ListCardsParams; result: ListCardsResult }
  create_deck: { params: CreateDeckParams; result: CreateDeckResult }
  create_cards: { params: CreateCardsParams; result: CreateCardsResult }
  move_cards: { params: MoveCardsParams; result: MoveCardsResult }
  delete_cards: { params: DeleteCardsParams; result: DeleteCardsResult }
  delete_deck: { params: DeleteDeckParams; result: DeleteDeckResult }
  create_story: { params: CreateStoryParams; result: CreateStoryResult }
  create_questions: { params: CreateQuestionsParams; result: CreateQuestionsResult }
  list_grammar_topics: { params: NoParams; result: GrammarTopicSummary[] }
  add_grammar: { params: AddGrammarParams; result: AddGrammarResult }
  list_docs: { params: ListDocsParams; result: ListDocsResult }
  read_doc: { params: ReadDocParams; result: DocDetails }
  create_doc: { params: CreateDocParams; result: CreateDocResult }
  create_task: { params: CreateTaskParams; result: TaskSummary }
  log_study_time: { params: LogStudyTimeParams; result: SessionSummary }
}

export type ActionName = keyof ActionMap
export type ActionParams<A extends ActionName> = ActionMap[A]['params']
export type ActionResult<A extends ActionName> = ActionMap[A]['result']

/* -------------------------------------------------------------- Errors ---- */

export type BridgeErrorCode =
  | 'no_browser'
  | 'pick_browser'
  | 'unknown_browser'
  | 'disconnected'
  | 'timeout'
  | 'port_in_use'
  | 'deck_not_found'
  | 'topic_not_found'
  | 'doc_not_found'
  | 'folder_not_found'
  | 'invalid_input'
  | 'internal'

export interface BridgeErrorBody {
  code: BridgeErrorCode
  message: string
}

/** An error whose message is written for the AI to read and act on. */
export class BridgeError extends Error {
  readonly code: BridgeErrorCode

  constructor(code: BridgeErrorCode, message: string) {
    super(message)
    this.name = 'BridgeError'
    this.code = code
  }
}

export function toErrorBody(error: unknown): BridgeErrorBody {
  if (error instanceof BridgeError) return { code: error.code, message: error.message }
  return { code: 'internal', message: error instanceof Error ? error.message : String(error) }
}

/* ------------------------------------------------------------ Messages ---- */

export type RejectReason = 'wrong_token' | 'unsupported_version' | 'invalid_hello'

/** First message from the tab. */
export interface HelloMessage {
  type: 'hello'
  version: number
  token: string
  /** Chosen by the user, e.g. "Chrome Personal". */
  name: string
  /** Detected browser, e.g. "Chrome". */
  kind: string
}

export interface WelcomeMessage {
  type: 'welcome'
}

export interface RejectedMessage {
  type: 'rejected'
  reason: RejectReason
}

export interface RequestMessage<A extends ActionName = ActionName> {
  type: 'request'
  id: string
  action: A
  params: ActionParams<A>
}

export type ResponseMessage =
  | { type: 'response'; id: string; ok: true; result: unknown }
  | { type: 'response'; id: string; ok: false; error: BridgeErrorBody }

/** Sent by the server. */
export type ServerMessage = WelcomeMessage | RejectedMessage | RequestMessage

/** Sent by the tab. */
export type AppMessage = HelloMessage | ResponseMessage

type Fields = Record<string, unknown>

const isFields = (value: unknown): value is Fields => typeof value === 'object' && value !== null && !Array.isArray(value)

function readFields(text: string): Fields | undefined {
  try {
    const value: unknown = JSON.parse(text)
    return isFields(value) ? value : undefined
  } catch {
    return undefined
  }
}

/** Checks the shape of a message from the server; anything else is `undefined`. */
export function parseServerMessage(text: string): ServerMessage | undefined {
  const m = readFields(text)
  switch (m?.type) {
    case 'welcome':
      return { type: 'welcome' }
    case 'rejected':
      return typeof m.reason === 'string' ? { type: 'rejected', reason: m.reason as RejectReason } : undefined
    case 'request':
      return typeof m.id === 'string' && typeof m.action === 'string' && isFields(m.params)
        ? { type: 'request', id: m.id, action: m.action as ActionName, params: m.params as ActionParams<ActionName> }
        : undefined
    default:
      return undefined
  }
}

/** Checks the shape of a message from a tab; anything else is `undefined`. */
export function parseAppMessage(text: string): AppMessage | undefined {
  const m = readFields(text)
  switch (m?.type) {
    case 'hello':
      return typeof m.version === 'number' && typeof m.token === 'string' && typeof m.name === 'string' && typeof m.kind === 'string'
        ? { type: 'hello', version: m.version, token: m.token, name: m.name, kind: m.kind }
        : undefined
    case 'response': {
      if (typeof m.id !== 'string') return undefined
      if (m.ok === true) return { type: 'response', id: m.id, ok: true, result: m.result }
      const error = m.error
      return m.ok === false && isFields(error) && typeof error.code === 'string' && typeof error.message === 'string'
        ? { type: 'response', id: m.id, ok: false, error: { code: error.code as BridgeErrorCode, message: error.message } }
        : undefined
    }
    default:
      return undefined
  }
}
