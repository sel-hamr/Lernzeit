import { MAX_HINT_WORDS, MAX_QUESTION_CHARS, MAX_QUESTIONS_PER_CALL, MAX_SET_NAME, type CreateQuestionsParams, type CreateQuestionsResult } from '../protocol'
import type { Question } from '../types'
import { AI_TAG, byId, invalid, key, parseLevel, type ActionContext } from './shared'

/** Trimmed, without blanks or repeats (ignoring case). As the question editor saves words and tags. */
function unique(items: string[]): string[] {
  const seen = new Set<string>()
  return items
    .map((item) => item.trim().replace(/\s+/g, ' '))
    .filter((item) => item && !seen.has(item.toLowerCase()) && seen.add(item.toLowerCase()))
}

export async function createQuestions({ set, questions }: CreateQuestionsParams, ctx: ActionContext): Promise<CreateQuestionsResult> {
  const name = set.trim().replace(/\s+/g, ' ')
  if (!name) throw invalid('A set needs a name.')
  if (name.length > MAX_SET_NAME) throw invalid(`Keep the set name under ${MAX_SET_NAME} characters.`)
  if (!questions.length) throw invalid('Send at least one question.')
  if (questions.length > MAX_QUESTIONS_PER_CALL) throw invalid(`Send at most ${MAX_QUESTIONS_PER_CALL} questions per call.`)
  questions.forEach((q, i) => {
    if (!q.question.trim()) throw invalid(`Question ${i + 1} needs text.`)
    if ([q.question, q.english, q.suggested].some((text) => (text?.length ?? 0) > MAX_QUESTION_CHARS)) {
      throw invalid(`Keep question ${i + 1} and its answers under ${MAX_QUESTION_CHARS} characters each.`)
    }
    if (q.level !== undefined && !parseLevel(q.level)) throw invalid(`Question ${i + 1}: level must be one of A1, A2, B1, B2, C1 or C2.`)
    if ((q.words?.length ?? 0) > MAX_HINT_WORDS) throw invalid(`Give question ${i + 1} at most ${MAX_HINT_WORDS} words.`)
  })

  // Sets are matched without case, so "arbeit" adds to "Arbeit".
  const existing = (await ctx.store.list<Question>('questions')).sort(byId).filter((q) => key(q.set) === key(name))
  const setName = existing[0]?.set ?? name
  const seen = new Set(existing.map((q) => key(q.question)))
  const skipped: string[] = []
  let added = 0
  for (const q of questions) {
    if (seen.has(key(q.question))) {
      skipped.push(q.question.trim())
      continue
    }
    seen.add(key(q.question))
    const words = unique(q.words ?? [])
    // As the question editor saves it. The user's own answer is theirs to write, so the AI never sets it.
    const question: Question = {
      set: setName.trim().replace(/\s+/g, ' ') || 'My questions',
      question: q.question.trim(),
      english: q.english?.trim() || undefined,
      myAnswer: undefined,
      suggested: q.suggested?.trim() || undefined,
      words: words.length ? words : undefined,
      level: parseLevel(q.level),
      tags: unique([...(q.tags ?? []), AI_TAG]),
      id: ctx.newId(),
      createdAt: ctx.now,
      updatedAt: ctx.now,
    }
    ctx.store.put('questions', question)
    added++
  }
  return { set: setName, added, skipped }
}
