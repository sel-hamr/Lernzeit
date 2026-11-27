import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { LernzeitDB, updateSettings } from '@/db/db'
import { setFetch } from '@/sync/api'
import { signedIn, useTestCloud } from '@/test/cloud'
import { resetAllData } from './io'
import { setUpLernzeit, startEmpty } from './starter'
import { getTourFacts, getTourState, markTourSeen, queueTour } from './tour'

let database: LernzeitDB
let counter = 0

beforeEach(async () => {
  useTestCloud()
  database = await signedIn(new LernzeitDB(`tour-${counter++}`))
})

afterEach(async () => {
  setFetch()
  await database.delete()
})

describe('tour state', () => {
  it('starts with no tour asked for', async () => {
    expect(await getTourState(database)).toBe('none')
  })

  it('waits once asked for, until it is seen', async () => {
    await queueTour(database)
    expect(await getTourState(database)).toBe('pending')
    await markTourSeen(database)
    expect(await getTourState(database)).toBe('seen')
  })

  it('can be asked for again after it was seen', async () => {
    await markTourSeen(database)
    await queueTour(database)
    expect(await getTourState(database)).toBe('pending')
  })

  it('follows the welcome screen when topics are set up', async () => {
    await setUpLernzeit([{ name: 'AI', minutes: 30 }], undefined, database)
    expect(await getTourState(database)).toBe('pending')
  })

  it('follows the welcome screen when starting empty', async () => {
    await startEmpty(database)
    expect(await getTourState(database)).toBe('pending')
  })

  it('knows when there is nothing to practise or read', async () => {
    expect(await getTourFacts(database)).toEqual({ cards: false, story: undefined, recall: true })
  })

  it('opens the story highest in the list that has word notes', async () => {
    const base = { level: 'A1' as const, tags: [], readCount: 0, text: 'Ein Tag.' }
    await database.stories.bulkAdd([
      { ...base, id: 'old-noted', title: 'Old', createdAt: 1, words: [{ word: 'Tag', note: { meaning: 'day' } }] },
      { ...base, id: 'new-plain', title: 'New', createdAt: 3 },
      { ...base, id: 'opened-noted', title: 'Opened', createdAt: 2, openedAt: 5, words: [{ word: 'Tag', note: { meaning: 'day' } }] },
    ] as never)
    expect((await getTourFacts(database)).story).toBe('opened-noted')
  })

  it('falls back to the first story when none has notes', async () => {
    const base = { level: 'A1' as const, tags: [], readCount: 0, text: 'Ein Tag.' }
    await database.stories.bulkAdd([
      { ...base, id: 'older', title: 'Older', createdAt: 1 },
      { ...base, id: 'newer', title: 'Newer', createdAt: 2 },
    ] as never)
    expect((await getTourFacts(database)).story).toBe('newer')
  })

  it('knows when practice asks you to type', async () => {
    await updateSettings({ typingMode: true }, database)
    expect((await getTourFacts(database)).recall).toBe(false)
  })

  it('belongs to this device, so a library reset keeps it', async () => {
    await markTourSeen(database)
    await resetAllData(database)
    expect(await getTourState(database)).toBe('seen')
  })
})
