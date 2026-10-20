import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getSettings, KV_KEYS, LernzeitDB } from '@/db/db'
import { levelSummary, loadPack } from '@/languages'
import { addStarterContent, hasLearningData, installLanguage, languageOf, markLegacyLevels, syncStarterTopics } from './languages'
import { deleteStory } from './stories'

let database: LernzeitDB
let counter = 0

beforeEach(() => {
  database = new LernzeitDB(`languages-test-${counter++}`)
})

afterEach(async () => {
  await database.delete()
})

describe('a new install', () => {
  it('starts empty, so Welcome offers the packs', async () => {
    expect(await hasLearningData(database)).toBe(false)
    expect(await database.topics.count()).toBe(0)
    // The updates for installs from before packs leave it empty too.
    expect(await syncStarterTopics(database)).toEqual({ added: 0, updated: 0 })
    expect(await hasLearningData(database)).toBe(false)
  })

  it('installs the level picked: a topic named after the language, its decks, stories, questions and grammar', async () => {
    const result = await installLanguage({ learning: 'fr', native: 'en', levels: ['A1'] }, database)
    const summary = levelSummary(await loadPack('fr'), 'A1')
    expect(result).toEqual({ cards: summary.words + summary.sentences, stories: summary.stories, questions: summary.questions, topics: summary.grammar })
    expect(await hasLearningData(database)).toBe(true)

    const [topic, ...others] = await database.topics.toArray()
    expect(others).toEqual([])
    expect(topic).toMatchObject({ name: 'French', goalMinutes: { mon: 30 } })
    const decks = await database.decks.orderBy('order').toArray()
    expect(decks.map((d) => d.name)).toEqual(['French Words', 'French Everyday Sentences'])
    expect(decks.every((d) => d.topicId === topic.id)).toBe(true)
    expect((await database.stories.toArray()).every((s) => s.topicId === topic.id && s.level === 'A1')).toBe(true)
    expect(await database.cards.get('fr-0025')).toMatchObject({ german: 'le chien', english: 'dog', exampleDe: 'Le chien joue dans le jardin.' })
    // Every card can be practised.
    expect(await database.reviews.where('cardId').equals('fr-0025').count()).toBeGreaterThan(0)
    expect(await getSettings(database)).toMatchObject({ learning: 'fr', native: 'en', levels: ['A1'] })
  })

  it('adds another level of the same language without repeating anything', async () => {
    await installLanguage({ learning: 'es', native: 'en', levels: ['A1'] }, database)
    const cards = await database.cards.count()
    const added = await installLanguage({ learning: 'es', native: 'en', levels: ['A2'] }, database)
    expect(added.cards).toBeGreaterThan(0)
    expect(await database.cards.count()).toBe(cards + added.cards)
    expect(await database.topics.count()).toBe(1)
    expect((await getSettings(database)).levels).toEqual(['A1', 'A2'])
    expect(await installLanguage({ learning: 'es', native: 'en', levels: ['A2'] }, database)).toEqual({ cards: 0, stories: 0, questions: 0, topics: 0 })
  })

  it('adds back deleted starter stories of the levels you have, and no others', async () => {
    await installLanguage({ learning: 'es', native: 'en', levels: ['A1'] }, database)
    const stories = await database.stories.count()
    await deleteStory('es-story-01', database)
    expect(await addStarterContent('stories', database)).toBe(1)
    expect(await database.stories.count()).toBe(stories)
    expect(await database.stories.get('es-story-04')).toBeUndefined()
  })

  it('writes meanings and explanations in the native language picked', async () => {
    await installLanguage({ learning: 'en', native: 'ar', levels: ['A1'] }, database)
    expect(await database.cards.get('en-0025')).toMatchObject({ german: 'dog', english: 'كلب' })
    expect((await database.stories.get('en-story-01'))?.translation).toContain('تسكن إيما في لندن')
    const grammar = (await database.grammarTopics.get('en-grammar-01'))!
    expect(grammar.english).toBe('فعل الكون: am و is و are')
    expect(grammar.rule).toContain('الفعل **to be**')
    expect(grammar.exercises[0].why).toBe('مع I نستعمل am.')
    expect(languageOf(await getSettings(database))).toMatchObject({ name: 'English', speech: 'en-US', rtl: false, native: { code: 'ar', name: 'Arabic', rtl: true } })
  })

  it('learns one language at a time: another needs a reset', async () => {
    await installLanguage({ learning: 'fr', native: 'en', levels: ['A1'] }, database)
    await expect(installLanguage({ learning: 'es', native: 'en', levels: ['A1'] }, database)).rejects.toThrow('Reset all data')
  })

  it('says what is wrong with a choice', async () => {
    await expect(installLanguage({ learning: 'xx', native: 'en', levels: ['A1'] }, database)).rejects.toThrow('no xx pack')
    await expect(installLanguage({ learning: 'fr', native: 'de', levels: ['A1'] }, database)).rejects.toThrow('not written in German')
    await expect(installLanguage({ learning: 'fr', native: 'en', levels: ['C2'] }, database)).rejects.toThrow('no C2 level')
    await expect(installLanguage({ learning: 'fr', native: 'en', levels: [] }, database)).rejects.toThrow('Pick a level')
    expect(await hasLearningData(database)).toBe(false)
  })

  it('stores the pictures of the German starter cards that have one', async () => {
    await installLanguage({ learning: 'de', native: 'en', levels: ['A1'] }, database)
    const apple = (await database.cards.get('de-0046'))!
    expect((await database.images.get(apple.imageId!))?.blob.type).toBe('image/svg+xml')
    expect(await getSettings(database)).toMatchObject({ learning: 'de', levels: ['A1'] })
  })
})

describe('an install from before packs', () => {
  it('gets every German level once, as it had them', async () => {
    await database.kv.bulkPut([
      { key: KV_KEYS.seeded, value: 1 },
      { key: KV_KEYS.settings, value: { theme: 'dark' } },
    ])
    await markLegacyLevels(database)
    expect(await getSettings(database)).toMatchObject({ learning: 'de', native: 'en', levels: ['A1', 'A2', 'B1'], theme: 'dark' })
    // Levels you have since chosen stay.
    await database.kv.put({ key: KV_KEYS.settings, value: { levels: ['A1'] } })
    await markLegacyLevels(database)
    expect((await getSettings(database)).levels).toEqual(['A1'])
  })

  it('leaves new installs and other languages alone', async () => {
    await markLegacyLevels(database)
    expect((await getSettings(database)).levels).toEqual([])
    await database.kv.bulkPut([
      { key: KV_KEYS.seeded, value: 1 },
      { key: KV_KEYS.settings, value: { learning: 'fr' } },
    ])
    await markLegacyLevels(database)
    expect((await getSettings(database)).levels).toEqual([])
  })
})
