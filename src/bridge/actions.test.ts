import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LernzeitDB } from '@/db/db'
import { ensureSeeded } from '@/db/seed'
import { AI_TAG, handleRequest, runAction } from './actions'
import { BridgeError, type BridgeErrorCode } from './protocol'

let database: LernzeitDB
let counter = 0

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 15, 10, 0))
  database = new LernzeitDB(`bridge-test-${counter++}`)
  await ensureSeeded(database)
})

afterEach(async () => {
  vi.useRealTimers()
  await database.delete()
})

async function expectCode(promise: Promise<unknown>, code: BridgeErrorCode) {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  )
  expect(error).toBeInstanceOf(BridgeError)
  expect((error as BridgeError).code).toBe(code)
  return error as BridgeError
}

describe('list_topics and list_decks', () => {
  it('lists active topics in order', async () => {
    const ai = await database.topics.filter((t) => t.name === 'AI').first()
    await database.topics.update(ai!.id, { archived: true })
    expect((await runAction('list_topics', {}, database)).map((t) => t.name)).toEqual(['German'])
  })

  it('lists decks in order with their topic and card count', async () => {
    const decks = await runAction('list_decks', {}, database)
    expect(decks[0]).toEqual({ id: 'my-words', name: 'My Words', topic: 'German', cards: 53 })
    expect(decks.map((d) => d.name)).toEqual(['My Words', 'German Top Words', 'German Everyday Sentences', 'AI terms'])
  })
})

describe('create_deck', () => {
  it('creates a deck linked to a topic by name', async () => {
    const { deck, created } = await runAction('create_deck', { name: ' Food ', topic: 'german' }, database)
    expect(created).toBe(true)
    expect(deck).toMatchObject({ name: 'Food', topic: 'German', cards: 0 })
    expect((await database.decks.get(deck.id))?.name).toBe('Food')
  })

  it('returns the existing deck when the name is taken', async () => {
    const before = await database.decks.count()
    const { deck, created } = await runAction('create_deck', { name: 'my words' }, database)
    expect(created).toBe(false)
    expect(deck).toMatchObject({ id: 'my-words', cards: 53 })
    expect(await database.decks.count()).toBe(before)
  })

  it('rejects an unknown topic and lists the real ones', async () => {
    const error = await expectCode(runAction('create_deck', { name: 'Food', topic: 'Spanish' }, database), 'topic_not_found')
    expect(error.message).toContain('German, AI')
  })
})

describe('create_cards', () => {
  it('adds cards with the ai tag, FSRS reviews and the article moved into gender', async () => {
    const result = await runAction(
      'create_cards',
      {
        deck: 'My Words',
        cards: [
          { english: 'spoon', german: 'der Löffel', plural: 'die Löffel', partOfSpeech: 'noun', emoji: '🥄' },
          { english: 'I {{cook}} pasta.', german: 'Ich {{koche}} Nudeln.', tags: ['kitchen'] },
        ],
      },
      database,
    )
    expect(result).toEqual({ deck: 'My Words', added: 2, skipped: [] })

    const spoon = (await database.cards.filter((c) => c.german === 'Löffel').first())!
    expect(spoon).toMatchObject({ deckId: 'my-words', type: 'word', gender: 'der', plural: 'die Löffel', tags: [AI_TAG] })
    const cloze = (await database.cards.filter((c) => c.german === 'Ich {{koche}} Nudeln.').first())!
    expect(cloze).toMatchObject({ type: 'cloze', gender: undefined, tags: ['kitchen', AI_TAG] })

    const directions = async (cardId: string) => (await database.reviews.where('cardId').equals(cardId).toArray()).map((r) => r.direction).sort()
    expect(await directions(spoon.id)).toEqual(['deToEn', 'enToDe', 'imageToDe'])
    expect(await directions(cloze.id)).toEqual(['cloze'])
  })

  it('skips words already in the deck and repeats within the call', async () => {
    const result = await runAction(
      'create_cards',
      {
        deck: 'german-top-words',
        cards: [
          { english: 'dog', german: 'der Hund' },
          { english: 'fork', german: 'Gabel', gender: 'die' },
          { english: 'fork', german: 'gabel' },
        ],
      },
      database,
    )
    expect(result).toEqual({ deck: 'German Top Words', added: 1, skipped: ['Hund', 'gabel'] })
  })

  it('rejects an unknown deck and lists the real ones', async () => {
    const error = await expectCode(runAction('create_cards', { deck: 'Food', cards: [{ english: 'a', german: 'b' }] }, database), 'deck_not_found')
    expect(error.message).toContain('My Words, German Top Words')
  })

  it('rejects empty calls, blank cards and too many cards without saving anything', async () => {
    const before = await database.cards.count()
    await expectCode(runAction('create_cards', { deck: 'My Words', cards: [] }, database), 'invalid_input')
    await expectCode(runAction('create_cards', { deck: 'My Words', cards: [{ english: 'ok', german: 'gut' }, { english: ' ', german: 'x' }] }, database), 'invalid_input')
    const many = Array.from({ length: 101 }, (_, i) => ({ english: `w${i}`, german: `W${i}` }))
    await expectCode(runAction('create_cards', { deck: 'My Words', cards: many }, database), 'invalid_input')
    expect(await database.cards.count()).toBe(before)
  })
})

