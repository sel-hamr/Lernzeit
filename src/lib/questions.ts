import type { Question, QuestionResponse } from '@/db/types'
import { checkAnswer, type DiffPart } from './answer'

/** Sets in the order their first question was added, each with its questions oldest first. */
export function groupBySet<Q extends Pick<Question, 'set' | 'createdAt'>>(questions: Q[]): { set: string; questions: Q[] }[] {
  const groups = new Map<string, Q[]>()
  for (const q of [...questions].sort((a, b) => a.createdAt - b.createdAt)) {
    const group = groups.get(q.set)
    if (group) group.push(q)
    else groups.set(q.set, [q])
  }
  return [...groups].map(([set, items]) => ({ set, questions: items }))
}

/** When each question was last answered. */
export function lastAnswered(responses: Pick<QuestionResponse, 'questionId' | 'at'>[]): Map<string, number> {
  const last = new Map<string, number>()
  for (const r of responses) last.set(r.questionId, Math.max(last.get(r.questionId) ?? 0, r.at))
  return last
}

/**
 * The order to practise in: questions never answered first, in list order,
 * then the ones answered longest ago. With no grades, this is what brings
 * every question back in turn.
 */
export function practiceOrder<Q extends Pick<Question, 'id' | 'set' | 'createdAt'>>(questions: Q[], answeredAt: Map<string, number>): Q[] {
  const listed = groupBySet(questions).flatMap((g) => g.questions)
  const position = new Map(listed.map((q, i) => [q.id, i]))
  return listed.sort((a, b) => (answeredAt.get(a.id) ?? 0) - (answeredAt.get(b.id) ?? 0) || position.get(a.id)! - position.get(b.id)!)
}

export type Comparison =
  | { kind: 'same' }
  /** Small slips, shown letter by letter. */
  | { kind: 'close'; notes: string[]; diff: DiffPart[] }
  /** Another sentence altogether, which is fine for a personal question. */
  | { kind: 'different' }

/** Share of the longer text that lines up letter for letter. */
function similarity(diff: DiffPart[]): number {
  let same = 0
  let typed = 0
  let target = 0
  for (const part of diff) {
    const n = [...part.text].length
    if (part.kind === 'ok') same += n
    if (part.kind !== 'missing') typed += n
    if (part.kind !== 'extra') target += n
  }
  return same / Math.max(typed, target, 1)
}

/** How close enough counts as a slip rather than a different answer. */
const CLOSE_ENOUGH = 0.75

/** Compares what was typed with the user's own answer. */
export function compareWithAnswer(typed: string, answer: string): Comparison {
  const check = checkAnswer(typed, answer)
  if (check.verdict === 'exact') return { kind: 'same' }
  if (check.verdict === 'close' || similarity(check.diff) >= CLOSE_ENOUGH) return { kind: 'close', notes: check.notes, diff: check.diff }
  return { kind: 'different' }
}

/** The same order every time for the same seed, so hint chips do not jump about. */
function seededShuffle<T>(items: T[], seed: string): T[] {
  let h = 2166136261
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619)
  const random = () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909)
    return ((h ^= h >>> 16) >>> 0) / 4294967296
  }
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/**
 * Words to offer as hints: the question's useful words, then the words of
 * your own answer (or the suggested one) in a shuffled order, each once.
 */
export function hintWords(question: Pick<Question, 'id' | 'words' | 'myAnswer' | 'suggested'>): string[] {
  const answer = (question.myAnswer ?? question.suggested ?? '')
    .split(/\s+/)
    .map((w) => w.replace(/^[.,!?;:"„“”«»()]+|[.,!?;:"„“”«»()]+$/g, ''))
    .filter(Boolean)
  const seen = new Set<string>()
  return [...(question.words ?? []), ...seededShuffle(answer, question.id)].filter((w) => !seen.has(w.toLowerCase()) && seen.add(w.toLowerCase()))
}
