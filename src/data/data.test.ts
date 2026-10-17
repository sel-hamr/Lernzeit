import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getActiveTimer, KV_KEYS, LernzeitDB } from '@/db/db'
import { ensureSeeded, installStarterPack } from '@/db/seed'
import { MINUTE } from '@/lib/time'
import { completePhase, pauseTimer, resumeTimer, startTimer, stopTimer, getPendingNote, resolvePendingNote, recordReviewTime } from './timer'
import { gradeReview, quickAddCard, saveCard, undoGrade } from './cards'
import { createTask, setColumnOrder, toggleTaskDone } from './tasks'
import { exportBackup, importCsvRows, parseCardPack, parseCardsCsv, prepareCardPack, restoreBackup, writeCardPack } from './io'
import { deleteStory, installStarterStories, markStoryOpened, markStoryRead, parseLevel, saveStory } from './stories'
import { recordQuestionTime, recordReadingTime } from './timer'
import { DEFAULT_SET, deleteQuestion, installStarterQuestions, parseWords, saveQuestion, saveResponse } from './questions'
import { groupBySet } from '@/lib/questions'
import { alignTranslation, annotate, buildLexicon, coverage, splitParagraphs } from '@/lib/reader'
import { clearClips, clipKey, readClip, saveClip } from './clips'

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

describe('stories', () => {
  it('seeds the starter stories once, linked to German, and adds back deleted ones', async () => {
    const stories = await database.stories.orderBy('createdAt').reverse().toArray()
    expect(stories).toHaveLength(103)
    // Newest first keeps the list's order: the longer first stories, then the easy ones by theme.
    expect(stories.slice(0, 4).map((s) => s.title)).toEqual(['Ein Tag in Berlin', 'Im Café', 'Der verlorene Schlüssel', 'Meine Familie'])
    expect(stories.at(-1)?.id).toBe('story-0103')
    expect(stories.every((s) => s.topicId === stories[0].topicId && s.readCount === 0)).toBe(true)
    expect(stories[0].topicId).toBe(await germanId())
    expect(await installStarterStories(database)).toBe(0)
    await deleteStory('story-0002', database)
    expect(await installStarterStories(database)).toBe(1)
    expect(await database.stories.count()).toBe(103)
  })

  it('writes every starter story with starter words and a translation that lines up', async () => {
    const lexicon = buildLexicon(await database.cards.toArray())
    let words = 0
    let inDecks = 0
    for (const story of await database.stories.toArray()) {
      const result = coverage(splitParagraphs(story.text).map((p) => annotate(p, lexicon)), (piece) => (piece.cardIds.length ? 'new' : 'unknown'))
      // The rest are names and a few new words to add from the reader.
      expect(result.new / result.words, story.title).toBeGreaterThan(0.8)
      expect(alignTranslation(story.text, story.translation), story.title).not.toBeNull()
      words += result.words
      inDecks += result.new
    }
    expect(inDecks / words).toBeGreaterThan(0.9)
  })

  it('saves a story tidied up, and keeps its history when edited', async () => {
    expect(parseLevel(' b1')).toBe('B1')
    expect(parseLevel('D7')).toBeUndefined()
    const story = await saveStory({ title: '  Mein Tag ', text: '\nIch lerne Deutsch.\n', translation: '   ', level: 'B1', topicId: '', tags: ['me', ' me ', ''] }, undefined, database)
    expect(story).toMatchObject({ title: 'Mein Tag', text: 'Ich lerne Deutsch.', translation: undefined, level: 'B1', topicId: undefined, tags: ['me'], readCount: 0 })
    await markStoryRead(story.id, database)
    await markStoryOpened(story.id, database)
    vi.setSystemTime(at(2026, 10, 15, 9, 0))
    const edited = await saveStory({ title: 'Mein Tag', text: 'Ich lerne viel Deutsch.', level: undefined, tags: [] }, story.id, database)
    expect(edited).toMatchObject({ id: story.id, createdAt: story.createdAt, readCount: 1, text: 'Ich lerne viel Deutsch.' })
    expect(edited.updatedAt).toBeGreaterThan(story.updatedAt)
    expect(edited.openedAt).toBe(at(2026, 10, 14, 14, 2).getTime())
    await expect(saveStory({ title: ' ', text: 'x', tags: [] }, undefined, database)).rejects.toThrow('title')
    await expect(saveStory({ title: 'x', text: ' ', tags: [] }, undefined, database)).rejects.toThrow('German text')
  })

  it('records reading time as one session that grows', async () => {
    const topicId = await germanId()
    const start = Date.now()
    const run = { runId: 'reading:1', topicId, start, title: 'Im Café' }
    await recordReadingTime({ ...run, end: start + 3 * MINUTE, minutes: 2 }, database)
    await recordReadingTime({ ...run, end: start + 6 * MINUTE, minutes: 5 }, database)
    const sessions = await database.sessions.where('runId').equals('reading:1').toArray()
    expect(sessions).toHaveLength(1)
    expect(sessions[0]).toMatchObject({ minutes: 5, source: 'reading', note: 'Reading: Im Café', topicId })
  })

  it('backs up stories and restores backups made before stories', async () => {
    // Images go through FileReader, which Node does not have.
    await database.images.clear()
    const backup = await exportBackup(database)
    expect(backup.stories).toHaveLength(await database.stories.count())

    const other = new LernzeitDB(`test-${counter++}`)
    try {
      await restoreBackup(JSON.parse(JSON.stringify(backup)), other)
      expect((await other.stories.get('story-0001'))?.title).toBe('Ein Tag in Berlin')
      // JSON drops undefined fields, like a backup file from before stories.
      await restoreBackup(JSON.parse(JSON.stringify({ ...backup, stories: undefined })), other)
      expect(await other.stories.count()).toBe(0)
      expect(await other.cards.count()).toBe(backup.cards.length)
    } finally {
      await other.delete()
    }
  })
})

