import Dexie, { type EntityTable, type Table } from 'dexie'
import type {
  ActiveTimer,
  Card,
  CardReview,
  Deck,
  Doc,
  DocFolder,
  DrillStat,
  ExerciseStat,
  GrammarTopic,
  KV,
  PracticeRun,
  Question,
  QuestionResponse,
  ReviewLog,
  Session,
  Settings,
  SpeechClip,
  StoredImage,
  Story,
  Task,
  Topic,
} from '@lernzeit/core/types'
import { splitSettings } from '@lernzeit/core/sync'
import { syncMiddleware } from '@/sync/outbox'

/** A row changed locally and not yet sent to the cloud. */
export interface OutboxEntry {
  tbl: string
  id: string
  at: number
  /**
   * Why the cloud cannot take this change as it is, such as a doc too large. Push skips it until
   * the record changes again, which rewrites the entry without it.
   */
  stuck?: string
}

/** Bookkeeping for this device: its id, sync cursors. */
export interface MetaRow {
  key: string
  value: unknown
}

export class LernzeitDB extends Dexie {
  topics!: EntityTable<Topic, 'id'>
  sessions!: EntityTable<Session, 'id'>
  decks!: EntityTable<Deck, 'id'>
  cards!: EntityTable<Card, 'id'>
  reviews!: EntityTable<CardReview, 'id'>
  reviewLogs!: EntityTable<ReviewLog, 'id'>
  images!: EntityTable<StoredImage, 'id'>
  tasks!: EntityTable<Task, 'id'>
  stories!: EntityTable<Story, 'id'>
  questions!: EntityTable<Question, 'id'>
  responses!: EntityTable<QuestionResponse, 'id'>
  clips!: EntityTable<SpeechClip, 'key'>
  drillStats!: EntityTable<DrillStat, 'id'>
  grammarTopics!: EntityTable<GrammarTopic, 'id'>
  exerciseStats!: EntityTable<ExerciseStat, 'id'>
  practiceRuns!: EntityTable<PracticeRun, 'id'>
  docFolders!: EntityTable<DocFolder, 'id'>
  docs!: EntityTable<Doc, 'id'>
  kv!: EntityTable<KV, 'key'>
  outbox!: Table<OutboxEntry, [string, string]>
  meta!: EntityTable<MetaRow, 'key'>

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
    // Later versions list only the tables they add or change.
    this.version(2).stores({
      stories: 'id, createdAt',
    })
    this.version(3).stores({
      questions: 'id, set, createdAt',
      responses: 'id, questionId, at',
    })
    this.version(4).stores({
      clips: 'key, usedAt',
    })
    this.version(5).stores({
      drillStats: 'id, cardId, drill',
    })
    this.version(6).stores({
      grammarTopics: 'id, group, createdAt',
      exerciseStats: 'id, topicId',
    })
    this.version(7).stores({
      practiceRuns: 'id, start',
    })
    this.version(8).stores({
      docFolders: 'id, parentId',
      docs: 'id, folderId, openedAt, updatedAt, *tags',
    })
    this.version(9).stores({
      outbox: '[tbl+id], at',
      meta: 'key',
    })
    // Every write to a synced table rewrites an outbox entry, and an index on `at` made each rewrite
    // cost a scan in the test database (fake-indexeddb). The engine sorts the outbox itself.
    this.version(10).stores({
      outbox: '[tbl+id]',
    })
    // Records every local write to a synced table in `outbox` (src/sync/outbox.ts).
    this.use(syncMiddleware)
  }
}

export const db = new LernzeitDB()

export const DEFAULT_SETTINGS: Settings = {
  defaultTimerMode: 'countdown',
  pomodoroFocus: 25,
  pomodoroBreak: 5,
  endSound: 'bell',
  voiceEngine: 'browser',
  speechRate: 0.95,
  autoPlayAudio: true,
  countReviewTime: true,
  countReadingTime: true,
  countQuestionTime: true,
  countGrammarTime: true,
  typingMode: false,
  listeningMode: false,
  theme: 'light',
  remindersEnabled: false,
  reminderTimes: ['18:00'],
  levels: [],
  hiddenFeatures: [],
}

export const KV_KEYS = {
  settings: 'settings',
  /** Settings that stay on this device: voice, theme, reminders. */
  deviceSettings: 'deviceSettings',
  activeTimer: 'activeTimer',
  pendingNote: 'pendingNote',
  /** Set by the first-launch German seed from before language packs, and by restoring a backup. */
  seeded: 'seeded',
  remindersFired: 'remindersFired',
  starterConjugations: 'starterConjugations',
  starterGrammar: 'starterGrammar',
  /** What an empty browser chose at its first visit: the starter backup, or to start empty. */
  starterOffer: 'starterOffer',
  /** The tour of the app: 'pending' while it should run, 'seen' once it was finished or closed. */
  tour: 'tour',
} as const

/** Defaults, then the shared settings, then this device's own. Old installs kept everything in `settings`, so it still answers for device keys not yet in `deviceSettings`. */
export function mergeSettings(shared: unknown, device: unknown): Settings {
  const s = (shared as Partial<Settings> | undefined) ?? {}
  const d = (device as Partial<Settings> | undefined) ?? {}
  const legacy = splitSettings(s).device
  return { ...DEFAULT_SETTINGS, ...s, ...legacy, ...d }
}

export async function getSettings(database: LernzeitDB = db): Promise<Settings> {
  const [shared, device] = await Promise.all([database.kv.get(KV_KEYS.settings), database.kv.get(KV_KEYS.deviceSettings)])
  return mergeSettings(shared?.value, device?.value)
}

export async function updateSettings(patch: Partial<Settings>, database: LernzeitDB = db) {
  const { shared, device } = splitSettings(patch)
  await database.transaction('rw', database.kv, async () => {
    if (Object.keys(shared).length) {
      const row = await database.kv.get(KV_KEYS.settings)
      await database.kv.put({ key: KV_KEYS.settings, value: { ...(row?.value as object | undefined), ...shared } })
    }
    if (Object.keys(device).length) {
      const row = await database.kv.get(KV_KEYS.deviceSettings)
      await database.kv.put({ key: KV_KEYS.deviceSettings, value: { ...(row?.value as object | undefined), ...device } })
    }
  })
}

export async function getActiveTimer(database: LernzeitDB = db): Promise<ActiveTimer | undefined> {
  const row = await database.kv.get(KV_KEYS.activeTimer)
  return (row?.value as ActiveTimer | undefined) ?? undefined
}

export function newId(): string {
  return crypto.randomUUID()
}
