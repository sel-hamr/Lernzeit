/**
 * The messages between a Lernzeit tab and the MCP server in `mcp/`.
 *
 * Both sides import this file. The server runs it with Node's type stripping,
 * outside the Vite build, so it uses relative imports with extensions and only
 * erasable TypeScript.
 */
import type { CardType, Gender, Priority, TaskStatus } from '../db/types.ts'

export const PROTOCOL_VERSION = 1
export const DEFAULT_PORT = 47821
export const MAX_CARDS_PER_CALL = 100
export const MAX_STUDY_MINUTES = 12 * 60

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
  /** German text of the cards that were already in the deck. */
  skipped: string[]
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
  create_deck: { params: CreateDeckParams; result: CreateDeckResult }
  create_cards: { params: CreateCardsParams; result: CreateCardsResult }
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
