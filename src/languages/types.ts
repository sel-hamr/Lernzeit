import type { CardType, Conjugation, DeckDirections, Gender, StoryLevel, TopicDrill } from '@/db/types'

/** What the app knows about a pack without loading its content. */
export interface PackInfo {
  /** Shown in the app: "German". */
  name: string
  /** BCP 47 tag the browser voice speaks: "de-DE". */
  speech: string
  /** A short sentence to test the voice with. */
  sample: string
  /** Letters a keyboard may lack, offered as buttons when you type an answer: ä, ö, ü, ß. */
  letters: string[]
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
  /** Never changed: installing again skips the ids it has. */
  id: string
  deckId: string
  level: StoryLevel
  type?: CardType
  /** The word or sentence. Nouns leave the article to `gender`. Cloze cards mark the hidden word: "Der Hund {{spielt}} im Garten." */
  text: string
  meaning: string
  /** der, die or das. */
  gender?: Gender
  plural?: string
  verbForms?: string
  /** Six forms per tense, for grammar practice. */
  conjugation?: Conjugation
  partOfSpeech?: string
  example?: string
  exampleMeaning?: string
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
  translation?: string
  tags?: string[]
}

export interface PackQuestion {
  id: string
  level: StoryLevel
  /** Set name in German: "Sich vorstellen". */
  set: string
  question: string
  meaning?: string
  suggested?: string
  words?: string[]
  tags?: string[]
}

export interface PackExercise {
  /** Stays the same while the text does, so its score is kept. */
  id: string
  /** In the editor's format, see GrammarExercise. */
  text: string
  meaning?: string
  why?: string
}

export interface PackGrammarTopic {
  id: string
  level: StoryLevel
  /** In German: "Der Dativ". */
  title: string
  meaning?: string
  /** Section on the Grammar page: "Verbs". */
  group: string
  summary?: string
  rule: string
  examples: { text: string; meaning?: string }[]
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
