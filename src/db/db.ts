import Dexie, { type EntityTable } from 'dexie'
import type {
  ActiveTimer,
  Card,
  CardReview,
  Deck,
  KV,
  ReviewLog,
  Session,
  Settings,
  StoredImage,
  Task,
  Topic,
} from './types'

export class LernzeitDB extends Dexie {
  topics!: EntityTable<Topic, 'id'>
  sessions!: EntityTable<Session, 'id'>
  decks!: EntityTable<Deck, 'id'>
  cards!: EntityTable<Card, 'id'>
  reviews!: EntityTable<CardReview, 'id'>
  reviewLogs!: EntityTable<ReviewLog, 'id'>
  images!: EntityTable<StoredImage, 'id'>
  tasks!: EntityTable<Task, 'id'>
  kv!: EntityTable<KV, 'key'>

  constructor(name = 'lernzeit') {
    super(name)
    this.version(1).stores({
      topics: 'id, order',
      sessions: 'id, topicId, date, start, runId',
      decks: 'id, order',
      cards: 'id, deckId, createdAt, type, *tags',
      reviews: 'id, cardId, deckId, due, state',
      reviewLogs: 'id, reviewId, cardId, deckId, reviewedAt, day',
      images: 'id',
      tasks: 'id, status, order, dueDate, topicId',
      kv: 'key',
    })
  }
}

export const db = new LernzeitDB()

export const DEFAULT_SETTINGS: Settings = {
  defaultTimerMode: 'countdown',
  pomodoroFocus: 25,
  pomodoroBreak: 5,
  endSound: 'bell',
  speechRate: 0.95,
  autoPlayAudio: true,
  countReviewTime: true,
  typingMode: false,
  listeningMode: false,
  theme: 'light',
  remindersEnabled: false,
  reminderTimes: ['18:00'],
}

export const KV_KEYS = {
  settings: 'settings',
  activeTimer: 'activeTimer',
  pendingNote: 'pendingNote',
  seeded: 'seeded',
  remindersFired: 'remindersFired',
  bridge: 'bridge',
} as const

export async function getSettings(database: LernzeitDB = db): Promise<Settings> {
  const row = await database.kv.get(KV_KEYS.settings)
  return { ...DEFAULT_SETTINGS, ...((row?.value as Partial<Settings>) ?? {}) }
}

export async function updateSettings(patch: Partial<Settings>, database: LernzeitDB = db) {
  await database.transaction('rw', database.kv, async () => {
    const current = await getSettings(database)
    await database.kv.put({ key: KV_KEYS.settings, value: { ...current, ...patch } })
  })
}

export async function getActiveTimer(database: LernzeitDB = db): Promise<ActiveTimer | undefined> {
  const row = await database.kv.get(KV_KEYS.activeTimer)
  return (row?.value as ActiveTimer | undefined) ?? undefined
}

export function newId(): string {
  return crypto.randomUUID()
}
