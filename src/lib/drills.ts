import type { Card, DrillKind, DrillStat, Gender, Tense } from '@/db/types'
import { checkAnswer, diffChars, type CheckResult } from './answer'
import { formsOf, isImpersonal, PERSONS, TENSES, type Person } from './conjugation'
import { splitArticle } from './german'

/*
 * Questions about your own cards, for grammar practice: the gender, plural
 * and conjugation written on them. Each card keeps a score per drill, and
 * the words you get wrong come first.
 */

/** How many cards a round asks when a topic has no exercises of its own. */
export const ROUND_SIZE = 15
/** A wrong answer comes back after this many other questions. */
export const RETRY_GAP = 3
/** How often a word comes back in one round. */
export const MAX_RETRIES = 2

export const PERSON_LABEL: Record<Person, string> = {
  ich: 'ich',
  du: 'du',
  er: 'er/sie/es',
  wir: 'wir',
  ihr: 'ihr',
  sie: 'sie (they)',
}

export const TENSE_LABEL: Record<Tense, string> = {
  present: 'Present',
  past: 'Past',
  perfect: 'Perfect',
}

/** Pronouns you may type before a verb form: "du fährst" is as right as "fährst". */
const PRONOUNS: Record<Person, string[]> = {
  ich: ['ich'],
  du: ['du'],
  er: ['er', 'sie', 'es', 'man'],
  wir: ['wir'],
  ihr: ['ihr'],
  sie: ['sie'],
}

export type DrillQuestion =
  | { kind: 'gender'; cardId: string; answer: Gender }
  /** answer: "die Hunde" */
  | { kind: 'plural'; cardId: string; answer: string }
  | { kind: 'verbs'; cardId: string; infinitive: string; person: Person; tense: Tense; answers: string[]; impersonal: boolean }


const PLURAL_RE = /^\p{L}+(?:[- ]\p{L}+)*$/u

/** "die Hunde" or "Hunde" → "die Hunde"; a dash or a note is no plural. */
function pluralAnswer(plural: string | undefined): string | undefined {
  const { gender, word } = splitArticle(plural ?? '')
  if ((gender && gender !== 'die') || !PLURAL_RE.test(word)) return undefined
  return `die ${word}`
}

/** Every question a drill can ask about a card; none when the card lacks the field. `tense` keeps only that tense's verb forms. */
export function drillQuestions(card: Card, kind: DrillKind, only?: Tense): DrillQuestion[] {
  if (card.type !== 'word') return []
  if (kind === 'gender') return card.gender ? [{ kind, cardId: card.id, answer: card.gender }] : []
  if (kind === 'plural') {
    const answer = card.gender ? pluralAnswer(card.plural) : undefined
    return answer ? [{ kind, cardId: card.id, answer }] : []
  }
  const { conjugation } = card
  if (!conjugation) return []
  const impersonal = isImpersonal(conjugation)
  const questions: DrillQuestion[] = []
  for (const tense of TENSES) {
    if (only && only !== tense) continue
    formsOf(conjugation[tense])?.forEach((answers, i) => {
      if (answers) questions.push({ kind, cardId: card.id, infinitive: card.german, person: PERSONS[i], tense, answers, impersonal })
    })
  }
  return questions
}

export function choose<T>(items: T[], random: () => number): T {
  return items[Math.min(items.length - 1, Math.floor(random() * items.length))]
}

/** A question about the card. For verbs a tense is picked first, so each tense comes up as often. */
export function pickQuestion(card: Card, kind: DrillKind, random: () => number = Math.random, only?: Tense): DrillQuestion | undefined {
  const questions = drillQuestions(card, kind, only)
  if (questions.length <= 1) return questions[0]
  const tenses = [...new Set(questions.map((q) => (q.kind === 'verbs' ? q.tense : undefined)))]
  const tense = choose(tenses, random)
  return choose(questions.filter((q) => q.kind === 'verbs' && q.tense === tense), random)
}

export function shuffle<T>(items: T[], random: () => number): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/** How a word or an exercise has gone so far. */
export interface Progress {
  score: number
  lastAt: number
}

/**
 * Orders things to practise: the ones you get wrong first (highest score),
 * then ones not practised yet, in random order, then the rest, longest ago first.
 */
