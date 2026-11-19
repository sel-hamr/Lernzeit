import { describe, expect, it } from 'vitest'
import { makeStarter } from './make-starter'

const backup = {
  app: 'lernzeit',
  topics: [{ id: 't1', name: 'German', goalMinutes: { mon: 60 } }],
  sessions: [{ id: 's1', topicId: 't1', note: 'private' }],
  tasks: [{ id: 'k1', title: 'private task' }],
  reviews: [{ id: 'r1', cardId: 'c1', fsrs: { reps: 9 } }],
  reviewLogs: [{ id: 'l1' }],
  settings: { voiceURI: 'Google Deutsch' },
  decks: [
    { id: 'd2', name: 'Second', topicId: 't1', order: 5, directions: { enToDe: true }, newPerDay: 10, reviewsPerDay: 100, createdAt: 2 },
    { id: 'd1', name: 'First', topicId: 't1', order: 1, createdAt: 1 },
  ],
  cards: [
    { id: 'c2', deckId: 'd1', type: 'word', english: 'cat', german: 'Katze', gender: 'die', imageId: 'i1', tags: [], createdAt: 2, updatedAt: 9 },
    { id: 'c1', deckId: 'd2', type: 'word', english: 'dog', german: 'Hund', plural: '', createdAt: 1, updatedAt: 1 },
  ],
  stories: [
    { id: 'st1', title: 'Old', text: 'a', level: 'A1', topicId: 't1', readCount: 4, openedAt: 5, createdAt: 1 },
    { id: 'st2', title: 'New', text: 'b', level: 'A2', topicId: 't1', readCount: 0, createdAt: 2 },
  ],
  questions: [{ id: 'q1', set: 'Familie', question: 'Wer?', level: 'A1', myAnswer: 'private', createdAt: 1 }],
  grammarTopics: [{ id: 'g1', title: 'Artikel', level: 'A1', exercises: [], createdAt: 1, updatedAt: 1 }],
  images: [{ id: 'i1', width: 10, height: 10, fit: 'cover', dataUrl: 'data:image/png;base64,AAA' }],
}

describe('makeStarter', () => {
  const starter = makeStarter(backup)

  it('keeps decks in their order, under the German topic', () => {
    expect(starter.pack.decks).toEqual([
      { id: 'd1', name: 'First', topic: 'German' },
      { id: 'd2', name: 'Second', directions: { enToDe: true }, newPerDay: 10, reviewsPerDay: 100, topic: 'German' },
    ])
  })

  it('keeps cards with their pictures and drops empty fields', () => {
    expect(starter.pack.cards).toEqual([
      { id: 'c1', deckId: 'd2', type: 'word', english: 'dog', german: 'Hund' },
      { id: 'c2', deckId: 'd1', type: 'word', english: 'cat', german: 'Katze', gender: 'die', tags: [], image: 'data:image/png;base64,AAA' },
    ])
  })

  it('lists stories newest first without read counts', () => {
    expect(starter.stories).toEqual([
      { id: 'st2', title: 'New', text: 'b', level: 'A2', topic: 'German' },
      { id: 'st1', title: 'Old', text: 'a', level: 'A1', topic: 'German' },
    ])
  })

  it('drops your answers, history, tasks and settings', () => {
    expect(starter.questions).toEqual([{ id: 'q1', set: 'Familie', question: 'Wer?', level: 'A1' }])
    const text = JSON.stringify(starter)
    for (const secret of ['private', 'Google Deutsch', 'goalMinutes', 'fsrs', 'readCount', 'topicId']) expect(text).not.toContain(secret)
  })

  it('refuses a file that is not a backup', () => {
    expect(() => makeStarter({ ...backup, app: 'other' })).toThrow('not a Lernzeit backup')
  })
})
