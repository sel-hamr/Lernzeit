import type { Card, CardReview } from '@/db/types'
import { State } from './srs'

/*
 * Reading stories with your decks: split a German text into words, find the
 * cards each word is a form of, and say how well you know it.
 *
 * Matching is done on forms, not on grammar. Each card lists the forms it
 * stands for: the word itself, its plural and verb forms (as written on the
 * card), and the regular endings German adds to them. Forms written on the
 * card win over forms built from an ending, so "liebt" goes to lieben, not
 * to a guess from leben.
 */

/* --------------------------------------------------------------- Text ---- */

/** Letters, joined by hyphens: "Hund", "E-Mail", "Straße". */
const WORD_RE = /\p{L}+(?:-\p{L}+)*/gu
const SPACES_RE = /^\s+$/
const SENTENCE_END_RE = /[.!?…:]/

/** The lowercase key words are looked up by. Umlauts and ß stay: schon is not schön. */
export function lookupKey(text: string): string {
  return text.toLocaleLowerCase('de-DE')
}

/** Paragraphs are separated by an empty line; single line breaks join into one paragraph. */
export function splitParagraphs(text: string): string[] {
  return text
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s*\n\s*/g, ' ').trim())
    .filter(Boolean)
}

/** The translation paragraph for each text paragraph, or `null` when the two do not line up. */
export function alignTranslation(text: string, translation: string | undefined): string[] | null {
  if (!translation?.trim()) return null
  const de = splitParagraphs(text)
  const en = splitParagraphs(translation)
  return de.length === en.length ? en : null
}

export function countWords(text: string): number {
  return text.match(WORD_RE)?.length ?? 0
}

/** Minutes to read at a learner's pace of about 100 words a minute. */
export function readingMinutes(words: number): number {
  return Math.max(1, Math.round(words / 100))
}

/** A run of a paragraph: a word, or the spaces and punctuation between words. */
export interface Segment {
  text: string
  /** Offset in the paragraph. */
  start: number
  /** Lookup key; only words have one. */
  key?: string
}

export function tokenize(paragraph: string): Segment[] {
  const segments: Segment[] = []
  let last = 0
  for (const match of paragraph.matchAll(WORD_RE)) {
    if (match.index > last) segments.push({ text: paragraph.slice(last, match.index), start: last })
    segments.push({ text: match[0], start: match.index, key: lookupKey(match[0]) })
    last = match.index + match[0].length
  }
  if (last < paragraph.length) segments.push({ text: paragraph.slice(last), start: last })
  return segments
}

