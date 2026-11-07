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

export type SessionSource = 'timer' | 'flashcards' | 'reading' | 'questions' | 'grammar'

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

/**
 * The names are from before language packs: "De" is the language you learn
 * and "En" your own, whatever they are.
 */
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
export type Tense = 'present' | 'past' | 'perfect'

/**
 * A verb's forms per tense, each a line of six forms for ich, du, er/sie/es,
 * wir, ihr, sie: "fahre, fährst, fährt, fahren, fahrt, fahren". A dash marks
 * a form that is not asked; a slash gives two right spellings. Grammar practice
 * asks these.
 */
export type Conjugation = Partial<Record<Tense, string>>
export type Gender = 'der' | 'die' | 'das'

export interface Card {
  id: string
  deckId: string
  type: CardType
  /** The meaning in your own language. Named from before language packs, like `german`. */
  english: string
  /**
   * The word or sentence in the language you learn. A German noun leaves its
   * article to `gender`; other languages write it here. Cloze cards use
   * {{word}} markers.
   */
  german: string
  gender?: Gender
  plural?: string
  verbForms?: string
  conjugation?: Conjugation
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

/**
 * How a review session went: `due` the cards due now, `practice` the round of
 * cards ahead of schedule when nothing was due, `all` every card the Review
 * dialog asked for, `picked` the cards picked in Flashcards, `card` one card.
 */
export type PracticeKind = 'due' | 'practice' | 'all' | 'picked' | 'card'

/** One deck's share of a practice session. */
export interface PracticeDeckTime {
  ms: number
  reviewed: number
  correct: number
}

/** One review session in Flashcards, saved after every rating. Practice history lists them. */
export interface PracticeRun {
  id: string
  kind: PracticeKind
  /** When the first card was shown. */
  start: number
  /** When the last card was rated. */
  end: number
  /** Time spent on the cards, at most two minutes each, like a review log's. */
  activeMs: number
  reviewed: number
  /** Hard, Good and Easy count as correct. */
  correct: number
  /** The directions the session was asked to practise; empty means every one. */
  directions: Direction[]
  /** Time and reviews per deck id. A deck that was deleted later keeps its share here. */
  decks: Record<string, PracticeDeckTime>
  /** Local date of `start`, YYYY-MM-DD. */
  day: string
}

export type StoryLevel ='A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2'

/** Why a word has its form in its sentence. */
export interface StoryWordGrammar {
  /** The rule, in one short sentence. */
  rule: string
  /** Why the rule applies in this sentence. */
  why: string
  /** A new sentence that uses the same rule. */
  example: { text: string; translation: string }
}

/** A teaching note on one word of a story, shown when the word is tapped. */
export interface StoryWord {
  /** As written in the story. */
  word: string
  /** The sentence the note is about, copied from the story. Editing that sentence turns the note off. */
  sentence: string
  /** Words of the same sentence that open this note too, such as the "ein" of "steigt ... ein". */
  alsoTap?: string[]
  /** Dictionary form. Nouns leave out the article and use `gender`. */
  baseForm: string
  gender?: Gender
  partOfSpeech: string
  /** Short meaning in your own language. */
  translation: string
  /** One simple line that explains the word. Easy words can do without. */
  meaning?: string
  /** Left out when the word's form has nothing to explain. */
  grammar?: StoryWordGrammar
  /** A short tip or memory trick. Easy words can do without. */
  tip?: string
}

export interface Story {
  id: string
  title: string
  /** In the language you learn. A blank line starts a new paragraph. */
  text: string
  /** Translation into your own language. Shown paragraph by paragraph when it has as many paragraphs as the text. */
  translation?: string
  level?: StoryLevel
  /** Reading time counts toward this topic. */
  topicId?: string
  tags: string[]
  /** Teaching notes from the AI. Stories without them show only cards in the word panel. */
  words?: StoryWord[]
  createdAt: number
  updatedAt: number
  /** Last time the story was opened in the reader. */
  openedAt?: number
  /** How many times it was marked as read. */
  readCount: number
}

export interface Question {
  id: string
  /** Group name, e.g. "Sich vorstellen". Practice takes one set or all of them. */
  set: string
  /** In the language you learn. */
  question: string
  english?: string
  /** The user's own answer, about their life. The one they practise. */
  myAnswer?: string
  /** A model answer from a starter set or the AI. */
  suggested?: string
  /** Useful words for an answer, offered as hints in practice. */
  words?: string[]
  level?: StoryLevel
  tags: string[]
  createdAt: number
  updatedAt: number
}

/** One answer typed in practice. Kept so you can see how your answers changed. */
export interface QuestionResponse {
  id: string
  questionId: string
  text: string
  at: number
}

/** gender: der / die / das; plural: type the plural; verbs: type a verb form. */
export type DrillKind = 'gender' | 'plural' | 'verbs'

/** How a card does in one drill. Drills have no FSRS schedule, only this. */
export interface DrillStat {
  /** `${cardId}:${drill}` */
  id: string
  cardId: string
  drill: DrillKind
  right: number
  wrong: number
  /** Raised by a wrong answer, lowered by a right one, never below 0. Higher comes up first. */
  score: number
  lastAt: number
}

/** A sentence in the language you learn (`de`) and its meaning in your own (`en`). */
export interface GrammarExample {
  de: string
  en?: string
}

/**
 * One exercise. The text says what kind it is:
 * - fill the gap: "Ich helfe {{dem}} Mann." ({{dem|den|der}} offers choices,
 *   the first one right; {{fandest/fandst}} accepts either spelling)
 * - find the mistake: "Ich helfe {{den>dem}} Mann." (shows den, the fix is dem)
 * - put the words in order: "~ Ich habe gestern Pizza gegessen." (" / " adds
 *   another right order)
 * - write the sentence: "Ich esse Pizza. (Perfekt) => Ich habe Pizza gegessen."
 */
export interface GrammarExercise {
  /** Stays the same while the text does, so its score is kept. */
  id: string
  text: string
  en?: string
  /** Why the answer is right, shown after answering. */
  why?: string
}

/** A card drill a topic also practises, with your own words. */
export interface TopicDrill {
  kind: DrillKind
  /** For verb questions: only this tense. */
  tense?: Tense
}

/** A grammar topic: the rule, examples and exercises. Stands on its own; `drill` adds questions from your cards. */
export interface GrammarTopic {
  id: string
  /** Name in the language you learn, e.g. "Der Dativ". */
  title: string
  english?: string
  /** Section on the Grammar page, e.g. "Cases". */
  group: string
  level?: StoryLevel
  /** One line under the title. */
  summary?: string
  /**
   * The explanation. Blank lines split paragraphs; "- " lines are a list,
   * "| a | b |" lines a table, "### " a heading, **bold** and *italic* inline.
   */
  rule: string
  examples: GrammarExample[]
  exercises: GrammarExercise[]
  drill?: TopicDrill
  createdAt: number
  updatedAt: number
}

/** How one exercise has gone, and when it comes back for review. */
export interface ExerciseStat {
  /** The exercise id. */
  id: string
  topicId: string
  right: number
  wrong: number
  score: number
  /** Right answers in a row. */
  streak: number
  lastAt: number
  /** When it is due for review: soon after a mistake, days later after right answers. */
  due: number
}

export type ImageFit = 'contain' | 'cover'

export interface StoredImage {
  id: string
  blob: Blob
  width: number
  height: number
  fit: ImageFit
}

/**
 * Audio made by an offline voice, kept so the same text is only made once.
 * Not part of backups: clips can always be made again.
 */
export interface SpeechClip {
  /** Voice id and text, see clipKey. */
  key: string
  blob: Blob
  /** blob.size, kept so the store can stay under its size limit without reading blobs. */
  bytes: number
  usedAt: number
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
/** Where audio comes from: the browser's voices or the offline Thorsten voice (German only). */
export type VoiceEngine = 'browser' | 'thorsten'
export type ThemePref = 'light' | 'dark' | 'system'

export interface Settings {
  /** Mode used by the "Start" buttons outside the timer page. */
  defaultTimerMode: TimerMode
  pomodoroFocus: number
  pomodoroBreak: number
  endSound: EndSound
  voiceEngine: VoiceEngine
  voiceURI?: string
  speechRate: number
  autoPlayAudio: boolean
  countReviewTime: boolean
  countReadingTime: boolean
  countQuestionTime: boolean
  countGrammarTime: boolean
  typingMode: boolean
  listeningMode: boolean
  theme: ThemePref
  remindersEnabled: boolean
  reminderTimes: string[]
  /** The language you learn: a pack code such as "fr". */
  learning: string
  /** Your own language, which meanings and explanations are written in. */
  native: string
  /** Levels installed from the pack, easiest first. */
  levels: StoryLevel[]
}

export interface KV {
  key: string
  value: unknown
}
