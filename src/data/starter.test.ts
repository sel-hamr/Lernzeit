import 'fake-indexeddb/auto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getSettings, LernzeitDB } from '@/db/db'
import { setFetch } from '@/sync/api'
import { signedIn, useTestCloud } from '@/test/cloud'
import { resetAllData } from './io'
import { GERMAN_SUMMARY, loadStarterFile, parseStarterFile, setUpLernzeit, shouldOfferStarter, startEmpty, STARTER_URL, type StarterFile } from './starter'
import { createTask } from './tasks'

const shipped = (): StarterFile => parseStarterFile(JSON.parse(readFileSync(fileURLToPath(new URL('../../public/starter/german.json', import.meta.url)), 'utf8')))

let database: LernzeitDB
let counter = 0

beforeEach(async () => {
  useTestCloud()
  database = await signedIn(new LernzeitDB(`starter-${counter++}`))
})

afterEach(async () => {
  setFetch()
  await database.delete()
})

describe('welcome offer', () => {
  it('is offered to an empty browser', async () => {
    expect(await shouldOfferStarter(database)).toBe(true)
  })

  it('is not offered once there is data', async () => {
    await createTask({ title: 'Buy milk', priority: 'medium', status: 'todo' }, database)
    expect(await shouldOfferStarter(database)).toBe(false)
  })

  it('is not offered again after starting empty', async () => {
    await startEmpty(database)
    expect(await shouldOfferStarter(database)).toBe(false)
    expect(await database.topics.count()).toBe(0)
  })

  it('is offered again after deleting all data', async () => {
    await startEmpty(database)
    await resetAllData(database)
    expect(await shouldOfferStarter(database)).toBe(true)
  })
})

describe('setting up', () => {
  it('creates a topic with a daily goal for each pick', async () => {
    const result = await setUpLernzeit([{ name: 'AI', minutes: 45, color: 'blue' }, { name: ' Piano ', minutes: 15 }, { name: 'piano', minutes: 90 }], undefined, database)
    expect(result).toEqual({ topics: 2, cards: 0, stories: 0, questions: 0, grammar: 0 })
    const topics = await database.topics.orderBy('order').toArray()
    expect(topics.map((t) => [t.name, t.color, t.goalMinutes.mon, t.goalMinutes.sun])).toEqual([
      ['AI', 'blue', 45, 45],
      ['Piano', 'sage', 15, 15],
    ])
    expect(await database.decks.count()).toBe(0)
    expect(await shouldOfferStarter(database)).toBe(false)
  })

  it('adds the German content under the German topic, with no one’s progress', async () => {
    const german = shipped()
    const result = await setUpLernzeit([{ name: 'German', minutes: 60, color: 'sage' }, { name: 'AI', minutes: 30, color: 'blue' }], german, database)
    expect(result).toEqual({ topics: 2, cards: GERMAN_SUMMARY.cards, stories: GERMAN_SUMMARY.stories, questions: GERMAN_SUMMARY.questions, grammar: GERMAN_SUMMARY.grammar })

    const topic = (await database.topics.toArray()).find((t) => t.name === 'German')!
    expect(topic.goalMinutes.wed).toBe(60)
    const decks = await database.decks.toArray()
    expect(decks).toHaveLength(GERMAN_SUMMARY.decks)
    expect(decks.every((d) => d.topicId === topic.id)).toBe(true)
    expect((await database.stories.toArray()).every((s) => s.topicId === topic.id && s.readCount === 0)).toBe(true)
    expect(await database.images.count()).toBe(german.pack.cards.filter((c) => c.image).length)

    // Every card is new: nothing studied, nothing logged.
    const reviews = await database.reviews.toArray()
    expect(reviews.length).toBeGreaterThanOrEqual(GERMAN_SUMMARY.cards)
    expect(reviews.every((r) => r.fsrs.reps === 0)).toBe(true)
    for (const table of [database.sessions, database.reviewLogs, database.practiceRuns, database.tasks, database.responses, database.drillStats, database.exerciseStats]) {
      expect(await table.count()).toBe(0)
    }
    expect((await getSettings(database)).levels).toEqual(['A1', 'A2', 'B1'])
  })

  it('keeps a typed-in goal, rounded to whole minutes', async () => {
    await setUpLernzeit([{ name: 'Piano', minutes: 75.4 }, { name: 'Chess', minutes: -5 }], undefined, database)
    const goals = Object.fromEntries((await database.topics.toArray()).map((t) => [t.name, t.goalMinutes.fri]))
    expect(goals).toEqual({ Piano: 75, Chess: 0 })
  })

  it('adds a German topic when only the content is given', async () => {
    await setUpLernzeit([], shipped(), database)
    expect((await database.topics.toArray()).map((t) => [t.name, t.goalMinutes.mon])).toEqual([['German', 30]])
  })
})

describe('the German starter file', () => {
  it('matches the summary the welcome screen shows', () => {
    const german = shipped()
    expect({
      decks: german.pack.decks.length,
      cards: german.pack.cards.length,
      stories: german.stories.length,
      questions: german.questions.length,
      grammar: german.grammarTopics.length,
    }).toEqual(GERMAN_SUMMARY)
  })

  it('holds nothing personal', () => {
    const text = readFileSync(fileURLToPath(new URL('../../public/starter/german.json', import.meta.url)), 'utf8')
    for (const field of ['sessions', 'reviewLogs', 'practiceRuns', 'tasks', 'responses', 'fsrs', 'readCount', 'openedAt', 'myAnswer', 'settings', 'goalMinutes']) {
      expect(text).not.toContain(`"${field}"`)
    }
  })

  it('downloads from the app', async () => {
    let asked = ''
    const body = readFileSync(fileURLToPath(new URL('../../public/starter/german.json', import.meta.url)), 'utf8')
    const fetcher = (async (url: string) => {
      asked = url
      return new Response(body)
    }) as typeof fetch
    expect((await loadStarterFile(fetcher)).pack.cards).toHaveLength(GERMAN_SUMMARY.cards)
    expect(asked).toBe(STARTER_URL)
  })

  it('says when the download fails', async () => {
    const fetcher = (async () => new Response('missing', { status: 404 })) as typeof fetch
    await expect(loadStarterFile(fetcher)).rejects.toThrow('Could not download')
  })

  it('says when the server answers with a page instead of the file', async () => {
    const fetcher = (async () => new Response('<!doctype html><html></html>')) as typeof fetch
    await expect(loadStarterFile(fetcher)).rejects.toThrow('missing from this copy')
  })

  it('rejects a file that is not a starter', () => {
    expect(() => parseStarterFile({ app: 'lernzeit' })).toThrow('missing from this copy')
  })
})
