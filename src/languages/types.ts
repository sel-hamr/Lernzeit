import type { CardType, Conjugation, DeckDirections, Gender, StoryLevel, TopicDrill } from '@/db/types'

/** A language code such as "de" or "ar" (ISO 639-1). */
export type LangCode = string

/**
 * Text the learner reads in their own language: a meaning, a translation, an
 * explanation. A plain string is English; a map gives it per native language,
 * such as `{ ar: '…', fr: '…' }`.
 */
export type Text = string | Partial<Record<LangCode, string>>

/** What the app knows about a pack without loading its content. */
export interface PackInfo {
  code: LangCode
  /** English name, shown in the app: "French". */
  name: string
  /** The name in the language itself: "Français". */
  endonym: string
  /** BCP 47 tag the browser voice speaks: "fr-FR". */
  speech: string
  /** Written right to left, like Arabic. */
  rtl?: boolean
  /** A short sentence to test the voice with. */
  sample: string
  /** Letters a keyboard may lack, offered as buttons when you type an answer: ä, ö, ü, ß. */
  letters?: string[]
  /** Native languages every meaning and explanation in the pack is written in. */
  natives: LangCode[]
  /** Levels the pack has content for, easiest first. */
  levels: StoryLevel[]
}

export interface PackDeck {
  /** Stays the same across versions: installing again finds the deck by it. */
  id: string
  name: string
  directions?: Partial<DeckDirections>
}

export interface PackCard {
  /** Prefixed with the language, "fr-0001", and never changed: installing again skips the ids it has. */
  id: string
  deckId: string
  level: StoryLevel
  type?: CardType
  /**
   * The word or sentence in the language you learn. German nouns leave the
   * article to `gender`; other languages write it: "le chien". Cloze cards
   * mark the hidden word: "Je {{suis}} étudiant."
   */
  text: string
  meaning: Text
  /** German only: der, die or das. */
  gender?: Gender
  plural?: string
  verbForms?: string
  /** German only: six forms per tense, for grammar practice. */
  conjugation?: Conjugation
  partOfSpeech?: string
  example?: string
  exampleMeaning?: Text
  tags?: string[]
  emoji?: string
  imageQuery?: string
  /** An SVG drawing (viewBox 0 0 120 90), stored as the card's picture. */
  art?: string
}

export interface PackStory {
  id: string
  level: StoryLevel
  title: string
  /** A blank line starts a new paragraph. */
  text: string
  /** Paragraph by paragraph, like the text. */
  translation?: Text
  tags?: string[]
}

export interface PackQuestion {
  id: string
  level: StoryLevel
  /** Set name in the language you learn: "Se présenter". */
  set: string
  question: string
  meaning?: Text
  suggested?: string
  words?: string[]
  tags?: string[]
}

export interface PackExercise {
  /** Stays the same while the text does, so its score is kept. */
  id: string
  /** In the editor's format, see GrammarExercise. */
  text: string
  meaning?: Text
  why?: Text
}

export interface PackGrammarTopic {
  id: string
  level: StoryLevel
  /** In the language you learn: "Le présent". */
  title: string
  meaning?: Text
  /** Section on the Grammar page, in English like the rest of the app: "Verbs". */
  group: string
  summary?: Text
  rule: Text
  examples: { text: string; meaning?: Text }[]
  exercises: PackExercise[]
  drill?: TopicDrill
}

/** Everything a pack installs, loaded only when a level is installed. */
export interface PackContent {
  decks: PackDeck[]
  cards: PackCard[]
  stories: PackStory[]
  questions: PackQuestion[]
  grammar: PackGrammarTopic[]
}
