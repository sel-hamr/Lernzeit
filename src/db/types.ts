export type WeekdayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'
export type WeekGoals = Record<WeekdayKey, number>

export type TopicColor = 'sage' | 'blue' | 'clay' | 'sand' | 'rose' | 'teal' | 'lilac' | 'stone'

export interface Topic {
  id: string
  name: string
  color: TopicColor
  /** Current goal per weekday, in minutes. */
  goalMinutes: WeekGoals
  /**
   * Goals as they were over time, oldest first. Lets History judge past days
   * against the goal that applied then, not today's goal.
   */
  goalHistory: { since: string; goals: WeekGoals }[]
  archived: boolean
  order: number
  createdAt: number
}

export type SessionSource = 'timer' | 'flashcards'

export interface Session {
  id: string
  topicId: string
  /** Timestamp ms */
  start: number
  /** Timestamp ms */
  end: number
  /** Minutes actually studied (pauses excluded). May be fractional. */
  minutes: number
  /** Local date, YYYY-MM-DD */
  date: string
  note?: string
  source: SessionSource
  /** Shared by the parts of one run that was split at midnight. */
  runId?: string
}

export type TimerMode = 'countdown' | 'pomodoro' | 'free'
export type TimerPhase = 'focus' | 'break'

export interface ActiveTimer {
  runId: string
  topicId: string
  mode: TimerMode
  /** Start of the current phase. Elapsed time is always derived from timestamps. */
  startedAt: number
  pausedAt?: number
  pausedTotalMs: number
  /** Countdown length, or pomodoro focus length. */
  targetMinutes?: number
  breakMinutes?: number
  phase: TimerPhase
  /** Pomodoro round, starting at 1. */
  cycle: number
  /** When the whole run began, for the page subtitle. */
  firstStartedAt: number
  note: string
}

export type Direction = 'imageToDe' | 'enToDe' | 'deToEn' | 'cloze'
export type DeckDirections = { imageToDe: boolean; enToDe: boolean; deToEn: boolean }

export interface Deck {
  id: string
  name: string
  /** Review time and the deck dot colour come from this topic. */
  topicId?: string
  newPerDay: number
  reviewsPerDay: number
  directions: DeckDirections
  order: number
  createdAt: number
}

export type CardType = 'word' | 'sentence' | 'cloze'
export type Gender = 'der' | 'die' | 'das'

export interface Card {
  id: string
  deckId: string
  type: CardType
  english: string
  /** Word without its article. Cloze cards use {{word}} markers. */
  german: string
  gender?: Gender
  plural?: string
  verbForms?: string
  exampleDe?: string
  exampleEn?: string
  imageId?: string
  /** Shown as the picture when there is no uploaded image. */
  emoji?: string
  /** noun, verb, adjective… (from imported packs) */
  partOfSpeech?: string
  /** Search words for finding a real photo later. */
  imageQuery?: string
  tags: string[]
  createdAt: number
  updatedAt: number
}

/** FSRS card state with dates stored as timestamps (JSON and IndexedDB friendly). */
export interface StoredFsrs {
  due: number
  stability: number
  difficulty: number
  elapsed_days: number
  scheduled_days: number
  learning_steps: number
  reps: number
  lapses: number
  state: number
  last_review?: number
}

export interface CardReview {
  /** `${cardId}:${direction}` */
  id: string
  cardId: string
  deckId: string
  direction: Direction
  fsrs: StoredFsrs
  due: number
  state: number
}

export type Grade = 1 | 2 | 3 | 4

export interface ReviewLog {
  id: string
  reviewId: string
  cardId: string
  deckId: string
  direction: Direction
  rating: Grade
  /** FSRS state before this review; 0 means it was a new card. */
  prevState: number
  reviewedAt: number
  durationMs: number
  day: string
}

export type ImageFit = 'contain' | 'cover'

export interface StoredImage {
  id: string
  blob: Blob
  width: number
  height: number
  fit: ImageFit
}

export type Priority = 'high' | 'medium' | 'low'
export type TaskStatus = 'backlog' | 'todo' | 'doing' | 'done'

export interface Task {
  id: string
  title: string
  description?: string
  topicId?: string
  priority: Priority
  status: TaskStatus
  order: number
  dueDate?: string
  createdAt: number
  doneAt?: number
}

export type EndSound = 'bell' | 'chime' | 'none'
export type ThemePref = 'light' | 'dark' | 'system'

export interface Settings {
  /** Mode used by the "Start" buttons outside the timer page. */
  defaultTimerMode: TimerMode
  pomodoroFocus: number
  pomodoroBreak: number
  endSound: EndSound
  voiceURI?: string
  speechRate: number
  autoPlayAudio: boolean
  countReviewTime: boolean
  typingMode: boolean
  listeningMode: boolean
  theme: ThemePref
  remindersEnabled: boolean
  reminderTimes: string[]
}

export interface KV {
  key: string
  value: unknown
}
