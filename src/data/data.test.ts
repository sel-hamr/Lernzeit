import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getActiveTimer, KV_KEYS, LernzeitDB } from '@/db/db'
import { ensureSeeded, installStarterPack } from '@/db/seed'
import { MINUTE } from '@/lib/time'
import { completePhase, pauseTimer, resumeTimer, startTimer, stopTimer, getPendingNote, resolvePendingNote, recordReviewTime } from './timer'
import { gradeReview, quickAddCard, saveCard, undoGrade } from './cards'
import { createTask, setColumnOrder, toggleTaskDone } from './tasks'
import { importCsvRows, parseCardPack, parseCardsCsv, prepareCardPack, writeCardPack } from './io'

let database: LernzeitDB
let counter = 0

const at = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min)

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(at(2026, 10, 14, 14, 2))
  database = new LernzeitDB(`test-${counter++}`)
  await ensureSeeded(database)
})

afterEach(async () => {
  vi.useRealTimers()
  await database.delete()
})

async function germanId() {
  return (await database.topics.orderBy('order').first())!.id
}

describe('seed', () => {
  it('creates German (150 min) and AI (120 min) once', async () => {
    await ensureSeeded(database)
    const topics = await database.topics.orderBy('order').toArray()
    expect(topics.map((t) => [t.name, t.goalMinutes.mon])).toEqual([
      ['German', 150],
      ['AI', 120],
    ])
  })

  it('loads the starter pack with My Words first and nothing twice', async () => {
    const decks = await database.decks.orderBy('order').toArray()
    const count = async (deckId: string) => database.cards.where('deckId').equals(deckId).count()
    expect(decks.map((d) => d.name)).toEqual(['My Words', 'German Top Words', 'German Everyday Sentences', 'AI terms'])
    expect(await count('my-words')).toBe(53)
    expect(await count('german-top-words')).toBe(601 - 39)
    expect(await count('german-everyday-sentences')).toBe(56 - 2)
    expect(await database.cards.count()).toBe(657 + 12)
    // Words from the personal list moved out of the big deck.
    expect((await database.cards.get('de-0040'))?.deckId).toBe('my-words')
    // German decks count review time toward German.
    const german = (await database.topics.orderBy('order').first())!
    expect(decks.slice(0, 3).every((d) => d.topicId === german.id)).toBe(true)
  })

  it('keeps emoji pictures, uses illustrations where it has them, and asks picture questions for nouns only', async () => {
    const dog = (await database.cards.get('de-0224'))!
    expect(dog).toMatchObject({ german: 'Hund', gender: 'der', emoji: '🐕', partOfSpeech: 'noun' })
    const directions = async (id: string) => (await database.reviews.where('cardId').equals(id).toArray()).map((r) => r.direction).sort()
    expect(await directions('de-0224')).toEqual(['deToEn', 'enToDe', 'imageToDe'])
    // gehen has 🚶, but a walking emoji could be several verbs.
    expect(await directions('de-0263')).toEqual(['deToEn', 'enToDe'])
    // Everyday sentences do not practise from the picture.
    expect(await directions('de-0603')).toEqual(['deToEn', 'enToDe'])
    const apple = (await database.cards.get('de-0046'))!
    expect(apple.imageId).toBeDefined()
    expect((await database.images.get(apple.imageId!))?.blob.type).toBe('image/svg+xml')
  })

  it('can add the starter decks again without duplicating anything', async () => {
    const before = await database.cards.count()
    const result = await installStarterPack(database)
    expect(result.cards).toBe(0)
    expect(await database.cards.count()).toBe(before)
    expect(await database.images.count()).toBe(9)
  })

  it('restores deleted starter cards when the pack is installed again', async () => {
    await database.cards.delete('de-0046')
    await database.reviews.where('cardId').equals('de-0046').delete()
    const result = await installStarterPack(database)
    expect(result.cards).toBe(1)
    expect((await database.cards.get('de-0046'))?.imageId).toBeDefined()
  })
})

describe('card packs', () => {
  it('rejects files that are not packs, with a readable reason', () => {
    expect(() => parseCardPack({ hello: 1 })).toThrow('not a Lernzeit card pack')
    expect(() => parseCardPack({ format: 'lernzeit-cards', version: 1, decks: [{ id: 'a', name: 'A' }], cards: [{ deckId: 'b', english: 'x', german: 'y' }] })).toThrow('unknown deck')
  })

  it('imports a pack into a new deck and skips cards it already has', async () => {
    const pack = parseCardPack({
      format: 'lernzeit-cards',
      version: 1,
      decks: [{ id: 'animals', name: 'Animals', topic: 'German', directions: { imageToDe: true, enToDe: true, deToEn: false } }],
      cards: [
        { id: 'a-1', deckId: 'animals', english: 'fox', german: 'Fuchs', gender: 'der', partOfSpeech: 'noun', emoji: '🦊' },
        { id: 'a-2', deckId: 'animals', english: 'owl', german: 'Eule', gender: 'die', partOfSpeech: 'noun', emoji: null },
      ],
    })
    const first = await writeCardPack(await prepareCardPack(pack), {}, database)
    expect(first).toEqual({ cards: 2, skipped: 0, newDecks: 1 })
    const again = await writeCardPack(await prepareCardPack(pack), {}, database)
    expect(again).toEqual({ cards: 0, skipped: 2, newDecks: 0 })
    expect((await database.reviews.where('cardId').equals('a-1').toArray()).map((r) => r.direction).sort()).toEqual(['enToDe', 'imageToDe'])
    expect((await database.reviews.where('cardId').equals('a-2').toArray()).map((r) => r.direction)).toEqual(['enToDe'])
  })
})