describe('create_story', () => {
  const text = 'Ich koche heute Nudeln.\n\nDas Essen ist lecker.'

  it('adds a story with the ai tag, read toward German by default', async () => {
    const { story, created } = await runAction(
      'create_story',
      { title: ' In der Küche ', text, translation: 'I am cooking pasta today.\n\nThe food is tasty.', level: 'A1', tags: ['food'] },
      database,
    )
    expect(created).toBe(true)
    expect(story).toMatchObject({ title: 'In der Küche', level: 'A1', words: 8, paragraphs: 2, topic: 'German' })
    expect(await database.stories.get(story.id)).toMatchObject({ tags: ['food', AI_TAG], readCount: 0 })
  })

  it('returns the existing story when the same text comes again', async () => {
    const before = await database.stories.count()
    const first = await runAction('create_story', { title: 'Küche', text }, database)
    const again = await runAction('create_story', { title: 'Another title', text: `  ${text}\n` }, database)
    expect(again).toEqual({ story: first.story, created: false })
    expect(await database.stories.count()).toBe(before + 1)
  })

  it('links a topic by name and rejects bad input without saving', async () => {
    const { story } = await runAction('create_story', { title: 'KI', text: 'Die KI lernt.', topic: 'ai' }, database)
    expect(story.topic).toBe('AI')
    const before = await database.stories.count()
    await expectCode(runAction('create_story', { title: ' ', text }, database), 'invalid_input')
    await expectCode(runAction('create_story', { title: 'x', text: '  ' }, database), 'invalid_input')
    // An AI app could send any string; the type only covers well-formed calls.
    await expectCode(runAction('create_story', { title: 'x', text, level: 'D1' as 'A1' }, database), 'invalid_input')
    await expectCode(runAction('create_story', { title: 'x', text: 'a'.repeat(20_001) }, database), 'invalid_input')
    await expectCode(runAction('create_story', { title: 'x', text, topic: 'Spanish' }, database), 'topic_not_found')
    expect(await database.stories.count()).toBe(before)
  })
})

