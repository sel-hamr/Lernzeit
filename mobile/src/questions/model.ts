/*
 * What the Questions screens show: each set with how many questions have your own answer, the
 * round's tally at the end, and how a typed answer compares with yours (core's compareWithAnswer).
 */
import { groupBySet, type Comparison } from '@lernzeit/core/questions'
import { count } from '@lernzeit/core/text'
import type { Question, QuestionResponse } from '@lernzeit/core/types'

export interface QuestionSet {
  set: string
  questions: Question[]
  withAnswer: number
  line: string
}

export function questionSets(questions: Question[]): QuestionSet[] {
  return groupBySet(questions).map(({ set, questions: list }) => {
    const withAnswer = list.filter((q) => q.myAnswer).length
    return { set, questions: list, withAnswer, line: `${count(list.length, 'question')} · ${withAnswer} with your answer` }
  })
}

export function answerCounts(responses: Pick<QuestionResponse, 'questionId'>[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const r of responses) m.set(r.questionId, (m.get(r.questionId) ?? 0) + 1)
  return m
}

export interface Tally {
  answered: number
  shown: number
  skipped: number
}

export function tallyLine(t: Tally): string {
  const parts = [t.answered && `${t.answered} answered`, t.shown && `${t.shown} shown`, t.skipped && `${t.skipped} skipped`].filter(Boolean)
  return parts.length ? parts.join(' · ') : 'Nothing answered'
}

export function comparisonLabel(c: Comparison): { label: string; tone: 'lime' | 'neutral' | 'accent' } {
  if (c.kind === 'same') return { label: 'Matches your answer', tone: 'lime' }
  if (c.kind === 'close') return { label: ['Almost your answer', ...c.notes].join(' · '), tone: 'accent' }
  return { label: 'Different from your answer', tone: 'neutral' }
}

/** Whether a hint word is already in what you typed. */
export function hintUsed(word: string, typed: string): boolean {
  const used = new Set(typed.toLowerCase().split(/\s+/))
  return word
    .toLowerCase()
    .split(/\s+/)
    .every((w) => used.has(w))
}

/** A hint added to what you typed, with one space between. */
export const addHint = (typed: string, word: string): string => (typed.trimEnd() ? `${typed.trimEnd()} ${word}` : word)