export function orderByNeed<T>(items: T[], progressOf: (item: T) => Progress | undefined, random: () => number = Math.random): T[] {
  const weak: T[] = []
  const fresh: T[] = []
  const known: T[] = []
  for (const item of items) {
    const progress = progressOf(item)
    if (!progress) fresh.push(item)
    else if (progress.score > 0) weak.push(item)
    else known.push(item)
  }
  const score = (item: T) => progressOf(item)?.score ?? 0
  const lastAt = (item: T) => progressOf(item)?.lastAt ?? 0
  weak.sort((a, b) => score(b) - score(a) || lastAt(a) - lastAt(b))
  known.sort((a, b) => lastAt(a) - lastAt(b))
  return [...weak, ...shuffle(fresh, random), ...known]
}

/** The cards for a round of a drill, ordered by need. `only` keeps verbs that have that tense. */
export function pickRound(
  cards: Card[],
  kind: DrillKind,
  stats: Map<string, DrillStat>,
  random: () => number = Math.random,
  size = ROUND_SIZE,
  only?: Tense,
): Card[] {
  const fitting = cards.filter((card) => drillQuestions(card, kind, only).length)
  return orderByNeed(fitting, (card) => stats.get(card.id), random).slice(0, size)
}

/** Brings the question at `index` back RETRY_GAP questions later, or last when fewer are left. */
export function requeue<T extends { attempt: number }>(items: T[], index: number): T[] {
  const item = items[index]
  if (!item || item.attempt >= MAX_RETRIES) return items
  const at = Math.min(index + 1 + RETRY_GAP, items.length)
  return [...items.slice(0, at), { ...item, attempt: item.attempt + 1 }, ...items.slice(at)]
}

export interface DrillResult {
  correct: boolean
  /** For typed answers: the verdict and the letters that differ. */
  check?: CheckResult
}

const RANK: Record<CheckResult['verdict'], number> = { exact: 0, close: 1, wrong: 2 }

/** Checks an answer. ue for ü and lowercase are fine; a missing umlaut is not, because that is what is drilled. */
export function checkDrill(question: DrillQuestion, answer: string): DrillResult {
  if (question.kind === 'gender') return { correct: answer === question.answer }

  if (question.kind === 'plural') {
    const expected = splitArticle(question.answer).word
    const typed = splitArticle(answer)
    if (typed.gender && typed.gender !== 'die') {
      return { correct: false, check: { verdict: 'wrong', notes: ['The plural article is always die'], diff: diffChars(typed.word, expected) } }
    }
    const check = checkAnswer(typed.word, expected, { missingUmlaut: false })
    return { correct: check.verdict !== 'wrong', check }
  }

  const words = answer.trim().split(/\s+/)
  const typed = words.length > 1 && PRONOUNS[question.person].includes(words[0].toLowerCase()) ? words.slice(1).join(' ') : answer
  const checks = question.answers.map((a) => checkAnswer(typed, a, { missingUmlaut: false }))
  const best = checks.reduce((a, b) => (RANK[b.verdict] < RANK[a.verdict] ? b : a))
  // A wrong answer is shown against the spelling the drill shows.
  const check = best.verdict === 'wrong' ? checks[0] : best
  return { correct: check.verdict !== 'wrong', check }
}

/** The answer as said aloud: "die Hunde", "du fährst", "es regnet". */
export function spokenAnswer(question: DrillQuestion): string {
  if (question.kind === 'plural') return question.answer
  if (question.kind === 'gender') return question.answer
  const pronoun = question.person === 'er' ? (question.impersonal ? 'es' : 'er') : question.person
  return `${pronoun} ${question.answers[0]}`
}

/** The score after one answer: wrong raises it by 2, right lowers it by 1, never below 0. */
export function scoreAfter(score: number, correct: boolean): number {
  return correct ? Math.max(0, score - 1) : score + 2
}

/** A card's stat after one answer. */
export function nextStat(previous: DrillStat | undefined, cardId: string, drill: DrillKind, correct: boolean, now: number): DrillStat {
  const score = previous?.score ?? 0
  return {
    id: `${cardId}:${drill}`,
    cardId,
    drill,
    right: (previous?.right ?? 0) + (correct ? 1 : 0),
    wrong: (previous?.wrong ?? 0) + (correct ? 0 : 1),
    score: scoreAfter(score, correct),
    lastAt: now,
  }
}