describe('grammar', () => {
  const exercise = { text: 'Ich helfe {{dem|den}} Mann.', en: 'I help the man.', why: 'helfen takes the dative.' }

  it('starts a new topic with its rule, examples and exercises', async () => {
    const result = await runAction(
      'add_grammar',
      {
        topic: ' Verben mit  Dativ ',
        english: 'Verbs with the dative',
        group: 'Verbs',
        level: 'A2',
        rule: 'Some verbs take a **dative** object.',
        examples: [{ de: 'Ich helfe dir.', en: 'I help you.' }],
        exercises: [exercise, { text: '~ Das gehört mir.' }],
      },
      database,
    )
    expect(result).toMatchObject({ created: true, added: 2, skipped: [], topic: { title: 'Verben mit Dativ', group: 'Verbs', level: 'A2', exercises: 2 } })
    const saved = (await database.grammarTopics.get(result.topic.id))!
    expect(saved.rule).toBe('Some verbs take a **dative** object.')
    expect(saved.exercises[0]).toMatchObject({ text: 'Ich helfe {{dem|den}} Mann.', en: 'I help the man.', why: 'helfen takes the dative.' })
    expect(await runAction('list_grammar_topics', {}, database)).toEqual([expect.objectContaining({ id: saved.id, title: 'Verben mit Dativ', exercises: 2 })])
  })

  it('adds to a topic found by title in any case, keeps its rule, and skips exercises it has', async () => {
    const first = await runAction('add_grammar', { topic: 'Dativ', rule: 'The rule.', exercises: [exercise] }, database)
    const again = await runAction(
      'add_grammar',
      { topic: 'dativ', rule: 'Another rule.', group: 'Ignored', exercises: [{ text: ' ich helfe {{dem|den}} mann. ' }, { text: 'Er dankt {{dem}} Arzt.' }], examples: [{ de: 'Ich danke dir.' }] },
      database,
    )
    expect(again).toMatchObject({ created: false, added: 1, skipped: ['ich helfe {{dem|den}} mann.'], topic: { id: first.topic.id, exercises: 2 } })
    const saved = (await database.grammarTopics.get(first.topic.id))!
    expect(saved).toMatchObject({ rule: 'The rule.', group: 'My topics', examples: [{ de: 'Ich danke dir.' }] })
  })

  it('rejects exercises it cannot use, without saving anything', async () => {
    await expectCode(runAction('add_grammar', { topic: 'X', exercises: [{ text: 'Ich helfe dem Mann.' }] }, database), 'invalid_input')
    await expectCode(runAction('add_grammar', { topic: 'X', exercises: [{ text: 'Ich hel{{f>p}}e.' }] }, database), 'invalid_input')
    await expectCode(runAction('add_grammar', { topic: ' ', exercises: [exercise] }, database), 'invalid_input')
    await expectCode(runAction('add_grammar', { topic: 'X' }, database), 'invalid_input')
    await expectCode(runAction('add_grammar', { topic: 'X', level: 'D1' as 'A1', exercises: [exercise] }, database), 'invalid_input')
    await expectCode(runAction('add_grammar', { topic: 'X', exercises: Array.from({ length: 51 }, () => exercise) }, database), 'invalid_input')
    const error = await expectCode(runAction('add_grammar', { topic: 'X', exercises: [exercise, { text: 'kein Gap' }] }, database), 'invalid_input')
    expect(error.message).toContain('Exercise 2')
    expect(await database.grammarTopics.count()).toBe(0)
  })
})

describe('create_questions', () => {
  it('adds questions with the ai tag and a suggested answer, and leaves Your answer empty', async () => {
    const result = await runAction(
      'create_questions',
      {
        set: ' Beim  Bäcker ',
        questions: [
          { question: 'Was möchten Sie?', english: 'What would you like?', suggested: 'Ich möchte zwei Brötchen.', words: ['das Brot', 'die Brezel'], level: 'A1', tags: ['food'] },
          { question: 'Sonst noch etwas?' },
        ],
      },
      database,
    )
    expect(result).toEqual({ set: 'Beim Bäcker', added: 2, skipped: [] })
    const saved = await database.questions.where('set').equals('Beim Bäcker').toArray()
    expect(saved).toHaveLength(2)
    expect(saved.find((q) => q.question === 'Was möchten Sie?')).toMatchObject({ question: 'Was möchten Sie?', suggested: 'Ich möchte zwei Brötchen.', words: ['das Brot', 'die Brezel'], level: 'A1', tags: ['food', AI_TAG] })
    expect(saved.every((q) => q.myAnswer === undefined)).toBe(true)
  })

  it('adds to an existing set whatever its case, and skips questions it already has', async () => {
    const result = await runAction(
      'create_questions',
      { set: 'sich vorstellen', questions: [{ question: 'wie heißt du?' }, { question: 'Wo bist du geboren?' }, { question: 'Wo bist du geboren? ' }] },
      database,
    )
    expect(result).toEqual({ set: 'Sich vorstellen', added: 1, skipped: ['wie heißt du?', 'Wo bist du geboren?'] })
    expect(await database.questions.where('set').equals('Sich vorstellen').count()).toBe(13)
  })

  it('rejects bad input without saving anything', async () => {
    const before = await database.questions.count()
    const one = [{ question: 'Wie geht es dir?' }]
    await expectCode(runAction('create_questions', { set: ' ', questions: one }, database), 'invalid_input')
    await expectCode(runAction('create_questions', { set: 'x'.repeat(61), questions: one }, database), 'invalid_input')
    await expectCode(runAction('create_questions', { set: 'Alltag', questions: [] }, database), 'invalid_input')
    await expectCode(runAction('create_questions', { set: 'Alltag', questions: [...one, { question: '  ' }] }, database), 'invalid_input')
    await expectCode(runAction('create_questions', { set: 'Alltag', questions: [{ question: 'Was?', suggested: 'a'.repeat(501) }] }, database), 'invalid_input')
    await expectCode(runAction('create_questions', { set: 'Alltag', questions: [{ question: 'Was?', level: 'D1' as 'A1' }] }, database), 'invalid_input')
    await expectCode(runAction('create_questions', { set: 'Alltag', questions: [{ question: 'Was?', words: Array.from({ length: 13 }, (_, i) => `Wort ${i}`) }] }, database), 'invalid_input')
    await expectCode(runAction('create_questions', { set: 'Alltag', questions: Array.from({ length: 51 }, (_, i) => ({ question: `Frage ${i}?` })) }, database), 'invalid_input')
    expect(await database.questions.count()).toBe(before)
  })
})

