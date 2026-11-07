import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getSettings, KV_KEYS, LernzeitDB } from '@/db/db'
import { levelSummary, loadPack } from '@/languages'
import { addStarterContent, hasLearningData, installLevels, markLegacyLevels, syncStarterTopics } from './languages'
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
  it('starts empty, for your own words', async () => {
    expect(await hasLearningData(database)).toBe(false)
    expect(await database.topics.count()).toBe(0)
    // The updates for installs from before packs leave it empty too.
    expect(await syncStarterTopics(database)).toEqual({ added: 0, updated: 0 })
    expect(await hasLearningData(database)).toBe(false)
  })

  it('installs the level picked: a German topic, its decks, stories, questions and grammar', async () => {
    const result = await installLevels(['A1'], database)
    const summary = levelSummary(await loadPack(), 'A1')
    expect(result).toEqual({ cards: summary.words + summary.sentences, stories: summary.stories, questions: summary.questions, topics: summary.grammar })
    expect(await hasLearningData(database)).toBe(true)

    const [topic, ...others] = await database.topics.toArray()
    expect(others).toEqual([])
    expect(topic).toMatchObject({ name: 'German', goalMinutes: { mon: 30 } })
    const decks = await database.decks.toArray()
    expect(decks.every((d) => d.topicId === topic.id)).toBe(true)
    expect((await database.stories.toArray()).every((s) => s.topicId === topic.id && s.level === 'A1')).toBe(true)
    // Every card can be practised.
    expect(await database.reviews.where('cardId').equals('de-0046').count()).toBeGreaterThan(0)
    expect(await getSettings(database)).toMatchObject({ levels: ['A1'] })
  })

  it('adds another level without repeating anything', async () => {
    await installLevels(['A1'], database)
    const cards = await database.cards.count()
    const added = await installLevels(['A2'], database)
    expect(added.cards).toBeGreaterThan(0)
    expect(await database.cards.count()).toBe(cards + added.cards)
    expect(await database.topics.count()).toBe(1)
    expect((await getSettings(database)).levels).toEqual(['A1', 'A2'])
    expect(await installLevels(['A2'], database)).toEqual({ cards: 0, stories: 0, questions: 0, topics: 0 })
  })

  it('adds back deleted starter stories of the levels you have, and no others', async () => {
    await installLevels(['A2'], database)
    const [story, ...rest] = await database.stories.toArray()
    await deleteStory(story.id, database)
    expect(await addStarterContent('stories', database)).toBe(1)
    expect(await database.stories.count()).toBe(rest.length + 1)
    expect((await database.stories.toArray()).every((s) => s.level === 'A2')).toBe(true)
  })

  it('adds starter content of every level before any level is added', async () => {
    const added = await addStarterContent('stories', database)
    expect(added).toBe((await loadPack()).stories.length)
    expect(await addStarterContent('stories', database)).toBe(0)
  })

  it('says what is wrong with a choice', async () => {
    await expect(installLevels(['C2'], database)).rejects.toThrow('no C2 level')
    await expect(installLevels([], database)).rejects.toThrow('Pick a level')
    expect(await hasLearningData(database)).toBe(false)
  })

  it('stores the pictures of the starter cards that have one', async () => {
    await installLevels(['A1'], database)
    const apple = (await database.cards.get('de-0046'))!
    expect((await database.images.get(apple.imageId!))?.blob.type).toBe('image/svg+xml')
  })
})

describe('an install from before packs', () => {
  it('gets every level once, as it had them', async () => {
    await database.kv.bulkPut([
      { key: KV_KEYS.seeded, value: 1 },
      { key: KV_KEYS.settings, value: { theme: 'dark' } },
    ])
    await markLegacyLevels(database)
    expect(await getSettings(database)).toMatchObject({ levels: ['A1', 'A2', 'B1'], theme: 'dark' })
    // Levels you have since chosen stay.
    await database.kv.put({ key: KV_KEYS.settings, value: { levels: ['A1'] } })
    await markLegacyLevels(database)
    expect((await getSettings(database)).levels).toEqual(['A1'])
  })

  it('leaves new installs alone', async () => {
    await markLegacyLevels(database)
    expect((await getSettings(database)).levels).toEqual([])
  })
})
