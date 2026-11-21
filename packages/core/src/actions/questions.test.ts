import { beforeEach, describe, expect, it } from 'vitest'
import type { Question } from '../types'
import { expectCode, makeStore, NOW, SEEDED_QUESTIONS } from './fixture.test-utils'
import { AI_TAG, runAction } from './index'

let store: ReturnType<typeof makeStore>

beforeEach(() => {
  store = makeStore()
})

describe('create_questions', () => {
  it('adds questions with the ai tag and a suggested answer, and leaves Your answer empty', async () => {
    const result = await runAction(store, 'create_questions', {
      set: ' Beim  Bäcker ',
      questions: [
        { question: 'Was möchten Sie?', english: 'What would you like?', suggested: 'Ich möchte zwei Brötchen.', words: ['das Brot', 'die Brezel'], level: 'A1', tags: ['food'] },
        { question: 'Sonst noch etwas?' },
      ],
    })
    expect(result).toEqual({ set: 'Beim Bäcker', added: 2, skipped: [] })
    const saved = await store.list<Question>('questions', { set: 'Beim Bäcker' })
    expect(saved).toHaveLength(2)
    expect(saved.find((q) => q.question === 'Was möchten Sie?')).toEqual({
      id: expect.any(String),
      set: 'Beim Bäcker',
      question: 'Was möchten Sie?',
      english: 'What would you like?',
      suggested: 'Ich möchte zwei Brötchen.',
      words: ['das Brot', 'die Brezel'],
      level: 'A1',
      tags: ['food', AI_TAG],
      createdAt: NOW,
      updatedAt: NOW,
    })
    expect(saved.every((q) => q.myAnswer === undefined)).toBe(true)
  })

  it('adds to an existing set whatever its case, and skips questions it already has', async () => {
    const result = await runAction(store, 'create_questions', {
      set: 'sich vorstellen',
      questions: [{ question: 'wie heißt du?' }, { question: 'Wo bist du geboren?' }, { question: 'Wo bist du geboren? ' }],
    })
    expect(result).toEqual({ set: 'Sich vorstellen', added: 1, skipped: ['wie heißt du?', 'Wo bist du geboren?'] })
    expect(await store.count('questions', { set: 'Sich vorstellen' })).toBe(SEEDED_QUESTIONS + 1)
  })

  it('rejects bad input without saving anything', async () => {
    const before = await store.count('questions')
    const one = [{ question: 'Wie geht es dir?' }]
    await expectCode(runAction(store, 'create_questions', { set: ' ', questions: one }), 'invalid_input')
    await expectCode(runAction(store, 'create_questions', { set: 'x'.repeat(61), questions: one }), 'invalid_input')
    await expectCode(runAction(store, 'create_questions', { set: 'Alltag', questions: [] }), 'invalid_input')
    await expectCode(runAction(store, 'create_questions', { set: 'Alltag', questions: [...one, { question: '  ' }] }), 'invalid_input')
    await expectCode(runAction(store, 'create_questions', { set: 'Alltag', questions: [{ question: 'Was?', suggested: 'a'.repeat(501) }] }), 'invalid_input')
    await expectCode(runAction(store, 'create_questions', { set: 'Alltag', questions: [{ question: 'Was?', level: 'D1' as 'A1' }] }), 'invalid_input')
    await expectCode(runAction(store, 'create_questions', { set: 'Alltag', questions: [{ question: 'Was?', words: Array.from({ length: 13 }, (_, i) => `Wort ${i}`) }] }), 'invalid_input')
    await expectCode(runAction(store, 'create_questions', { set: 'Alltag', questions: Array.from({ length: 51 }, (_, i) => ({ question: `Frage ${i}?` })) }), 'invalid_input')
    expect(await store.count('questions')).toBe(before)
    expect(store.committed).toEqual([])
  })
})