describe('create_task', () => {
  it('adds a task to To do with medium priority by default', async () => {
    const task = await runAction('create_task', { title: 'Review food words', topic: 'German', dueDate: '2026-10-20' }, database)
    expect(task).toMatchObject({ title: 'Review food words', status: 'todo', priority: 'medium', dueDate: '2026-10-20', topic: 'German' })
    expect((await database.tasks.get(task.id))?.topicId).toBeDefined()
  })

  it('rejects a bad due date', async () => {
    await expectCode(runAction('create_task', { title: 'Later', dueDate: 'next friday' }, database), 'invalid_input')
  })
})

describe('log_study_time', () => {
  it('saves a session that ends now by default', async () => {
    const session = await runAction('log_study_time', { topic: 'German', minutes: 30, note: 'Past tense' }, database)
    expect(session).toEqual({ topic: 'German', minutes: 30, start: '2026-10-15T09:30', end: '2026-10-15T10:00' })
    const saved = await database.sessions.toArray()
    expect(saved).toHaveLength(1)
    expect(saved[0]).toMatchObject({ minutes: 30, date: '2026-10-15', note: 'Past tense' })
  })

  it('splits a session that crosses midnight', async () => {
    await runAction('log_study_time', { topic: 'AI', minutes: 60, start: '2026-10-14T23:30' }, database)
    expect((await database.sessions.orderBy('start').toArray()).map((s) => [s.date, s.minutes])).toEqual([
      ['2026-10-14', 30],
      ['2026-10-15', 30],
    ])
  })

  it('rejects time in the future and impossible lengths', async () => {
    await expectCode(runAction('log_study_time', { topic: 'German', minutes: 30, start: '2026-10-15T09:45' }, database), 'invalid_input')
    await expectCode(runAction('log_study_time', { topic: 'German', minutes: 0 }, database), 'invalid_input')
    await expectCode(runAction('log_study_time', { topic: 'German', minutes: 30, start: 'this morning' }, database), 'invalid_input')
  })
})

describe('handleRequest', () => {
  it('wraps results and errors in responses', async () => {
    expect(await handleRequest({ type: 'request', id: 'r1', action: 'list_topics', params: {} }, database)).toMatchObject({
      type: 'response',
      id: 'r1',
      ok: true,
      result: [{ name: 'German' }, { name: 'AI' }],
    })
    expect(await handleRequest({ type: 'request', id: 'r2', action: 'create_task', params: { title: ' ' } }, database)).toEqual({
      type: 'response',
      id: 'r2',
      ok: false,
      error: { code: 'invalid_input', message: 'A task needs a title.' },
    })
  })

  it('answers an unknown action with an error instead of throwing', async () => {
    const request = { type: 'request', id: 'r3', action: 'delete_everything', params: {} } as unknown as Parameters<typeof handleRequest>[0]
    expect(await handleRequest(request, database)).toMatchObject({ ok: false, error: { code: 'invalid_input' } })
  })
})
