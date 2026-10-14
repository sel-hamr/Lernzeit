import type { Card, Gender } from '@/db/types'

const ARTICLE_RE = /^(der|die|das)\s+(.+)$/i

/** "der Hund" -> { gender: 'der', word: 'Hund' }. Leaves text without an article alone. */
export function splitArticle(text: string): { gender?: Gender; word: string } {
  const trimmed = text.trim()
  const match = ARTICLE_RE.exec(trimmed)
  // "der / die / das" is a list of articles, not a noun.
  if (!match || match[2].trim().startsWith('/')) return { word: trimmed }
  return { gender: match[1].toLowerCase() as Gender, word: match[2].trim() }
}

export const GENDER_LABEL: Record<Gender, string> = {
  der: 'masculine',
  die: 'feminine',
  das: 'neuter',
}

export interface Cloze {
  before: string
  answer: string
  after: string
  /** Sentence with the gap shown as ___ */
  masked: string
  /** Sentence without markers */
  full: string
}

const CLOZE_RE = /\{\{(.+?)\}\}/

/** Parses `Der Hund {{spielt}} im Garten.`; only the first marker is hidden. */
export function parseCloze(text: string): Cloze | null {
  const match = CLOZE_RE.exec(text)
  if (!match || match.index === undefined) return null
  const before = stripCloze(text.slice(0, match.index))
  const after = stripCloze(text.slice(match.index + match[0].length))
  const answer = match[1].trim()
  return { before, answer, after, masked: `${before}___${after}`, full: `${before}${answer}${after}` }
}

/** Removes {{ }} markers, keeping the words. */
export function stripCloze(text: string): string {
  return text.replace(/\{\{(.+?)\}\}/g, '$1')
}

type GermanFields = Pick<Card, 'type' | 'german' | 'gender' | 'plural' | 'partOfSpeech'>

/** Plural-only nouns such as "die Leute" have no gender of their own. */
export function isPluralOnly(card: GermanFields): boolean {
  return card.type === 'word' && !card.gender && card.partOfSpeech === 'noun' && !!card.plural
}

/** German text to speak or show for a card's main answer. */
export function germanText(card: GermanFields): string {
  if (card.type === 'cloze') return stripCloze(card.german)
  if (isPluralOnly(card)) return card.plural!
  return card.gender ? `${card.gender} ${card.german}` : card.german
}

/** Part-of-speech hint shown under a word: "noun", "verb", "adjective"… */
export function wordKind(card: Pick<Card, 'type' | 'gender' | 'verbForms' | 'german' | 'partOfSpeech'>): string {
  if (card.type === 'sentence') return 'sentence'
  if (card.type === 'cloze') return 'cloze'
  if (card.partOfSpeech) return card.partOfSpeech
  if (card.gender) return 'noun'
  if (card.verbForms) return 'verb'
  return card.german.trim().includes(' ') ? 'phrase' : 'word'
}

/** Nouns are concrete enough for "what is this picture?"; a verb emoji is too ambiguous. */
export function isNoun(card: Pick<Card, 'gender' | 'partOfSpeech'>): boolean {
  return !!card.gender || card.partOfSpeech === 'noun'
}
