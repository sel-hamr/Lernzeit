import { beforeEach, describe, expect, it } from 'vitest'
import type { GrammarTopic } from '../types'
import { expectCode, makeStore, NOW } from './fixture.test-utils'
import { runAction } from './index'

let store: ReturnType<typeof makeStore>

// The seed has no grammar topics: only the ones the AI adds.
beforeEach(() => {
  store = makeStore()
})

const exercise = { text: 'Ich helfe {{dem|den}} Mann.', en: 'I help the man.', why: 'helfen takes the dative.' }

describe('add_grammar', () => {
  it('starts a new topic with its rule, examples and exercises', async () => {
    const result = await runAction(store, 'add_grammar', {
      topic: ' Verben mit  Dativ ',
      english: 'Verbs with the dative',
      group: 'Verbs',
      level: 'A2',
      rule: 'Some verbs take a **dative** object.',
      examples: [{ de: 'Ich helfe dir.', en: 'I help you.' }],
      exercises: [exercise, { text: '~ Das gehört mir.' }],
    })
    expect(result).toMatchObject({ created: true, added: 2, skipped: [], topic: { title: 'Verben mit Dativ', group: 'Verbs', level: 'A2', exercises: 2 } })
    const saved = (await store.get<GrammarTopic>('grammarTopics', result.topic.id))!
    expect(saved).toMatchObject({ rule: 'Some verbs take a **dative** object.', english: 'Verbs with the dative', examples: [{ de: 'Ich helfe dir.', en: 'I help you.' }], createdAt: NOW, updatedAt: NOW })
    expect(saved.exercises[0]).toMatchObject({ text: 'Ich helfe {{dem|den}} Mann.', en: 'I help the man.', why: 'helfen takes the dative.' })
    expect(saved.exercises[1]).toEqual({ id: expect.any(String), text: '~ Das gehört mir.' })
    expect(saved).not.toHaveProperty('drill')
    expect(await runAction(store, 'list_grammar_topics', {})).toEqual([expect.objectContaining({ id: saved.id, title: 'Verben mit Dativ', exercises: 2 })])
  })

  it('adds to a topic found by title in any case, keeps its rule, and skips exercises it has', async () => {
    const first = await runAction(store, 'add_grammar', { topic: 'Dativ', rule: 'The rule.', exercises: [exercise] })
    const again = await runAction(store, 'add_grammar', {
      topic: 'dativ',
      rule: 'Another rule.',
      group: 'Ignored',
      exercises: [{ text: ' ich helfe {{dem|den}} mann. ' }, { text: 'Er dankt {{dem}} Arzt.' }],
      examples: [{ de: 'Ich danke dir.' }],
    })
    expect(again).toMatchObject({ created: false, added: 1, skipped: ['ich helfe {{dem|den}} mann.'], topic: { id: first.topic.id, exercises: 2 } })
    const saved = (await store.get<GrammarTopic>('grammarTopics', first.topic.id))!
    expect(saved).toMatchObject({ rule: 'The rule.', group: 'My topics', examples: [{ de: 'Ich danke dir.' }] })
    expect(saved.exercises.map((e) => e.text)).toEqual(['Ich helfe {{dem|den}} Mann.', 'Er dankt {{dem}} Arzt.'])
  })

  it('fills in the rule of a topic that has none, and finds a topic by id', async () => {
    const first = await runAction(store, 'add_grammar', { topic: 'Dativ', exercises: [exercise] })
    const again = await runAction(store, 'add_grammar', { topic: first.topic.id, rule: 'The rule.' })
    expect(again).toMatchObject({ created: false, added: 0 })
    expect((await store.get<GrammarTopic>('grammarTopics', first.topic.id))?.rule).toBe('The rule.')
    await expectCode(runAction(store, 'add_grammar', { topic: 'Dativ' }), 'invalid_input')
  })

  it('rejects exercises it cannot use, without saving anything', async () => {
    await expectCode(runAction(store, 'add_grammar', { topic: 'X', exercises: [{ text: 'Ich helfe dem Mann.' }] }), 'invalid_input')
    await expectCode(runAction(store, 'add_grammar', { topic: 'X', exercises: [{ text: 'Ich hel{{f>p}}e.' }] }), 'invalid_input')
    await expectCode(runAction(store, 'add_grammar', { topic: ' ', exercises: [exercise] }), 'invalid_input')
    await expectCode(runAction(store, 'add_grammar', { topic: 'X' }), 'invalid_input')
    await expectCode(runAction(store, 'add_grammar', { topic: 'X', level: 'D1' as 'A1', exercises: [exercise] }), 'invalid_input')
    await expectCode(runAction(store, 'add_grammar', { topic: 'X', exercises: Array.from({ length: 51 }, () => exercise) }), 'invalid_input')
    const error = await expectCode(runAction(store, 'add_grammar', { topic: 'X', exercises: [exercise, { text: 'kein Gap' }] }), 'invalid_input')
    expect(error.message).toContain('Exercise 2')
    expect(await store.count('grammarTopics')).toBe(0)
    expect(store.committed).toEqual([])
  })
})
