import { beforeEach, describe, expect, it } from 'vitest'
import type { Story } from '../types'
import { expectCode, makeStore, NOW } from './fixture'
import { AI_TAG, runAction } from './index'

let store: ReturnType<typeof makeStore>

beforeEach(() => {
  store = makeStore()
})

const text = 'Ich koche heute Nudeln.\n\nDas Essen ist lecker.'

describe('create_story', () => {
  it('adds a story with the ai tag, read toward German by default', async () => {
    const { story, created } = await runAction(store, 'create_story', {
      title: ' In der Küche ',
      text,
      translation: 'I am cooking pasta today.\n\nThe food is tasty.',
      level: 'A1',
      tags: ['food'],
    })
    expect(created).toBe(true)
    expect(story).toMatchObject({ title: 'In der Küche', level: 'A1', words: 8, paragraphs: 2, topic: 'German' })
    expect(await store.get<Story>('stories', story.id)).toEqual({
      id: story.id,
      title: 'In der Küche',
      text,
      translation: 'I am cooking pasta today.\n\nThe food is tasty.',
      level: 'A1',
      topicId: 'german',
      tags: ['food', AI_TAG],
      createdAt: NOW,
      updatedAt: NOW,
      readCount: 0,
    })
  })

  it('returns the existing story when the same text comes again', async () => {
    const before = await store.count('stories')
    const first = await runAction(store, 'create_story', { title: 'Küche', text })
    const again = await runAction(store, 'create_story', { title: 'Another title', text: `  ${text}\n` })
    expect(again).toEqual({ story: first.story, created: false })
    expect(await store.count('stories')).toBe(before + 1)
  })

  it('links a topic by name and rejects bad input without saving', async () => {
    const { story } = await runAction(store, 'create_story', { title: 'KI', text: 'Die KI lernt.', topic: 'ai' })
    expect(story.topic).toBe('AI')
    const before = await store.count('stories')
    await expectCode(runAction(store, 'create_story', { title: ' ', text }), 'invalid_input')
    await expectCode(runAction(store, 'create_story', { title: 'x', text: '  ' }), 'invalid_input')
    // An AI app could send any string; the type only covers well-formed calls.
    await expectCode(runAction(store, 'create_story', { title: 'x', text, level: 'D1' as 'A1' }), 'invalid_input')
    await expectCode(runAction(store, 'create_story', { title: 'x', text: 'a'.repeat(20_001) }), 'invalid_input')
    await expectCode(runAction(store, 'create_story', { title: 'x', text, topic: 'Spanish' }), 'topic_not_found')
    expect(await store.count('stories')).toBe(before)
  })

  describe('teaching notes', () => {
    const note = {
      word: 'Nudeln',
      sentence: 'Ich koche heute Nudeln.',
      baseForm: 'Nudel',
      gender: 'die' as const,
      partOfSpeech: 'noun',
      translation: 'pasta',
      meaning: 'Long, thin food made from flour.',
      grammar: {
        rule: 'Most die words get -n in the plural.',
        why: 'There is more than one piece of pasta, so **Nudel** becomes **Nudeln**.',
        example: { text: 'Ich esse zwei Birnen.', translation: 'I am eating two pears.' },
      },
      tip: 'Think of a whole plate of them.',
    }

    it('saves the notes and reports them', async () => {
      const { story, words } = await runAction(store, 'create_story', { title: 'Küche', text, words: [note] })
      expect(words).toEqual({ saved: 1, skipped: [] })
      expect((await store.get<Story>('stories', story.id))?.words).toEqual([note])
    })

    it('saves a short note on an easy word', async () => {
      const short = { word: 'heute', sentence: 'Ich koche heute Nudeln.', baseForm: 'heute', partOfSpeech: 'adverb', translation: 'today' }
      const { story, words } = await runAction(store, 'create_story', { title: 'Küche', text, words: [short] })
      expect(words).toEqual({ saved: 1, skipped: [] })
      expect((await store.get<Story>('stories', story.id))?.words).toEqual([short])
    })

    it('reports no notes for a call without them', async () => {
      expect(await runAction(store, 'create_story', { title: 'Küche', text })).not.toHaveProperty('words')
    })

    it('saves the story and reports the notes it cannot use', async () => {
      const { grammar, ...plain } = note
      const { created, story, words } = await runAction(store, 'create_story', {
        title: 'Küche',
        text,
        words: [
          plain,
          { ...note, sentence: 'Ich koche morgen Nudeln.' },
          { ...note, word: 'Reis' },
          { ...note, baseForm: '  ' },
          { ...note, translation: 'a'.repeat(301) },
          { ...note, gender: 'den' as 'der' },
          { ...note, grammar: { ...grammar, why: '' } },
        ],
      })
      expect(created).toBe(true)
      expect(words?.saved).toBe(1)
      expect(words?.skipped.map((s) => s.reason)).toEqual([
        'The sentence is not in the story. Copy it exactly.',
        '"Reis" is not one word of that sentence. Copy one word exactly.',
        'baseForm is missing.',
        'Keep translation under 300 characters.',
        'gender must be der, die or das.',
        'grammar.why is missing.',
      ])
      expect(words?.skipped[1]).toEqual({ word: 'Reis', sentence: 'Ich koche heute Nudeln.', reason: '"Reis" is not one word of that sentence. Copy one word exactly.' })
      expect((await store.get<Story>('stories', story.id))?.words).toEqual([plain])
    })

    it('replaces the notes of a story with the same text, and keeps them when a call brings no good ones', async () => {
      let now = NOW
      const notes = makeStore(undefined, { now: () => now })
      const { story } = await runAction(notes, 'create_story', { title: 'Küche', text })
      const later = (now = NOW + 60_000)

      const first = await runAction(notes, 'create_story', { title: 'Küche', text, words: [note] })
      expect(first).toMatchObject({ created: false, words: { saved: 1, skipped: [] } })
      expect(await notes.get<Story>('stories', story.id)).toMatchObject({ words: [note], createdAt: NOW, updatedAt: later })

      const bad = await runAction(notes, 'create_story', { title: 'Küche', text, words: [{ ...note, sentence: 'Nein.' }] })
      expect(bad.words?.saved).toBe(0)
      await runAction(notes, 'create_story', { title: 'Küche', text })
      expect((await notes.get<Story>('stories', story.id))?.words).toEqual([note])
    })

    it('refuses too many notes, and notes that are not a list', async () => {
      const before = await store.count('stories')
      await expectCode(runAction(store, 'create_story', { title: 'x', text, words: Array.from({ length: 151 }, () => note) }), 'invalid_input')
      await expectCode(runAction(store, 'create_story', { title: 'x', text, words: 'lots' as unknown as [] }), 'invalid_input')
      expect(await store.count('stories')).toBe(before)
    })
  })
})
