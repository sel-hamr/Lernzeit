import type { Card, DrillStat, ExerciseStat, GrammarExercise, GrammarTopic, StoryLevel } from '@/db/types'
import { checkAnswer, type CheckResult } from './answer'
import { checkDrill, orderByNeed, pickQuestion, pickRound, scoreAfter, shuffle, spokenAnswer, type DrillQuestion, type DrillResult } from './drills'
import { DAY, MINUTE } from './time'

/*
 * Grammar topics: a rule, examples and exercises that stand on their own,
 * plus questions from your cards when a topic links a card drill. This file
 * holds the plain-text formats, the practice and review rounds, and how well
 * you know each topic. No grammar is worked out by rules.
 */

/** How many of a topic's own exercises one round asks. */
export const EXERCISES_PER_ROUND = 12
/** How many card questions join a round of a topic that has exercises; a topic without any asks ROUND_SIZE. */
export const CARDS_PER_ROUND = 5
/** How many exercises one review round asks. */
export const REVIEW_SIZE = 20
/** Days until an exercise comes back, by how many times in a row you got it right. */
export const REVIEW_DAYS = [1, 3, 7, 16, 35, 75]
/** A wrong answer comes back for review this soon. */
export const RETRY_MS = 10 * MINUTE
/** A topic counts as mastered when you know this share of its exercises. */
export const MASTERED = 0.8

/* ------------------------------------------------------------ Lines ---- */

export interface Line {
  de: string
  en?: string
  why?: string
}

/** "Ich helfe {{dem}} Mann. = I help the man. // helfen takes the dative." English and why are optional. */
export function parseLine(line: string): Line {
  const cut = (text: string, marker: string): [string, string] => {
    const at = text.indexOf(marker)
    return at < 0 ? [text, ''] : [text.slice(0, at), text.slice(at + marker.length)]
  }
  const [main, why] = cut(line, ' // ')
  const [de, en] = cut(main, ' = ')
  return { de: de.trim(), ...(en.trim() ? { en: en.trim() } : {}), ...(why.trim() ? { why: why.trim() } : {}) }
}

/** One example or exercise per line; blank lines are skipped. */
export function parseLines(text: string): Line[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map(parseLine)
}

export function formatLines(lines: { de?: string; text?: string; en?: string; why?: string }[]): string {
  return lines
    .map((l) => {
      const main = [l.de ?? l.text ?? '', l.en].filter(Boolean).join(' = ')
      return l.why ? `${main} // ${l.why}` : main
    })
    .join('\n')
}

/* --------------------------------------------------------- Exercises ---- */

export type ExerciseForm =
  /** Fill the gap. With `wrong` choices, the gap is answered by picking. */
  | { type: 'gap'; before: string; after: string; answers: string[]; wrong: string[] }
  /** Find the mistake: `shown` is the wrong word, `answers` its fix. */
  | { type: 'mistake'; before: string; after: string; shown: string; answers: string[] }
  /** Put the words in order. Each answer is a right sentence; the words come from the first. */
  | { type: 'order'; answers: string[] }
  /** Write the sentence the prompt asks for: a rewrite or a translation. */
  | { type: 'write'; prompt: string; answers: string[] }

export const EXERCISE_KIND: Record<ExerciseForm['type'], string> = {
  gap: 'Fill the gap',
  mistake: 'Find the mistake',
  order: 'Put the words in order',
  write: 'Write the sentence',
}