const SENTENCE_RE = /[^.!?…]+(?:[.!?…]+["'“”„»«)]*|$)/g

/** The sentence around `offset`, used as a new card's example. */
export function sentenceAt(paragraph: string, offset: number): string {
  for (const match of paragraph.matchAll(SENTENCE_RE)) {
    if (offset < match.index + match[0].length) return match[0].trim()
  }
  return paragraph.trim()
}

/* -------------------------------------------------------------- Forms ---- */

/** Written on the card: the word, its plural, its verb forms. */
const LISTED = 2
/** Built from a regular ending. */
const INFLECTED = 1

/** Sentence cards longer than this ("Wie spät ist es jetzt?") are not looked for in stories. */
const MAX_SENTENCE_WORDS = 3

export interface Form {
  /** Lookup keys, one per word: ["zu", "hause"] */
  words: string[]
  strength: number
}

export type LexCard = Pick<Card, 'id' | 'type' | 'german' | 'gender' | 'plural' | 'verbForms' | 'partOfSpeech'>

/** Present tense of verbs that do not follow the rules. Only these forms are used for them. */
const IRREGULAR_PRESENT: Record<string, string[]> = {
  sein: ['bin', 'bist', 'ist', 'sind', 'seid', 'wäre', 'wärst', 'wären', 'wärt'],
  haben: ['habe', 'hab', 'hast', 'hat', 'habt', 'hätte', 'hättest', 'hätten', 'hättet'],
  werden: ['werde', 'wirst', 'wird', 'werdet', 'würde', 'würdest', 'würden', 'würdet'],
  wissen: ['weiß', 'weißt', 'wisst'],
  tun: ['tue', 'tust', 'tut'],
  können: ['kann', 'kannst', 'könnt', 'könnte', 'könntest', 'könnten', 'könntet'],
  müssen: ['muss', 'musst', 'müsst', 'müsste', 'müsstest', 'müssten', 'müsstet'],
  dürfen: ['darf', 'darfst', 'dürft', 'dürfte', 'dürftest', 'dürften', 'dürftet'],
  wollen: ['will', 'willst', 'wollt'],
  sollen: ['soll', 'sollst', 'sollt'],
  mögen: ['mag', 'magst', 'mögt'],
}

/**
 * Verbs whose stem vowel changes in the du and er forms. Verbs built on them
 * change the same way: verlassen → verlässt, vergessen → vergisst.
 */
const STEM_CHANGE: Record<string, [du: string, er: string]> = {
  backen: ['bäckst', 'bäckt'],
  befehlen: ['befiehlst', 'befiehlt'],
  brechen: ['brichst', 'bricht'],
  empfehlen: ['empfiehlst', 'empfiehlt'],
  essen: ['isst', 'isst'],
  fahren: ['fährst', 'fährt'],
  fallen: ['fällst', 'fällt'],
  fangen: ['fängst', 'fängt'],
  geben: ['gibst', 'gibt'],
  gelten: ['giltst', 'gilt'],
  halten: ['hältst', 'hält'],
  helfen: ['hilfst', 'hilft'],
  laden: ['lädst', 'lädt'],
  lassen: ['lässt', 'lässt'],
  laufen: ['läufst', 'läuft'],
  lesen: ['liest', 'liest'],
  nehmen: ['nimmst', 'nimmt'],
  raten: ['rätst', 'rät'],
  schlafen: ['schläfst', 'schläft'],
  schlagen: ['schlägst', 'schlägt'],
  sehen: ['siehst', 'sieht'],
  sprechen: ['sprichst', 'spricht'],
  stehlen: ['stiehlst', 'stiehlt'],
  sterben: ['stirbst', 'stirbt'],
  stoßen: ['stößt', 'stößt'],
  tragen: ['trägst', 'trägt'],
  treffen: ['triffst', 'trifft'],
  treten: ['trittst', 'tritt'],
  wachsen: ['wächst', 'wächst'],
  waschen: ['wäschst', 'wäscht'],
  werfen: ['wirfst', 'wirft'],
}

/** A preposition joined with its article: im = in dem. */
const CONTRACTIONS: Record<string, string[]> = {
  an: ['am', 'ans'],
  auf: ['aufs'],
  bei: ['beim'],
  für: ['fürs'],
  in: ['im', 'ins'],
  über: ['übers'],
  um: ['ums'],
  von: ['vom'],
  zu: ['zum', 'zur'],
}

/** Object forms of personal pronouns that have no card of their own: er → ihn, ihm. */
const PRONOUN_CASES: Record<string, string[]> = {
  er: ['ihn', 'ihm'],
  es: ['ihm'],
  sie: ['ihnen'],
  ihr: ['euch'],
}

const ADJECTIVE_ENDINGS = ['e', 'en', 'em', 'er', 'es', 'ere', 'eren', 'erem', 'erer', 'eres', 'ste', 'sten']
const DETERMINER_ENDINGS = ['e', 'en', 'em', 'er', 'es']
const DETERMINER_POS = new Set(['article', 'possessive', 'question word'])
const DEFINITE = new Set(['der', 'die', 'das'])
/** Determiners whose -er is part of the stem: unser → unsere, not unse. */
const KEEP_ER = new Set(['unser', 'euer'])
/** Words that are not the verb itself: "ist gegangen", "freute sich". */
const VERB_HELPERS = new Set(['ist', 'hat', 'sich'])
const ARTICLE_PREFIX_RE = /^(?:der|die|das)\s+/i

/** Lookup keys of every word in `text`. */
function wordsOf(text: string): string[] {
  return (text.match(WORD_RE) ?? []).map(lookupKey)
}

/** "der / die / das (pl.)" -> ["der", "die", "das"] */
function alternatives(text: string): string[] {
  return text
    .replace(/\([^)]*\)/g, ' ')
    .split('/')
    .map((s) => s.trim())
    .filter(Boolean)
}

/** Collects forms, keeping the strongest when one is added twice. */
class FormSet {
  private readonly forms = new Map<string, Form>()

  add(words: string[], strength: number) {
    if (!words.length || words.some((w) => !w)) return
    const id = words.join(' ')
    const existing = this.forms.get(id)
    if (!existing || existing.strength < strength) this.forms.set(id, { words, strength })
  }

  addWord(word: string, strength: number) {
    this.add([word], strength)
  }

  list(): Form[] {
    return [...this.forms.values()]
  }
}

function addNoun(forms: FormSet, word: string) {
  // des Hundes, des Autos; weak nouns: der Junge → den Jungen.
  forms.addWord(`${word}s`, INFLECTED)
  forms.addWord(`${word}es`, INFLECTED)
  if (word.endsWith('e')) forms.addWord(`${word}n`, INFLECTED)
}

function addPlural(forms: FormSet, plural: string) {
  for (const alternative of alternatives(plural)) {
    const words = wordsOf(alternative.replace(ARTICLE_PREFIX_RE, ''))
    if (words.length !== 1) continue
    const [word] = words
    forms.addWord(word, LISTED)
    // Dative plural: mit den Kindern.
    if (!/[ns]$/.test(word)) forms.addWord(`${word}n`, INFLECTED)
  }
}

function addPresent(forms: FormSet, infinitive: string) {
  const irregular = IRREGULAR_PRESENT[infinitive]
  if (irregular) {
    for (const form of irregular) forms.addWord(form, INFLECTED)
    return
  }
  // wandern → wander-e, sammeln → sammle; gehen → geh-e; tun → tu-e.
  const elnErn = /e[lr]n$/.test(infinitive)
  const stem = elnErn || !infinitive.endsWith('en') ? infinitive.slice(0, -1) : infinitive.slice(0, -2)
  if (!stem) return
  const endings = elnErn ? ['', 'e', 'st', 't'] : ['', 'e', 'st', 't', 'est', 'et']
  for (const ending of endings) forms.addWord(stem + ending, INFLECTED)
  if (infinitive.endsWith('eln')) forms.addWord(`${infinitive.slice(0, -3)}le`, INFLECTED)

  const base = Object.keys(STEM_CHANGE)
    .filter((verb) => infinitive.endsWith(verb) && (infinitive.length === verb.length || infinitive.length - verb.length >= 2))
    .sort((a, b) => b.length - a.length)[0]
  if (base) {
    const prefix = infinitive.slice(0, -base.length)
    for (const form of STEM_CHANGE[base]) forms.addWord(prefix + form, INFLECTED)
  }
}

/** The one word of a verb form, without "ist", "hat" or "sich"; skips two-word forms such as "stand auf". */
function verbWord(part: string): string | undefined {
  const words = wordsOf(part).filter((w) => !VERB_HELPERS.has(w))
  return words.length === 1 ? words[0] : undefined
}

/** "gehen – ging – ist gegangen": the past tense with its endings, and the participle. */
function addVerbForms(forms: FormSet, verbForms: string) {
  const parts = verbForms.split(/\s*[–—]\s*|\s+-\s+|\s*[,;]\s*/)
  const [, past, participle] = parts
  for (const alternative of past ? alternatives(past) : []) {
    const word = verbWord(alternative)
    if (!word) continue
    forms.addWord(word, LISTED)
    const endings = word.endsWith('e') ? ['st', 'n', 't'] : ['st', 'en', 't']
    for (const ending of endings) forms.addWord(word + ending, INFLECTED)
  }
  for (const alternative of participle ? alternatives(participle) : []) {
    const word = verbWord(alternative)
    if (word) forms.addWord(word, LISTED)
  }
}

function addAdjective(forms: FormSet, word: string) {
  const stems = new Set([word.endsWith('e') ? word.slice(0, -1) : word])
  // dunkel → dunkle, teuer → teure
  if (word.length > 3 && /e[lr]$/.test(word)) stems.add(word.slice(0, -2) + word.slice(-1))
  for (const stem of stems) for (const ending of ADJECTIVE_ENDINGS) forms.addWord(stem + ending, INFLECTED)
}

function addDeterminer(forms: FormSet, word: string) {
  if (DEFINITE.has(word)) {
    for (const form of ['den', 'dem', 'des']) forms.addWord(form, INFLECTED)
    return
  }
  // dieser → dies-, eine → ein-, mein → mein-
  const strip = word.length > 3 && !KEEP_ER.has(word) && /(?:er|es|e)$/.test(word)
  const stem = strip ? word.replace(/(?:er|es|e)$/, '') : word
  for (const ending of DETERMINER_ENDINGS) forms.addWord(stem + ending, INFLECTED)
}

/** Every form a card stands for in a text. Cloze cards stand for none. */
export function cardForms(card: LexCard): Form[] {
  const forms = new FormSet()
  if (card.type === 'cloze') return []

  if (card.type === 'sentence') {
    for (const alternative of alternatives(card.german)) {
      const words = wordsOf(alternative)
      if (words.length <= MAX_SENTENCE_WORDS) forms.add(words, LISTED)
    }
    return forms.list()
  }

  const pos = card.partOfSpeech?.toLowerCase()
  const noun = !!card.gender || pos === 'noun'
  const verb = !noun && (pos === 'verb' || !!card.verbForms)

  for (const alternative of alternatives(card.german)) {
    const words = wordsOf(alternative)
    forms.add(words, LISTED)
    if (verb && words.length === 2 && words[0] === 'sich') {
      // "sich freuen": the verb on its own counts too.
      forms.addWord(words[1], LISTED)
      addPresent(forms, words[1])
    } else if (verb && words.length === 2) {
      // "spazieren gehen" splits in a sentence: "Wir gehen im Park spazieren."
      forms.addWord(words[0], INFLECTED)
    }
    if (words.length !== 1) continue
    const [word] = words
    if (noun) addNoun(forms, word)
    else if (verb) addPresent(forms, word)
    else if (pos === 'adjective') addAdjective(forms, word)
    else if (pos && DETERMINER_POS.has(pos)) addDeterminer(forms, word)
    else if (pos === 'pronoun') for (const form of PRONOUN_CASES[word] ?? []) forms.addWord(form, INFLECTED)
    else if (!pos || pos === 'preposition') for (const form of CONTRACTIONS[word] ?? []) forms.addWord(form, INFLECTED)
  }
  if (noun && card.plural) addPlural(forms, card.plural)
  if (verb && card.verbForms) addVerbForms(forms, card.verbForms)
  return forms.list()
}

/* ------------------------------------------------------------ Lexicon ---- */

interface LexEntry extends Form {
  cardId: string
  /** Written with a capital, as nouns and Sie are. It tells das Essen from essen, and Sie from sie. */
  capital: boolean
}

const STARTS_WITH_CAPITAL_RE = /^\P{L}*\p{Lu}/u

export interface Lexicon {
  /** Entries by their first word. */
  byFirst: Map<string, LexEntry[]>
  /** Longest phrase, in words. */
  maxWords: number
}

export function buildLexicon(cards: LexCard[]): Lexicon {
  const byFirst = new Map<string, LexEntry[]>()
  let maxWords = 1
  for (const card of cards) {
    const noun = card.type === 'word' && (!!card.gender || card.partOfSpeech?.toLowerCase() === 'noun')
    const capital = noun || STARTS_WITH_CAPITAL_RE.test(card.german)
    for (const form of cardForms(card)) {
      const entry: LexEntry = { ...form, cardId: card.id, capital }
      const list = byFirst.get(form.words[0])
      if (list) list.push(entry)
      else byFirst.set(form.words[0], [entry])
      maxWords = Math.max(maxWords, form.words.length)
    }
  }
  return { byFirst, maxWords }
}

/** A word or phrase of a paragraph, or the text between words. */
export interface Piece {
  text: string
  /** Offset in the paragraph. */
  start: number
  /** Running words in this piece: 0 for spaces and punctuation, 2 for "zu Hause". */
  words: number
  /** Cards this word or phrase is a form of, best first. */
  cardIds: string[]
}

/** The longest phrase starting at segment `i`, joined only by spaces. */
function longestMatch(segments: Segment[], i: number, lexicon: Lexicon): { end: number; entries: LexEntry[] } | undefined {
  const candidates = lexicon.byFirst.get(segments[i].key!)
  if (!candidates) return undefined
  // Words and gaps alternate, so the next word is two segments on.
  const run = [i]
  for (let j = i + 1; j + 1 < segments.length && run.length < lexicon.maxWords; j += 2) {
    if (!SPACES_RE.test(segments[j].text)) break
    run.push(j + 1)
  }
  for (let n = run.length; n >= 1; n--) {
    const keys = run.slice(0, n).map((index) => segments[index].key)
    const entries = candidates.filter((e) => e.words.length === n && e.words.every((w, k) => w === keys[k]))
    if (entries.length) return { end: run[n - 1], entries }
  }
  return undefined
}

/**
 * Best cards for a match. Mid-sentence, a capital points to cards written
 * with one (nouns, Sie) and a small letter to the rest; at the start of a
 * sentence either can be meant. Then forms written on the card beat forms
 * built from an ending.
 */
function rankEntries(entries: LexEntry[], surface: string, sentenceStart: boolean): string[] {
  const capital = STARTS_WITH_CAPITAL_RE.test(surface)
  let pool = entries
  if (!(capital && sentenceStart)) {
    const preferred = pool.filter((e) => e.capital === capital)
    if (preferred.length) pool = preferred
  }
  const top = Math.max(...pool.map((e) => e.strength))
  return [...new Set(pool.filter((e) => e.strength === top).map((e) => e.cardId))]
}

/** Splits a paragraph into pieces and finds the cards behind each word. */
export function annotate(paragraph: string, lexicon: Lexicon): Piece[] {
  const segments = tokenize(paragraph)
  const pieces: Piece[] = []
  let sentenceStart = true
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]
    if (!segment.key) {
      pieces.push({ text: segment.text, start: segment.start, words: 0, cardIds: [] })
      if (SENTENCE_END_RE.test(segment.text)) sentenceStart = true
      continue
    }
    const match = longestMatch(segments, i, lexicon)
    if (match) {
      const last = segments[match.end]
      pieces.push({
        text: paragraph.slice(segment.start, last.start + last.text.length),
        start: segment.start,
        words: (match.end - i) / 2 + 1,
        cardIds: rankEntries(match.entries, segment.text, sentenceStart),
      })
      i = match.end
    } else {
      pieces.push({ text: segment.text, start: segment.start, words: 1, cardIds: [] })
    }
    sentenceStart = false
  }
  return pieces
}

