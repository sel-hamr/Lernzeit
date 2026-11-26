/*
 * Questions over the local library, with the web's rules (src/data/questions.ts): deleting a
 * question takes its old answers along, and blank answers typed in practice are not kept.
 */
import { normalizeQuestion, type QuestionInput } from '@lernzeit/core/questions'
import type { Question, QuestionResponse } from '@lernzeit/core/types'
import { newId } from '../data/ids'
import type { LocalLibrary } from '../store/library'
import { useLiveQuery } from '../store/live'

export const useQuestions = (): Question[] => useLiveQuery(['questions'], (l) => l.list<Question>('questions'), [])
export const useResponses = (): QuestionResponse[] => useLiveQuery(['responses'], (l) => l.list<QuestionResponse>('responses'), [])

export function saveQuestion(library: LocalLibrary, input: QuestionInput, existingId?: string): Question {
  const data = normalizeQuestion(input)
  if (!data.question) throw new Error('A question needs some text')
  return library.write(() => {
    const now = Date.now()
    const previous = existingId ? library.get<Question>('questions', existingId) : undefined
    const question: Question = { ...previous, ...data, id: previous?.id ?? newId(), createdAt: previous?.createdAt ?? now, updatedAt: now }
    library.put('questions', question)
    return question
  })
}

export function deleteQuestion(library: LocalLibrary, id: string): void {
  library.write(() => {
    library.remove('questions', id)
    for (const rid of library.listIds('responses', { questionId: id })) library.remove('responses', rid)
  })
}

export function saveResponse(library: LocalLibrary, questionId: string, text: string, now = Date.now()): QuestionResponse | undefined {
  const trimmed = text.trim()
  if (!trimmed) return undefined
  const response: QuestionResponse = { id: newId(), questionId, text: trimmed, at: now }
  library.put('responses', response)
  return response
}

/** "Lehrer, Ärztin,, arbeiten als " is ["Lehrer", "Ärztin", "arbeiten als"]. */
export const parseWords = (text: string): string[] =>
  text
    .split(/[,;\n]/)
    .map((w) => w.trim())
    .filter(Boolean)
