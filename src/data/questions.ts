import { db, newId, type LernzeitDB } from '@/db/db'
import type { StarterQuestion } from '@/db/starter/questions'
import type { Question, QuestionResponse } from '@/db/types'
import { parseLevel } from './stories'

/** Questions added without a set go here. */
export const DEFAULT_SET = 'My questions'

export type QuestionInput = Pick<Question, 'set' | 'question' | 'english' | 'myAnswer' | 'suggested' | 'words' | 'level' | 'tags'>

/** "Lehrer, Ärztin,, arbeiten als " -> ["Lehrer", "Ärztin", "arbeiten als"] */
export function parseWords(text: string): string[] {
  return text.split(/[,;\n]/).map((w) => w.trim()).filter(Boolean)
}

function normalizeQuestion(input: QuestionInput): QuestionInput {
  const clean = (s?: string) => s?.trim() || undefined
  const words = unique(input.words ?? [])
  return {
    set: input.set.trim().replace(/\s+/g, ' ') || DEFAULT_SET,
    question: input.question.trim(),
    english: clean(input.english),
    myAnswer: clean(input.myAnswer),
    suggested: clean(input.suggested),
    words: words.length ? words : undefined,
    level: parseLevel(input.level),
    tags: unique(input.tags),
  }
}

/** Trimmed, without blanks or repeats (ignoring case). */
function unique(items: string[]): string[] {
  const seen = new Set<string>()
  return items
    .map((item) => item.trim().replace(/\s+/g, ' '))
    .filter((item) => item && !seen.has(item.toLowerCase()) && seen.add(item.toLowerCase()))
}

export async function saveQuestion(input: QuestionInput, existingId?: string, database: LernzeitDB = db): Promise<Question> {
  const data = normalizeQuestion(input)
  if (!data.question) throw new Error('A question needs some German text')
  return database.transaction('rw', database.questions, async () => {
    const now = Date.now()
    const previous = existingId ? await database.questions.get(existingId) : undefined
    const question: Question = { ...previous, ...data, id: previous?.id ?? newId(), createdAt: previous?.createdAt ?? now, updatedAt: now }
    await database.questions.put(question)
    return question
  })
}

/** Deletes a question with its old responses. */
export async function deleteQuestion(id: string, database: LernzeitDB = db) {
  await database.transaction('rw', [database.questions, database.responses], async () => {
    await database.questions.delete(id)
    await database.responses.where('questionId').equals(id).delete()
  })
}

/** Saves an answer typed in practice. Blank answers are not saved. */
export async function saveResponse(questionId: string, text: string, database: LernzeitDB = db): Promise<QuestionResponse | undefined> {
  const trimmed = text.trim()
  if (!trimmed) return undefined
  const response: QuestionResponse = { id: newId(), questionId, text: trimmed, at: Date.now() }
  await database.responses.add(response)
  return response
}

/** The bundled starter questions, loaded on demand so they stay out of the main bundle. */
export async function loadStarterQuestions(): Promise<StarterQuestion[]> {
  const { STARTER_QUESTIONS } = await import('@/db/starter/questions')
  return STARTER_QUESTIONS
}

/**
 * Adds the starter questions that are missing. Returns how many were added.
 * Inside another transaction, pass `questions` loaded beforehand: a
 * transaction cannot wait for a module to load.
 */
export async function installStarterQuestions(database: LernzeitDB = db, questions?: StarterQuestion[]): Promise<number> {
  const starter = questions ?? (await loadStarterQuestions())
  return database.transaction('rw', database.questions, async () => {
    const present = new Set((await database.questions.bulkGet(starter.map((q) => q.id))).filter((q) => !!q).map((q) => q.id))
    const now = Date.now()
    // The list shows questions oldest first, so later entries get later times to keep the file's order.
    const fresh: Question[] = starter.filter((q) => !present.has(q.id)).map((q, i) => ({ ...q, createdAt: now + i, updatedAt: now + i }))
    await database.questions.bulkAdd(fresh)
    return fresh.length
  })
}