describe('focus timer', () => {
  it('saves a stopped run as a session and leaves a note prompt', async () => {
    const topicId = await germanId()
    await startTimer({ topicId, mode: 'free' }, database)
    vi.setSystemTime(at(2026, 10, 14, 14, 47))
    const saved = await stopTimer(database)
    expect(saved?.minutes).toBe(45)
    const sessions = await database.sessions.toArray()
    expect(sessions).toHaveLength(1)
    expect(sessions[0]).toMatchObject({ topicId, date: '2026-10-14', minutes: 45, source: 'timer' })
    expect(await getActiveTimer(database)).toBeUndefined()

    await resolvePendingNote('Akkusativ after für, durch, gegen, ohne, um.', database)
    expect((await database.sessions.get(sessions[0].id))?.note).toContain('Akkusativ')
    expect(await getPendingNote(database)).toBeUndefined()
  })

  it('keeps running after a "refresh" because state lives in the database', async () => {
    const topicId = await germanId()
    await startTimer({ topicId, mode: 'countdown', targetMinutes: 45 }, database)
    // A new connection is what a reloaded tab would see.
    const reopened = new LernzeitDB(database.name)
    vi.setSystemTime(at(2026, 10, 14, 14, 30))
    const timer = await getActiveTimer(reopened)
    expect(timer?.topicId).toBe(topicId)
    expect(timer?.startedAt).toBe(at(2026, 10, 14, 14, 2).getTime())
    reopened.close()
  })

  it('excludes paused time from the saved minutes', async () => {
    const topicId = await germanId()
    await startTimer({ topicId, mode: 'free' }, database)
    vi.setSystemTime(at(2026, 10, 14, 14, 12))
    await pauseTimer(database)
    vi.setSystemTime(at(2026, 10, 14, 14, 42))
    await resumeTimer(database)
    vi.setSystemTime(at(2026, 10, 14, 14, 52))
    const saved = await stopTimer(database)
    expect(saved?.minutes).toBe(20)
  })

  it('completes a countdown at its end time even if checked late, exactly once', async () => {
    const topicId = await germanId()
    await startTimer({ topicId, mode: 'countdown', targetMinutes: 25 }, database)
    const timer = (await getActiveTimer(database))!
    vi.setSystemTime(at(2026, 10, 14, 16, 0)) // came back much later
    const outcome = await completePhase({ runId: timer.runId, cycle: 1, phase: 'focus' }, database)
    expect(outcome?.kind).toBe('countdown-done')
    const again = await completePhase({ runId: timer.runId, cycle: 1, phase: 'focus' }, database)
    expect(again).toBeNull()
    const sessions = await database.sessions.toArray()
    expect(sessions).toHaveLength(1)
    expect(sessions[0].minutes).toBe(25)
    expect(sessions[0].end).toBe(at(2026, 10, 14, 14, 27).getTime())
  })

  it('runs pomodoro focus → break → ready for round 2', async () => {
    const topicId = await germanId()
    await startTimer({ topicId, mode: 'pomodoro' }, database)
    let timer = (await getActiveTimer(database))!
    vi.setSystemTime(at(2026, 10, 14, 14, 27))
    expect((await completePhase({ runId: timer.runId, cycle: 1, phase: 'focus' }, database))?.kind).toBe('focus-done')
    timer = (await getActiveTimer(database))!
    expect(timer.phase).toBe('break')
    vi.setSystemTime(at(2026, 10, 14, 14, 32))
    expect((await completePhase({ runId: timer.runId, cycle: 1, phase: 'break' }, database))?.kind).toBe('break-done')
    timer = (await getActiveTimer(database))!
    expect(timer).toMatchObject({ phase: 'focus', cycle: 2 })
    expect(timer.pausedAt).toBeDefined()
    expect((await database.sessions.toArray()).map((s) => s.minutes)).toEqual([25])
  })

  it('splits a run across midnight between the two days', async () => {
    vi.setSystemTime(at(2026, 10, 14, 23, 30))
    const topicId = await germanId()
    await startTimer({ topicId, mode: 'free' }, database)
    vi.setSystemTime(at(2026, 10, 15, 0, 20))
    await stopTimer(database)
    const sessions = await database.sessions.orderBy('start').toArray()
    expect(sessions.map((s) => [s.date, s.minutes])).toEqual([
      ['2026-10-14', 30],
      ['2026-10-15', 20],
    ])
  })

  it('saves the previous run when a new timer starts', async () => {
    const topicId = await germanId()
    await startTimer({ topicId, mode: 'free' }, database)
    vi.setSystemTime(at(2026, 10, 14, 14, 32))
    const ai = (await database.topics.orderBy('order').last())!.id
    await startTimer({ topicId: ai, mode: 'free' }, database)
    expect((await database.sessions.toArray()).map((s) => s.minutes)).toEqual([30])
    expect((await getActiveTimer(database))?.topicId).toBe(ai)
  })

  it('records flashcard review time idempotently', async () => {
    const topicId = await germanId()
    const start = at(2026, 10, 14, 9).getTime()
    await recordReviewTime({ runId: 'rv', topicId, start, end: start + 5 * MINUTE, minutes: 4 }, database)
    await recordReviewTime({ runId: 'rv', topicId, start, end: start + 9 * MINUTE, minutes: 8 }, database)
    const sessions = await database.sessions.toArray()
    expect(sessions).toHaveLength(1)
    expect(sessions[0]).toMatchObject({ minutes: 8, source: 'flashcards' })
  })

  it('does not keep runs under half a minute', async () => {
    const topicId = await germanId()
    await startTimer({ topicId, mode: 'free' }, database)
    vi.setSystemTime(new Date(at(2026, 10, 14, 14, 2).getTime() + 10_000))
    expect(await stopTimer(database)).toBeNull()
    expect(await database.sessions.count()).toBe(0)
    expect(await database.kv.get(KV_KEYS.pendingNote)).toBeUndefined()
  })
})