const GAP_RE = /\{\{(.+?)\}\}/
const PUNCTUATION_RE = /^[.,!?;:…"“”„»)¿¡،؟؛]*$/

const spellings = (text: string) =>
  text
    .split('/')
    .map((s) => s.trim())
    .filter(Boolean)

const sentences = (text: string) =>
  text
    .split(' / ')
    .map((s) => s.trim())
    .filter(Boolean)

/** What kind of exercise a text is, and its parts; undefined when it cannot be used. */
export function parseExercise(text: string): ExerciseForm | undefined {
  const trimmed = text.trim()
  if (trimmed.startsWith('~')) {
    const answers = sentences(trimmed.slice(1))
    return answers.length && wordsOf(answers[0]).length > 1 ? { type: 'order', answers } : undefined
  }
  const arrow = trimmed.indexOf(' => ')
  if (arrow >= 0) {
    const prompt = trimmed.slice(0, arrow).trim()
    const answers = sentences(trimmed.slice(arrow + 4))
    return prompt && answers.length ? { type: 'write', prompt, answers } : undefined
  }
  const match = GAP_RE.exec(trimmed)
  if (!match || match.index === undefined) return undefined
  const before = trimmed.slice(0, match.index)
  const after = trimmed.slice(match.index + match[0].length)
  const inner = match[1]
  const arrowAt = inner.indexOf('>')
  if (arrowAt >= 0) {
    const shown = inner.slice(0, arrowAt).trim()
    const answers = spellings(inner.slice(arrowAt + 1))
    return shown && answers.length ? { type: 'mistake', before, after, shown, answers } : undefined
  }
  const [right, ...wrong] = inner.split('|').map((s) => s.trim())
  const answers = spellings(right)
  if (!answers.length) return undefined
  return { type: 'gap', before, after, answers, wrong: wrong.filter((w) => w && !answers.includes(w)) }
}

/** What is wrong with an exercise line, for the editor. */
export function exerciseProblem(text: string): string | undefined {
  const form = parseExercise(text)
  if (form?.type === 'mistake') {
    const glued = /\S$/.test(form.before) || !PUNCTUATION_RE.test(form.after.split(/\s/)[0] ?? '')
    return glued ? 'Mark a whole word as the mistake' : undefined
  }
  if (form) return undefined
  if (text.trim().startsWith('~')) return 'Write a sentence of two words or more after ~'
  if (text.includes(' => ')) return 'Write the prompt before => and the answer after it'
  if (!GAP_RE.test(text)) return 'Mark the gap like {{this}}, or use ~ or =>'
  return 'Write the answer inside {{ }}'
}

/** The sentence with its answer: the gap filled or the mistake fixed. */
export function answerSentence(form: ExerciseForm): string {
  if (form.type === 'gap' || form.type === 'mistake') return `${form.before}${form.answers[0]}${form.after}`
  return form.answers[0]
}

/**
 * The topic's exercises from the editor's lines. An exercise whose text is
 * unchanged keeps its id, so its score is kept.
 */
export function mergeExercises(previous: GrammarExercise[], lines: Line[], newId: () => string): GrammarExercise[] {
  const byText = new Map(previous.map((e) => [e.text, e]))
  return lines.map(({ de, en, why }) => {
    const id = byText.get(de)?.id ?? newId()
    byText.delete(de)
    return { id, text: de, ...(en ? { en } : {}), ...(why ? { why } : {}) }
  })
}

/* -------------------------------------------------------------- Rule ---- */

export type RuleBlock =
  | { type: 'heading'; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; items: string[] }
  | { type: 'table'; header: string[]; rows: string[][] }

const cells = (line: string) =>
  line
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((c) => c.trim())

/** The explanation in blocks: paragraphs, "- " lists, "| a | b |" tables and "### " headings. */
export function parseRule(text: string): RuleBlock[] {
  const blocks: RuleBlock[] = []
  for (const chunk of text.replace(/\r\n?/g, '\n').split(/\n\s*\n/)) {
    let paragraph: string[] = []
    let items: string[] = []
    let table: string[] = []
    const flush = () => {
      if (paragraph.length) blocks.push({ type: 'paragraph', text: paragraph.join(' ') })
      if (items.length) blocks.push({ type: 'list', items })
      if (table.length) {
        // The |---|---| line under the header only marks it.
        const rows = table.filter((l) => !/^\|[\s:|-]+\|?$/.test(l)).map(cells)
        blocks.push({ type: 'table', header: rows[0], rows: rows.slice(1) })
      }
      paragraph = []
      items = []
      table = []
    }
    for (const line of chunk.split('\n').map((l) => l.trim()).filter(Boolean)) {
      const kind = line.startsWith('### ') ? 'heading' : line.startsWith('|') ? 'table' : /^[-•] /.test(line) ? 'list' : 'paragraph'
      const open = paragraph.length ? 'paragraph' : items.length ? 'list' : table.length ? 'table' : undefined
      if (open && open !== kind) flush()
      if (kind === 'heading') {
        flush()
        blocks.push({ type: 'heading', text: line.slice(4).trim() })
      } else if (kind === 'table') table.push(line)
      else if (kind === 'list') items.push(line.slice(2).trim())
      else paragraph.push(line)
    }
    flush()
  }
  return blocks
}

export interface InlinePart {
  text: string
  bold?: boolean
  italic?: boolean
}

/**
 * **bold** and *italic*, also inside each other: "*mit den Kinder**n***".
 * Markers that do not pair up leave the text as it is.
 */
export function parseInline(text: string): InlinePart[] {
  const parts: InlinePart[] = []
  let bold = false
  let italic = false
  let run = ''
  const push = () => {
    if (run) parts.push({ text: run, ...(bold ? { bold } : {}), ...(italic ? { italic } : {}) })
    run = ''
  }
  for (let i = 0; i < text.length; ) {
    if (text.startsWith('**', i)) {
      push()
      bold = !bold
      i += 2
    } else if (text[i] === '*') {
      push()
      italic = !italic
      i += 1
    } else {
      run += text[i++]
    }
  }
  push()
  return bold || italic ? [{ text }] : parts
}

/* --------------------------------------------------------- Questions ---- */

/** The words of a sentence, without punctuation: a comma moves with the order, so it is shown only in the answer. */
export function wordsOf(sentence: string): string[] {
  return sentence
    .trim()
    .split(/\s+/)
    .map((w) => w.replace(/[.,!?;:…"“”„«»¿¡،؟؛]/g, ''))
    .filter(Boolean)
}

/** A sentence as compared: lowercase, without punctuation. */
function plain(sentence: string): string {
  return sentence
    .toLocaleLowerCase('de-DE')
    .replace(/[.,!?;:…"“”„«»¿¡،؟؛]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export type ExercisePrompt =
  | { type: 'gap'; before: string; after: string; answers: string[]; options?: string[] }
  | { type: 'mistake'; before: string; after: string; answers: string[]; words: string[]; wrongIndex: number }
  | { type: 'order'; answers: string[]; words: string[]; end: string }
  | { type: 'write'; prompt: string; answers: string[] }

export interface ExerciseQuestion {
  kind: 'exercise'
  topicId: string
  exerciseId: string
  form: ExercisePrompt
  english?: string
  why?: string
}

/** A question in a grammar round: one of the topic's exercises, or one about your cards. */
export type RoundQuestion = DrillQuestion | ExerciseQuestion

/** One question in a round; `attempt` counts how often it came back. */
export interface RoundItem {
  question: RoundQuestion
  attempt: number
}

/** Shuffles words, never leaving them in the right order when another order exists. */
function scramble(words: string[], random: () => number): string[] {
  for (let tries = 0; tries < 5; tries++) {
    const out = shuffle(words, random)
    if (out.join(' ') !== words.join(' ')) return out
  }
  return words.length > 1 ? [...words.slice(1), words[0]] : words
}

export function exerciseQuestion(topicId: string, exercise: GrammarExercise, random: () => number = Math.random): ExerciseQuestion | undefined {
  const form = parseExercise(exercise.text)
  if (!form) return undefined
  let prompt: ExercisePrompt
  if (form.type === 'gap') {
    const { before, after, answers, wrong } = form
    prompt = { type: 'gap', before, after, answers, options: wrong.length ? shuffle([answers[0], ...wrong], random) : undefined }
  } else if (form.type === 'mistake') {
    const head = form.before.trim() ? form.before.trim().split(/\s+/) : []
    // Punctuation right after the word stays with it: "Mann."
    const stuck = /^\S*/.exec(form.after)?.[0] ?? ''
    const tail = form.after.slice(stuck.length).trim()
    const words = [...head, form.shown + stuck, ...(tail ? tail.split(/\s+/) : [])]
    prompt = { type: 'mistake', before: form.before, after: form.after, answers: form.answers, words, wrongIndex: head.length }
  } else if (form.type === 'order') {
    const end = /[.!?…؟]+$/.exec(form.answers[0].trim())?.[0] ?? ''
    const words = wordsOf(form.answers[0])
    // When another order starts differently, a capital would give the first word away: Ich → ich.
    const lower = words[0].toLocaleLowerCase('de-DE')
    if (form.answers.slice(1).some((a) => wordsOf(a).includes(lower))) words[0] = lower
    prompt = { type: 'order', answers: form.answers, words: scramble(words, random), end }
  } else {
    prompt = form
  }
  return { kind: 'exercise', topicId, exerciseId: exercise.id, form: prompt, english: exercise.en, why: exercise.why }
}

/** What a question's score is kept under: the exercise, or the card. */
export function questionKey(question: RoundQuestion): string {
  return question.kind === 'exercise' ? `exercise:${question.exerciseId}` : `card:${question.cardId}`
}

const RANK: Record<CheckResult['verdict'], number> = { exact: 0, close: 1, wrong: 2 }

/** The best check of a typed answer against each right one; a wrong answer is compared with the first. */
function checkTyped(typed: string, answers: string[]): DrillResult {
  const checks = answers.map((a) => checkAnswer(typed, a, { missingUmlaut: false }))
  const best = checks.reduce((a, b) => (RANK[b.verdict] < RANK[a.verdict] ? b : a))
  const check = best.verdict === 'wrong' ? checks[0] : best
  return { correct: check.verdict !== 'wrong', check }
}

/**
 * Checks an answer: a picked choice, the index of a tapped word (find the
 * mistake), the words in the order tapped, or typed text. Typed text may have
 * small slips, but not a missing umlaut.
 */
export function checkQuestion(question: RoundQuestion, answer: string): DrillResult {
  if (question.kind !== 'exercise') return checkDrill(question, answer)
  const { form } = question
  if (form.type === 'gap') return form.options ? { correct: form.answers.includes(answer) } : checkTyped(answer, form.answers)
  if (form.type === 'mistake') return { correct: Number(answer) === form.wrongIndex }
  if (form.type === 'order') return { correct: form.answers.some((a) => plain(a) === plain(answer)) }
  return checkTyped(answer, form.answers)
}

/** The right sentence of an exercise question. */
export function filledSentence(question: ExerciseQuestion): string {
  const { form } = question
  if (form.type === 'gap' || form.type === 'mistake') return `${form.before}${form.answers[0]}${form.after}`
  return form.answers[0]
}

/** What to say aloud after answering. */
export function spokenQuestion(question: RoundQuestion): string {
  return question.kind === 'exercise' ? filledSentence(question) : spokenAnswer(question)
}

/** Spreads `extra` evenly through `main`: a few card questions among the exercises. */
export function interleave<T>(main: T[], extra: T[]): T[] {
  if (!main.length || !extra.length) return [...main, ...extra]
  const out: T[] = []
  const step = (main.length + 1) / (extra.length + 1)
  let next = step
  let e = 0
  main.forEach((item, i) => {
    while (e < extra.length && i + 1 >= next) {
      out.push(extra[e++])
      next += step
    }
    out.push(item)
  })
  return [...out, ...extra.slice(e)]
}

const toQuestions = (topicId: string, exercises: GrammarExercise[], random: () => number) =>
  exercises.flatMap((e) => {
    const question = exerciseQuestion(topicId, e, random)
    return question ? [question] : []
  })

/**
 * A round of a topic: its exercises, the ones you get wrong first, with
 * questions from your cards spread among them when the topic links a drill.
 */
export function buildTopicRound({
  topic,
  exerciseStats,
  cards,
  drillStats,
  random = Math.random,
}: {
  topic: GrammarTopic
  exerciseStats: Map<string, ExerciseStat>
  cards: Card[]
  drillStats: DrillStat[]
  random?: () => number
}): RoundItem[] {
  const ordered = orderByNeed(topic.exercises, (e) => exerciseStats.get(e.id), random).slice(0, EXERCISES_PER_ROUND)
  const exercises = toQuestions(topic.id, ordered, random)

  const drill = topic.drill
  let fromCards: DrillQuestion[] = []
  if (drill) {
    const stats = new Map(drillStats.filter((s) => s.drill === drill.kind).map((s) => [s.cardId, s]))
    const size = exercises.length ? CARDS_PER_ROUND : undefined
    fromCards = pickRound(cards, drill.kind, stats, random, size, drill.tense).flatMap((card) => {
      const question = pickQuestion(card, drill.kind, random, drill.tense)
      return question ? [question] : []
    })
  }

  return interleave<RoundQuestion>(exercises, fromCards).map((question) => ({ question, attempt: 0 }))
}

/* ------------------------------------------------------------ Review ---- */

/** When a stat is due; stats from before reviews existed are due at once. */
const dueOf = (stat: ExerciseStat) => stat.due ?? stat.lastAt

/** An exercise's stat after one answer: scored like a card, and given its next review. */
export function nextExerciseStat(previous: ExerciseStat | undefined, topicId: string, exerciseId: string, correct: boolean, now: number): ExerciseStat {
  const streak = correct ? (previous?.streak ?? 0) + 1 : 0
  return {
    id: exerciseId,
    topicId,
    right: (previous?.right ?? 0) + (correct ? 1 : 0),
    wrong: (previous?.wrong ?? 0) + (correct ? 0 : 1),
    score: scoreAfter(previous?.score ?? 0, correct),
    streak,
    lastAt: now,
    due: correct ? now + REVIEW_DAYS[Math.min(streak, REVIEW_DAYS.length) - 1] * DAY : now + RETRY_MS,
  }
}

/** The exercises you have practised that are due again, most overdue first. */
export function dueExercises(topics: GrammarTopic[], stats: ExerciseStat[], now: number): { topic: GrammarTopic; exercise: GrammarExercise; stat: ExerciseStat }[] {
  const byId = new Map(stats.map((s) => [s.id, s]))
  const due = topics.flatMap((topic) =>
    topic.exercises.flatMap((exercise) => {
      const stat = byId.get(exercise.id)
      return stat && dueOf(stat) <= now ? [{ topic, exercise, stat }] : []
    }),
  )
  return due.sort((a, b) => dueOf(a.stat) - dueOf(b.stat) || b.stat.score - a.stat.score)
}

/** A review round: up to REVIEW_SIZE due exercises from every topic, mixed. */
export function buildReviewRound(topics: GrammarTopic[], stats: ExerciseStat[], now: number, random: () => number = Math.random): RoundItem[] {
  const picked = dueExercises(topics, stats, now).slice(0, REVIEW_SIZE)
  return shuffle(picked, random).flatMap(({ topic, exercise }) => {
    const question = exerciseQuestion(topic.id, exercise, random)
    return question ? [{ question, attempt: 0 }] : []
  })
}

/* ---------------------------------------------------------- Progress ---- */

/** An exercise you know: answered right last time, with no mistakes left to make up for. */
export function isKnown(stat: ExerciseStat | undefined): boolean {
  return !!stat && (stat.streak ?? 0) >= 1 && stat.score === 0
}

export type TopicStatus = 'new' | 'learning' | 'mastered'

export interface TopicProgress {
  total: number
  known: number
  /** Exercises answered wrong more often than right lately. */
  weak: number
  /** known / total, 0 to 1. */
  share: number
  status: TopicStatus
}

export function topicProgress(topic: GrammarTopic, statsById: Map<string, ExerciseStat>): TopicProgress {
  const stats = topic.exercises.map((e) => statsById.get(e.id))
  const total = topic.exercises.length
  const known = stats.filter(isKnown).length
  const share = total ? known / total : 0
  const status: TopicStatus = !stats.some(Boolean) ? 'new' : share >= MASTERED ? 'mastered' : 'learning'
  return { total, known, weak: stats.filter((s) => s && s.score > 0).length, share, status }
}

const LEVELS: StoryLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']

/** The order to learn in: by level, then in the order added. Topics without a level come last. */
export function pathOrder(topics: GrammarTopic[]): GrammarTopic[] {
  const rank = (t: GrammarTopic) => (t.level ? LEVELS.indexOf(t.level) : LEVELS.length)
  return [...topics].sort((a, b) => rank(a) - rank(b) || a.createdAt - b.createdAt)
}

/** The topic to learn next: one you started and have not mastered, else the first new one on the path. */
export function nextTopic(topics: GrammarTopic[], statsById: Map<string, ExerciseStat>): GrammarTopic | undefined {
  const path = pathOrder(topics).filter((t) => t.exercises.length)
  const status = (t: GrammarTopic) => topicProgress(t, statsById).status
  return path.find((t) => status(t) === 'learning') ?? path.find((t) => status(t) === 'new')
}

/** Sections of the Grammar page in the order their first topic was added, topics oldest first. */
export function groupTopics(topics: GrammarTopic[]): { group: string; topics: GrammarTopic[] }[] {
  const groups = new Map<string, GrammarTopic[]>()
  for (const topic of [...topics].sort((a, b) => a.createdAt - b.createdAt)) {
    const list = groups.get(topic.group) ?? []
    list.push(topic)
    groups.set(topic.group, list)
  }
  return [...groups].map(([group, list]) => ({ group, topics: list }))
}

/** Topics by level for the path view: A1, A2 … then "No level". */
export function levelGroups(topics: GrammarTopic[]): { group: string; topics: GrammarTopic[] }[] {
  const groups = new Map<string, GrammarTopic[]>()
  for (const topic of pathOrder(topics)) {
    const key = topic.level ?? 'No level'
    groups.set(key, [...(groups.get(key) ?? []), topic])
  }
  return [...groups].map(([group, list]) => ({ group, topics: list }))
}

/* ---------------------------------------------------------------- AI ---- */

/** A message for Claude about one answer: the exercise, your answer, the right one and the topic's rule. */
export function askClaudePrompt({
  topic,
  question,
  answer,
  correct,
  language = { name: 'German', native: 'English' },
}: {
  topic: GrammarTopic
  question: ExerciseQuestion
  answer: string
  correct: boolean
  /** German and English when left out. */
  language?: { name: string; native: string }
}): string {
  const { form } = question
  const shown =
    form.type === 'gap'
      ? `${form.before}___${form.after}`
      : form.type === 'mistake'
        ? `Find the mistake: ${form.words.join(' ')}`
        : form.type === 'order'
          ? `Put the words in order: ${form.words.join(' / ')}`
          : form.prompt
  const mine = form.type === 'mistake' ? form.words[Number(answer)] : answer
  const facts = [
    `I'm learning ${language.name} grammar: "${topic.title}"${topic.english ? ` (${topic.english})` : ''}${topic.level ? `, level ${topic.level}` : ''}.`,
    `Exercise: ${shown}`,
    question.english && `Meaning: ${question.english}`,
    mine?.trim() ? `My answer: ${mine.trim()}${correct ? ' (right)' : ' (wrong)'}` : 'I did not know the answer.',
    `Right answer: ${filledSentence(question)}`,
    question.why && `The app says: ${question.why}`,
  ]
  const ask = `Explain simply, in ${language.native}, why the right answer is right${correct ? '' : ' and what was wrong with mine'}. Then give two more example sentences and three short sentences for me to try, with the answers at the end.`
  return `${facts.filter(Boolean).join('\n')}\n\n${ask}`
}

/** Opens a new Claude chat with the message filled in. */
export function claudeChatUrl(prompt: string): string {
  return `https://claude.ai/new?q=${encodeURIComponent(prompt)}`
}
