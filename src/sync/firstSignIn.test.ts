import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getSettings, LernzeitDB } from '@/db/db'
import { SYNC_TABLES, imageMeta } from '@lernzeit/core/sync'
import type { Card, CardReview, Deck, Direction, ReviewLog, StoredImage, Topic } from '@lernzeit/core/types'
import { createTestServer, type TestServer } from '@/test/syncServer'
import { setFetch } from './api'
import { stopSync, syncNow } from './engine'
import { mergeIntoCloud, mergeSummaryText } from './firstSignIn'

let server: TestServer
let a: LernzeitDB
let b: LernzeitDB
let counter = 0

const week = { mon: 0, tue: 0, wed: 0, thu: 0, fri: 0, sat: 0, sun: 0 }
const topic = (id: string, name = 'German'): Topic => ({ id, name, color: 'sage', goalMinutes: week, goalHistory: [], archived: false, order: 0, createdAt: 1 })
const deck = (id: string, topicId: string, name = 'Basics'): Deck =>
  ({ id, name, topicId, newPerDay: 10, reviewsPerDay: 100, directions: { imageToDe: false, enToDe: true, deToEn: true }, order: 0, createdAt: 1 }) as Deck
const card = (id: string, deckId: string, german: string, english: string): Card => ({ id, deckId, type: 'word', german, english, createdAt: 1 }) as Card
const review = (cardId: string, deckId: string, reps: number, lastReview: number, direction: Direction = 'enToDe'): CardReview => ({
  id: `${cardId}:${direction}`,
  cardId,
  deckId,
  direction,
  fsrs: { due: 0, stability: reps, difficulty: 5, elapsed_days: 0, scheduled_days: reps, learning_steps: 0, reps, lapses: 0, state: 2, last_review: lastReview },
  due: reps * 100,
  state: 2,
})
const logs = (prefix: string, cardId: string, deckId: string, n: number, direction: Direction = 'enToDe'): ReviewLog[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `${prefix}${i}`, reviewId: `${cardId}:${direction}`, cardId, deckId, direction, rating: 3, prevState: 2, reviewedAt: i + 1, durationMs: 1000, day: '2026-11-21',
  }) as ReviewLog)
const image = (id: string, bytes = 'png bytes'): StoredImage => ({ id, blob: new Blob([bytes], { type: 'image/png' }), width: 40, height: 30, fit: 'cover' })

/** Every synced row of a database (images as their metadata), the outbox and `merged`. */
async function snapshot(database: LernzeitDB) {
  const tables: Record<string, unknown[]> = {}
  for (const tbl of SYNC_TABLES) {
    const rows = await database.table(tbl).toArray()
    tables[tbl] = tbl === 'images' ? (rows as StoredImage[]).map(imageMeta) : rows
  }
  return { tables, outbox: await database.outbox.toArray(), merged: (await database.meta.get('merged'))?.value }
}

const live = (tbl: string) => [...server.records.values()].filter((r) => r.tbl === tbl && !r.deleted)

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(1_000)
  server = createTestServer()
  setFetch(server.fetch)
  a = new LernzeitDB(`merge-a-${counter}`)
  b = new LernzeitDB(`merge-b-${counter++}`)
})

afterEach(async () => {
  stopSync()
  vi.useRealTimers()
  setFetch()
  await Promise.all([a.delete(), b.delete()])
})