describe('questions', () => {
  it('seeds the starter questions once, in sets, and adds back deleted ones', async () => {
    const questions = await database.questions.toArray()
    expect(questions).toHaveLength(45)
    expect(groupBySet(questions).map((g) => g.set)).toEqual([
      'Sich vorstellen',
      'Familie und Freunde',
      'Freizeit',
      'Arbeit und Schule',
      'Wohnen und Alltag',
      'Beim Arzt und auf dem Amt',
    ])
    expect(groupBySet(questions)[0].questions[0]).toMatchObject({ id: 'question-0001', question: 'Wie heißt du?', suggested: 'Ich heiße Anna.', level: 'A1' })
    // Every one is a question with its English and an example answer, and none has the user's answer yet.
    for (const q of questions) {
      expect(q.question, q.id).toMatch(/\?$/)
      expect(q.english && q.suggested, q.id).toBeTruthy()
      expect(q.words?.length, q.id).toBeGreaterThanOrEqual(4)
      expect(q.myAnswer).toBeUndefined()
    }
    expect(await installStarterQuestions(database)).toBe(0)
    await deleteQuestion('question-0004', database)
    expect(await installStarterQuestions(database)).toBe(1)
    expect(await database.questions.count()).toBe(45)
  })

  it('saves a question tidied up, and keeps its date when edited', async () => {
    const question = await saveQuestion(
      { set: '  ', question: ' Was ist dein Beruf? ', english: ' ', myAnswer: ' Ich bin Entwickler. ', suggested: '', level: 'a2' as 'A2', tags: ['x', ' x'] },
      undefined,
      database,
    )
    expect(question).toMatchObject({ set: DEFAULT_SET, question: 'Was ist dein Beruf?', english: undefined, myAnswer: 'Ich bin Entwickler.', suggested: undefined, words: undefined, level: 'A2', tags: ['x'] })
    expect(parseWords(' Lehrer, die  Ärztin;;\narbeiten als ')).toEqual(['Lehrer', 'die  Ärztin', 'arbeiten als'])
    const withWords = await saveQuestion({ set: 'Arbeit', question: 'Wo arbeitest du?', words: ['bei', ' die  Firma ', 'Bei', ''], tags: [] }, undefined, database)
    expect(withWords.words).toEqual(['bei', 'die Firma'])
    vi.setSystemTime(at(2026, 10, 15, 9, 0))
    const edited = await saveQuestion({ ...question, set: ' Arbeit  und Schule ', myAnswer: 'Ich bin Softwareentwickler.' }, question.id, database)
    expect(edited).toMatchObject({ id: question.id, set: 'Arbeit und Schule', createdAt: question.createdAt, myAnswer: 'Ich bin Softwareentwickler.' })
    expect(edited.updatedAt).toBeGreaterThan(question.updatedAt)
    await expect(saveQuestion({ set: 'x', question: '  ', tags: [] }, undefined, database)).rejects.toThrow('German text')
  })

  it('keeps every typed answer, and deletes them with their question', async () => {
    const { id } = await saveQuestion({ set: 'Arbeit', question: 'Wo arbeitest du?', tags: [] }, undefined, database)
    expect(await saveResponse(id, '   ', database)).toBeUndefined()
    const first = await saveResponse(id, ' Ich arbeite in Berlin. ', database)
    vi.setSystemTime(at(2026, 10, 15, 9, 0))
    await saveResponse(id, 'Ich arbeite bei einer Firma.', database)
    await saveResponse('question-0001', 'Ich heiße Sam.', database)
    expect(first).toMatchObject({ questionId: id, text: 'Ich arbeite in Berlin.', at: at(2026, 10, 14, 14, 2).getTime() })
    expect(await database.responses.where('questionId').equals(id).count()).toBe(2)
    await deleteQuestion(id, database)
    expect(await database.responses.where('questionId').equals(id).count()).toBe(0)
    expect(await database.responses.count()).toBe(1)
  })

  it('records practice time as one session that grows', async () => {
    const topicId = await germanId()
    const start = Date.now()
    const run = { runId: 'questions:all:1', topicId, start, set: 'Freizeit' }
    await recordQuestionTime({ ...run, end: start + 2 * MINUTE, minutes: 2 }, database)
    await recordQuestionTime({ ...run, end: start + 4 * MINUTE, minutes: 4 }, database)
    const sessions = await database.sessions.where('runId').equals('questions:all:1').toArray()
    expect(sessions).toHaveLength(1)
    expect(sessions[0]).toMatchObject({ minutes: 4, source: 'questions', note: 'Questions: Freizeit', topicId })
    await recordQuestionTime({ runId: 'questions:all:2', topicId, start, end: start + 2 * MINUTE, minutes: 2 }, database)
    expect((await database.sessions.where('runId').equals('questions:all:2').first())?.note).toBe('Questions')
  })

  it('backs up questions with their answers and restores backups made before questions', async () => {
    await database.images.clear()
    await saveResponse('question-0001', 'Ich heiße Sam.', database)
    const backup = await exportBackup(database)
    expect(backup.questions).toHaveLength(45)
    expect(backup.responses).toHaveLength(1)

    const other = new LernzeitDB(`test-${counter++}`)
    try {
      await restoreBackup(JSON.parse(JSON.stringify(backup)), other)
      expect((await other.responses.toArray()).map((r) => r.text)).toEqual(['Ich heiße Sam.'])
      expect(await other.questions.count()).toBe(45)
      await restoreBackup(JSON.parse(JSON.stringify({ ...backup, questions: undefined, responses: undefined })), other)
      expect(await other.questions.count()).toBe(0)
      expect(await other.responses.count()).toBe(0)
      expect(await other.stories.count()).toBe(backup.stories!.length)
      await expect(restoreBackup({ ...backup, responses: 'oops' }, other)).rejects.toThrow('broken "responses"')
    } finally {
      await other.delete()
    }
  })
})

