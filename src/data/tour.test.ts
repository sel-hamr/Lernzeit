import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { LernzeitDB } from '@/db/db'
import { resetAllData } from './io'
import { setUpLernzeit, startEmpty } from './starter'
import { getTourState, markTourSeen, queueTour } from './tour'

let database: LernzeitDB
let counter = 0

beforeEach(() => {
  database = new LernzeitDB(`tour-${counter++}`)
})

afterEach(async () => {
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

  it('is forgotten with the rest of the data', async () => {
    await markTourSeen(database)
    await resetAllData(database)
    expect(await getTourState(database)).toBe('none')
  })
})