describe('flashcards', () => {
  it('quick add splits the article and tags the card incomplete', async () => {
    const deck = (await database.decks.orderBy('order').first())!
    const card = await quickAddCard({ english: 'dog', german: 'der Hund', deckId: deck.id }, database)
    expect(card).toMatchObject({ german: 'Hund', gender: 'der', tags: ['incomplete'] })
    // No picture yet, so image → German is skipped.
    const reviews = await database.reviews.where('cardId').equals(card.id).toArray()
    expect(reviews.map((r) => r.direction).sort()).toEqual(['deToEn', 'enToDe'])
  })

  it('creates review rows for enabled directions and a cloze row for cloze cards', async () => {
    const deck = (await database.decks.orderBy('order').first())!
    const cloze = await saveCard({ deckId: deck.id, type: 'cloze', english: 'The dog plays.', german: 'Der Hund {{spielt}}.', tags: [] }, { kind: 'keep' }, undefined, database)
    expect((await database.reviews.where('cardId').equals(cloze.id).toArray()).map((r) => r.direction)).toEqual(['cloze'])
  })

  it('grades with FSRS, logs the review and can undo it', async () => {
    const review = (await database.reviews.toArray())[0]
    const result = (await gradeReview(review.id, 3, 4000, database))!
    expect(result.next.state).not.toBe(0)
    expect(result.next.due).toBeGreaterThan(Date.now())
    expect(await database.reviewLogs.count()).toBe(1)
    await undoGrade(result.previous, result.logId, database)
    expect((await database.reviews.get(review.id))?.state).toBe(0)
    expect(await database.reviewLogs.count()).toBe(0)
  })

  it('imports CSV rows, creating unknown decks', async () => {
    const csv = 'english,german,gender,plural,example_de,example_en,tags,deck\n' +
      'dog,Hund,der,die Hunde,Der Hund spielt.,The dog plays.,"Animals, A1",German A1\n' +
      'cat,die Katze,,die Katzen,,,Animals,Tiere\n' +
      ',missing english,,,,,,\n'
    const preview = parseCardsCsv(csv)
    expect(preview.rows).toHaveLength(2)
    expect(preview.skipped).toHaveLength(1)
    expect(preview.rows[1]).toMatchObject({ german: 'Katze', gender: 'die', tags: ['Animals'] })
    const deck = (await database.decks.orderBy('order').first())!
    const result = await importCsvRows(preview.rows, deck.id, database)
    expect(result).toEqual({ cards: 2, newDecks: 2 })
    expect(await database.decks.filter((d) => d.name === 'Tiere').count()).toBe(1)
  })
})

describe('tasks', () => {
  it('moves tasks between columns and marks them done', async () => {
    const a = await createTask({ title: 'A', status: 'todo', priority: 'high' }, database)
    const b = await createTask({ title: 'B', status: 'todo', priority: 'low' }, database)
    await setColumnOrder('doing', [b.id], database)
    expect((await database.tasks.get(b.id))?.status).toBe('doing')
    await toggleTaskDone(a.id, database)
    const done = await database.tasks.get(a.id)
    expect(done?.status).toBe('done')
    expect(done?.doneAt).toBeDefined()
  })
})