describe('speech clips', () => {
  const wav = (n: number) => new Blob([new Uint8Array(n)], { type: 'audio/wav' })

  it('keys clips by voice and trimmed text, so spacing does not make a new clip', () => {
    expect(clipKey('de_DE-thorsten-medium', '  der Hund ')).toBe(clipKey('de_DE-thorsten-medium', 'der Hund'))
    expect(clipKey('de_DE-thorsten-medium', 'der Hund')).not.toBe(clipKey('de_DE-thorsten-high', 'der Hund'))
  })

  it('reads back a saved clip and marks it as used', async () => {
    const key = clipKey('v', 'der Hund')
    expect(await readClip(key, database)).toBeUndefined()
    await saveClip(key, wav(8), database)
    vi.setSystemTime(at(2026, 10, 15, 9))
    expect((await readClip(key, database))?.size).toBe(8)
    expect((await database.clips.get(key))?.usedAt).toBe(at(2026, 10, 15, 9).getTime())
  })

  it('drops the least recently used clips once they pass the size limit', async () => {
    for (let i = 0; i < 5; i++) {
      vi.setSystemTime(at(2026, 10, 14, 15, i))
      await saveClip(`v:${i}`, wav(10), database, 30)
    }
    expect((await database.clips.toArray()).map((c) => c.key).sort()).toEqual(['v:2', 'v:3', 'v:4'])
    // Playing a clip keeps it.
    vi.setSystemTime(at(2026, 10, 14, 16))
    await readClip('v:2', database)
    await saveClip('v:5', wav(10), database, 30)
    expect((await database.clips.toArray()).map((c) => c.key).sort()).toEqual(['v:2', 'v:4', 'v:5'])
    // A clip bigger than the limit is still kept until the next one.
    await saveClip('v:big', wav(50), database, 30)
    expect((await database.clips.toArray()).map((c) => c.key)).toEqual(['v:big'])
    await clearClips(database)
    expect(await database.clips.count()).toBe(0)
  })

  it('leaves clips out of backups', async () => {
    await database.images.clear() // images go through FileReader, which Node does not have
    await saveClip('v:a', wav(1), database)
    expect(Object.keys(await exportBackup(database))).not.toContain('clips')
  })
})
