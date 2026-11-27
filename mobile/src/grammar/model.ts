/*
 * How a grammar round asks and answers, as the web's Round (src/features/grammar/Round.tsx): which
 * questions are picked from choices, which are typed, tapped or built from words, and the words
 * around them. The rules themselves (checking, scores, what is due) are core's.
 */
import { PERSON_LABEL, TENSE_LABEL } from '@lernzeit/core/drills'
import { EXERCISE_KIND, type RoundQuestion, type TopicProgress } from '@lernzeit/core/grammar'
import { count } from '@lernzeit/core/text'
import type { Card, Gender, GrammarTopic, TopicDrill } from '@lernzeit/core/types'

export const GENDERS: Gender[] = ['der', 'die', 'das']

/** The article a choice is, for its colour: "Die" is die. */
export const articleOf = (choice: string): Gender | undefined => GENDERS.find((g) => g === choice.toLowerCase())

/** A question's choices; articles always come as der, die, das. */
export function choicesOf(question: RoundQuestion): string[] | undefined {
  if (question.kind === 'gender') return GENDERS
  if (question.kind !== 'exercise' || question.form.type !== 'gap' || !question.form.options) return undefined
  const { options } = question.form
  if (!options.every(articleOf)) return options
  return [...options].sort((a, b) => GENDERS.indexOf(articleOf(a)!) - GENDERS.indexOf(articleOf(b)!))
}

export type AnswerMode = 'choose' | 'type' | 'tap' | 'order'

export function modeOf(question: RoundQuestion): AnswerMode {
  if (choicesOf(question)) return 'choose'
  if (question.kind === 'exercise' && question.form.type === 'mistake') return 'tap'
  if (question.kind === 'exercise' && question.form.type === 'order') return 'order'
  return 'type'
}

export function placeholderOf(question: RoundQuestion): string {
  if (question.kind === 'plural') return 'die …'
  if (question.kind === 'verbs') return 'Type the verb form…'
  if (question.kind === 'exercise' && question.form.type === 'write') return 'Type the whole sentence…'
  return 'Type the missing word…'
}

/** The line over a question: what kind of exercise, or which of your words. */
export function questionLabel(question: RoundQuestion, card: Card | undefined, topic: GrammarTopic | undefined, showTopic: boolean): string {
  if (question.kind === 'exercise') return [EXERCISE_KIND[question.form.type], showTopic && topic?.title].filter(Boolean).join(' · ')
  if (question.kind === 'verbs') return `Your verbs · ${TENSE_LABEL[question.tense]}`
  return `Your words · ${card?.english ?? ''}`
}

/** What a wrong answer was: nothing, the wrong word, the wrong choice, or not quite right. */
export function wrongLabel(question: RoundQuestion, given: string | null): string {
  if (!given?.trim()) return 'The answer'
  if (question.kind === 'exercise' && question.form.type === 'mistake') return 'Not that word'
  const picked = question.kind === 'gender' || (question.kind === 'exercise' && question.form.type === 'gap' && question.form.options)
  return picked ? `Not ${given}` : 'Not quite'
}

/** Other right answers to show after answering. */
export function otherAnswers(question: RoundQuestion): string[] {
  if (question.kind === 'verbs') return question.answers.slice(1)
  if (question.kind === 'exercise' && question.form.type !== 'mistake') return question.form.answers.slice(1)
  return []
}

/** The pronoun of a verb question: "es" for weather verbs. */
export const pronounOf = (question: Extract<RoundQuestion, { kind: 'verbs' }>): string => (question.impersonal ? 'es' : PERSON_LABEL[question.person])

/** The line under a topic's progress bar. */
export function progressLine(progress: TopicProgress): string {
  if (progress.status === 'new') return 'Not started yet. Read the rule, then practise.'
  if (progress.status === 'mastered') return `Mastered: ${progress.known} of ${count(progress.total, 'exercise')} known. The review keeps it fresh.`
  return `${progress.known} of ${count(progress.total, 'exercise')} known${progress.weak ? ` · ${progress.weak} to work on` : ''}`
}

/** The card drills a topic can add, for the editor. */
export const DRILLS: { value: string; label: string; drill?: TopicDrill }[] = [
  { value: '', label: 'No' },
  { value: 'gender', label: 'der / die / das of my nouns', drill: { kind: 'gender' } },
  { value: 'plural', label: 'Plurals of my nouns', drill: { kind: 'plural' } },
  { value: 'verbs', label: 'My verbs, every tense', drill: { kind: 'verbs' } },
  { value: 'verbs:present', label: 'My verbs, present', drill: { kind: 'verbs', tense: 'present' } },
  { value: 'verbs:past', label: 'My verbs, past', drill: { kind: 'verbs', tense: 'past' } },
  { value: 'verbs:perfect', label: 'My verbs, perfect', drill: { kind: 'verbs', tense: 'perfect' } },
]

export const drillValue = (drill?: TopicDrill): string => (drill ? [drill.kind, drill.tense].filter(Boolean).join(':') : '')