/* ---------------------------------------------------------- Knowledge ---- */

/** How well a card is known: never studied, being learned, or known for weeks. */
export type Knowledge = 'new' | 'learning' | 'known'
/** A word in a story: a card's knowledge, or `unknown` when no deck has it. */
export type WordStatus = Knowledge | 'unknown'

/** A card counts as known once a review is scheduled this many days out (Anki calls it mature). */
export const KNOWN_AFTER_DAYS = 21

const KNOWLEDGE_RANK: Record<Knowledge, number> = { new: 0, learning: 1, known: 2 }

export function cardKnowledge(reviews: Pick<CardReview, 'state' | 'fsrs'>[]): Knowledge {
  if (reviews.every((r) => r.state === State.New)) return 'new'
  if (reviews.some((r) => r.state === State.Review && r.fsrs.scheduled_days >= KNOWN_AFTER_DAYS)) return 'known'
  return 'learning'
}

/** The best knowledge among a word's cards: knowing one meaning of a word is knowing the word. */
export function wordStatus(cardIds: string[], knowledgeOf: (cardId: string) => Knowledge | undefined): WordStatus {
  let best: Knowledge | undefined
  for (const id of cardIds) {
    const k = knowledgeOf(id) ?? 'new'
    if (!best || KNOWLEDGE_RANK[k] > KNOWLEDGE_RANK[best]) best = k
  }
  return best ?? 'unknown'
}

export type Coverage = Record<WordStatus, number> & { words: number }

/** Running words by status. Readers need to know about 95% of a text's words to read it with ease. */
export function coverage(paragraphs: Piece[][], statusOf: (piece: Piece) => WordStatus): Coverage {
  const result: Coverage = { words: 0, known: 0, learning: 0, new: 0, unknown: 0 }
  for (const pieces of paragraphs) {
    for (const piece of pieces) {
      if (!piece.words) continue
      result.words += piece.words
      result[statusOf(piece)] += piece.words
    }
  }
  return result
}