describe('mergeIntoCloud', () => {
  it('first browser uploads everything; the cloud then holds every record', async () => {
    await a.topics.put(topic('tA'))
    await a.decks.put(deck('dA', 'tA'))
    await a.cards.bulkPut([card('cA1', 'dA', 'Hund', 'dog'), card('cA2', 'dA', 'Katze', 'cat')])
    await a.images.put(image('i1'))
    await a.kv.put({ key: 'settings', value: { pomodoroFocus: 40 } })
    // A kv key that stays on this device is not uploaded.
    await a.kv.put({ key: 'tour', value: 'seen' })
    expect(await a.outbox.count()).toBeGreaterThan(0)

    const steps: string[] = []
    const summary = await mergeIntoCloud(a, (step) => steps.push(step))

    expect(summary).toEqual({ added: { topics: 1, decks: 1, cards: 2, images: 1, kv: 1 }, folded: {} })
    expect(steps.length).toBeGreaterThan(0)
    expect(live('topics').map((r) => r.id)).toEqual(['tA'])
    expect(live('decks').map((r) => r.id)).toEqual(['dA'])
    expect(live('cards').map((r) => r.id).sort()).toEqual(['cA1', 'cA2'])
    expect(server.record('images', 'i1')?.data).toEqual({ id: 'i1', width: 40, height: 30, fit: 'cover', type: 'image/png' })
    expect(await server.blobs.get('i1')?.text()).toBe('png bytes')
    expect(server.record('kv', 'settings')?.data).toEqual({ key: 'settings', value: { pomodoroFocus: 40 } })
    expect(server.record('kv', 'tour')).toBeUndefined()

    // The merge uploaded everything itself, so the outbox recorded before sign-in is cleared.
    expect(await a.outbox.count()).toBe(0)
    expect((await a.meta.get('merged'))?.value).toBe(true)
    expect((await a.meta.get('cursor'))?.value).toEqual(expect.any(String))
    // Local data is the cloud's, and this device's own kv rows stay.
    expect((await a.cards.toArray()).map((c) => c.id).sort()).toEqual(['cA1', 'cA2'])
    expect(await (await a.images.get('i1'))?.blob.text()).toBe('png bytes')
    expect((await a.kv.get('tour'))?.value).toBe('seen')
    // Nothing waits to go up again, so the next sync pushes nothing.
    expect(await syncNow(a)).toMatchObject({ pushed: 0 })
  })

  it('second browser with the same starter and its own German topic ends with one German topic and no duplicate decks or cards', async () => {
    await a.topics.put(topic('tA'))
    await a.decks.put(deck('dA', 'tA'))
    await a.cards.bulkPut([card('cA1', 'dA', 'Hund', 'dog'), card('cA2', 'dA', 'Katze', 'cat')])
    await mergeIntoCloud(a)

    await b.topics.put(topic('tB', ' german'))
    await b.decks.put(deck('dB', 'tB'))
    await b.cards.bulkPut([card('cB1', 'dB', 'Hund', 'dog'), card('cB2', 'dB', 'Katze', 'cat'), card('cB3', 'dB', 'Maus', 'mouse')])
    const summary = await mergeIntoCloud(b)

    expect(summary).toEqual({ added: { cards: 1 }, folded: { topics: 1, decks: 1, cards: 2 } })
    for (const database of [a, b]) {
      if (database === a) await syncNow(a)
      expect((await database.topics.toArray()).map((t) => t.id)).toEqual(['tA'])
      expect((await database.decks.toArray()).map((d) => d.id)).toEqual(['dA'])
      const cards = await database.cards.toArray()
      expect(cards.map((c) => c.german).sort()).toEqual(['Hund', 'Katze', 'Maus'])
      expect(cards.every((c) => c.deckId === 'dA')).toBe(true)
    }
    expect(live('topics')).toHaveLength(1)
    expect(live('decks')).toHaveLength(1)
    expect(live('cards')).toHaveLength(3)
    // Local ids that were folded away are never pushed as deletes.
    expect([...server.records.values()].filter((r) => r.deleted)).toEqual([])
    expect(await b.outbox.count()).toBe(0)
  })

  it('the browser that practised more keeps its review state on both browsers after both have synced', async () => {
    // A practised Hund once, but more recently; B practised it three times.
    await a.topics.put(topic('tA'))
    await a.decks.put(deck('dA', 'tA'))
    await a.cards.put(card('cA1', 'dA', 'Hund', 'dog'))
    await a.reviews.put(review('cA1', 'dA', 1, 9_000))
    await a.reviewLogs.bulkPut(logs('la', 'cA1', 'dA', 1))
    await mergeIntoCloud(a)
    expect(server.record('reviews', 'cA1:enToDe')?.updatedAt).toBe(9_000)

    await b.topics.put(topic('tB'))
    await b.decks.put(deck('dB', 'tB'))
    await b.cards.put(card('cB1', 'dB', 'Hund', 'dog'))
    await b.reviews.put(review('cB1', 'dB', 3, 5_000))
    await b.reviewLogs.bulkPut(logs('lb', 'cB1', 'dB', 3))
    await mergeIntoCloud(b)
    await syncNow(a)

    // B's review moved onto the cloud card and won although the cloud row was stamped later.
    const expected = { ...review('cA1', 'dA', 3, 5_000) }
    expect(server.record('reviews', 'cA1:enToDe')).toMatchObject({ data: expected, updatedAt: 9_000 })
    for (const database of [a, b]) {
      expect(await database.reviews.toArray()).toEqual([expected])
      const kept = await database.reviewLogs.toArray()
      expect(kept).toHaveLength(4)
      expect(kept.every((l) => l.cardId === 'cA1' && l.reviewId === 'cA1:enToDe')).toBe(true)
    }
  })

  it('a failure while pushing leaves local data unchanged and merged unset', async () => {
    await a.topics.put(topic('tA'))
    await a.decks.put(deck('dA', 'tA'))
    await a.cards.put(card('cA1', 'dA', 'Hund', 'dog'))
    await a.images.put(image('i1'))
    const before = await snapshot(a)

    server.beforeRequest = (method, path) => {
      if (method === 'POST' && path === '/api/sync/push') return new Response(JSON.stringify({ error: 'D1 is down' }), { status: 500 })
    }
    await expect(mergeIntoCloud(a)).rejects.toThrow('D1 is down')

    expect(await snapshot(a)).toEqual(before)
    expect(before.merged).toBeUndefined()
    expect(await a.meta.get('cursor')).toBeUndefined()

    // Trying again works.
    server.beforeRequest = undefined
    await mergeIntoCloud(a)
    expect((await a.meta.get('merged'))?.value).toBe(true)
    expect(live('cards')).toHaveLength(1)
  })

  it('images: a local image already in the cloud is not uploaded again', async () => {
    await a.images.put(image('i1'))
    await mergeIntoCloud(a)
    expect(server.requests.filter((r) => r === 'PUT /api/images/i1')).toHaveLength(1)

    await b.images.bulkPut([image('i1'), image('i2', 'other bytes')])
    server.requests.length = 0
    await mergeIntoCloud(b)
    expect(server.requests).not.toContain('PUT /api/images/i1')
    expect(server.requests).toContain('PUT /api/images/i2')
    // B had the bytes of i1 already, so none were downloaded either.
    expect(server.requests.some((r) => r.startsWith('GET /api/images/'))).toBe(false)
    expect((await b.images.toArray()).map((i) => i.id).sort()).toEqual(['i1', 'i2'])

    // A gets i2 with its bytes on its next sync.
    await syncNow(a)
    expect(await (await a.images.get('i2'))?.blob.text()).toBe('other bytes')
  })

  it('an image only the cloud has is downloaded during the merge', async () => {
    await a.images.put(image('i1'))
    await mergeIntoCloud(a)
    await mergeIntoCloud(b)
    expect(server.requests).toContain('GET /api/images/i1')
    expect(await (await b.images.get('i1'))?.blob.text()).toBe('png bytes')
  })

  it("moves this browser's device settings out of the shared settings before merging", async () => {
    await a.kv.put({ key: 'settings', value: { pomodoroFocus: 40, theme: 'light', remindersEnabled: true } })
    await mergeIntoCloud(a)
    expect(server.record('kv', 'settings')?.data).toEqual({ key: 'settings', value: { pomodoroFocus: 40 } })
    expect((await a.kv.get('deviceSettings'))?.value).toEqual({ theme: 'light', remindersEnabled: true })

    // An old install keeps everything in `settings`; the cloud's settings replace it, but its theme, voice and reminders stay.
    await b.kv.put({ key: 'settings', value: { pomodoroFocus: 50, theme: 'dark', speechRate: 1.1, reminderTimes: ['07:00'] } })
    await b.kv.put({ key: 'deviceSettings', value: { speechRate: 0.8 } })
    await mergeIntoCloud(b)
    const settings = await getSettings(b)
    expect(settings).toMatchObject({ pomodoroFocus: 40, theme: 'dark', speechRate: 0.8, reminderTimes: ['07:00'] })
    expect((await b.kv.get('settings'))?.value).toEqual({ pomodoroFocus: 40 })
    expect(server.record('kv', 'settings')?.data).toEqual({ key: 'settings', value: { pomodoroFocus: 40 } })
  })

  it('a record the cloud refuses stays here, waiting in the outbox as stuck, and the rest still merges', async () => {
    await a.cards.bulkPut([card('c1', 'd1', 'Hund', 'dog'), card('c2', 'd1', 'Katze', 'cat')])
    server.refuseChange = (change) => (change.id === 'c2' ? 'is too large.' : undefined)
    await mergeIntoCloud(a)

    expect(live('cards').map((r) => r.id)).toEqual(['c1'])
    expect((await a.cards.toArray()).map((c) => c.id).sort()).toEqual(['c1', 'c2'])
    expect(await a.outbox.toArray()).toEqual([{ tbl: 'cards', id: 'c2', at: 1_000, stuck: expect.stringContaining('is too large.') }])
    expect((await a.meta.get('merged'))?.value).toBe(true)
  })
})

describe('mergeSummaryText', () => {
  it('says what was added and folded', () => {
    expect(mergeSummaryText({ added: { cards: 214, stories: 12, reviews: 300 }, folded: { cards: 898, decks: 3, topics: 1 } })).toBe(
      'Added 214 cards and 12 stories. Folded 898 duplicate cards, 3 decks and 1 topic from the starter.',
    )
    expect(mergeSummaryText({ added: { reviews: 3, reviewLogs: 9 }, folded: {} })).toBe('Added this browser’s study history.')
    expect(mergeSummaryText({ added: {}, folded: {} })).toBe('Your cloud had everything this browser has.')
  })
})
