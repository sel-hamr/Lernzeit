import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getActiveTimer, KV_KEYS, LernzeitDB } from '@/db/db'
import { addStarterConjugations, ensureSeeded, installStarterPack } from '@/db/seed'
import { MINUTE } from '@/lib/time'
import { completePhase, pauseTimer, resumeTimer, startTimer, stopTimer, getPendingNote, resolvePendingNote, recordReviewTime } from './timer'
import { deleteCard, deleteDeck, gradeReview, quickAddCard, saveCard, undoGrade } from './cards'
import { saveDrillAnswer } from './drills'
import { DEFAULT_GROUP, deleteTopic, installStarterTopics, loadStarterTopics, saveExerciseAnswer, saveTopic, STARTER_GRAMMAR_VERSION, syncStarterTopics } from './grammar'
import { createTask, setColumnOrder, toggleTaskDone } from './tasks'
import { exportBackup, importCsvRows, parseCardPack, parseCardsCsv, prepareCardPack, restoreBackup, writeCardPack } from './io'
import { deleteStory, installStarterStories, markStoryOpened, markStoryRead, parseLevel, saveStory } from './stories'
import { recordGrammarTime, recordQuestionTime, recordReadingTime } from './timer'
import { DEFAULT_SET, deleteQuestion, installStarterQuestions, parseWords, saveQuestion, saveResponse } from './questions'
import { formsOf, TENSES } from '@/lib/conjugation'
import { drillQuestions, pickRound } from '@/lib/drills'
import { buildTopicRound, exerciseProblem, parseExercise, parseInline, parseRule, wordsOf } from '@/lib/grammar'
import { groupBySet } from '@/lib/questions'
import { alignTranslation, annotate, buildLexicon, coverage, splitParagraphs } from '@/lib/reader'

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

  it('imports a verb with its conjugation, tidied', async () => {
    const pack = parseCardPack({
      format: 'lernzeit-cards',
      version: 1,
      decks: [{ id: 'verbs', name: 'Verbs' }],
      cards: [{ id: 'v-1', deckId: 'verbs', english: 'to swim', german: 'schwimmen', conjugation: { present: 'schwimme,schwimmst, schwimmt, schwimmen, schwimmt, schwimmen', past: ' ' } }],
    })
    await writeCardPack(await prepareCardPack(pack), {}, database)
    expect((await database.cards.get('v-1'))?.conjugation).toEqual({ present: 'schwimme, schwimmst, schwimmt, schwimmen, schwimmt, schwimmen' })
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
    const verbs = parseCardsCsv('english,german,present\nto go,gehen,"gehe, gehst, geht, gehen, geht, gehen"\n')
    expect(verbs.rows[0].conjugation).toEqual({ present: 'gehe, gehst, geht, gehen, geht, gehen' })
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

describe('drills', () => {
  it('finds plenty to drill in the starter cards', async () => {
    const cards = await database.cards.toArray()
    const count = (kind: 'gender' | 'plural' | 'verbs') => cards.filter((c) => drillQuestions(c, kind).length).length
    expect(count('gender')).toBeGreaterThan(200)
    expect(count('plural')).toBeGreaterThan(200)
    expect(count('verbs')).toBe(139)
  })

  it('has a full conjugation for every starter verb', async () => {
    for (const card of (await database.cards.toArray()).filter((c) => c.verbForms)) {
      for (const tense of TENSES) expect(formsOf(card.conjugation?.[tense]), `${card.german} ${tense}`).toHaveLength(6)
    }
  })

  it('gives starter verbs saved before conjugations their tables, once', async () => {
    const verbs = (await database.cards.toArray()).filter((c) => c.conjugation)
    const [plain, changed, own] = verbs
    // As an install from before drills: no tables, and nothing done yet.
    await database.cards.bulkPut([
      { ...plain, conjugation: undefined },
      { ...changed, conjugation: undefined, verbForms: 'my own forms' },
      { ...own, conjugation: { present: 'my, own, table, of, six, forms' } },
    ])
    await database.kv.delete('starterConjugations')
    expect(await addStarterConjugations(database)).toBe(1)
    expect((await database.cards.get(plain.id))?.conjugation).toEqual(plain.conjugation)
    // A verb you changed or gave a table yourself is left alone.
    expect((await database.cards.get(changed.id))?.conjugation).toBeUndefined()
    expect((await database.cards.get(own.id))?.conjugation).toEqual({ present: 'my, own, table, of, six, forms' })
    await database.cards.put({ ...plain, conjugation: undefined })
    expect(await addStarterConjugations(database)).toBe(0)
  })

  it('keeps one stat per card and drill', async () => {
    const card = (await database.cards.toArray()).find((c) => c.gender)!
    await saveDrillAnswer(card.id, 'gender', false, database)
    vi.setSystemTime(at(2026, 10, 14, 15, 0))
    const stat = await saveDrillAnswer(card.id, 'gender', true, database)
    expect(stat).toEqual({ id: `${card.id}:gender`, cardId: card.id, drill: 'gender', right: 1, wrong: 1, score: 1, lastAt: at(2026, 10, 14, 15, 0).getTime() })
    await saveDrillAnswer(card.id, 'plural', true, database)
    expect(await database.drillStats.count()).toBe(2)
    // The word you got wrong leads the next round.
    const stats = new Map((await database.drillStats.where('drill').equals('gender').toArray()).map((s) => [s.cardId, s]))
    expect(pickRound(await database.cards.toArray(), 'gender', stats)[0].id).toBe(card.id)
  })

  it('deletes the stats with their card or deck', async () => {
    const [first, second] = (await database.cards.toArray()).filter((c) => c.gender)
    await saveDrillAnswer(first.id, 'gender', false, database)
    await saveDrillAnswer(second.id, 'plural', false, database)
    await deleteCard(first.id, database)
    expect((await database.drillStats.toArray()).map((s) => s.cardId)).toEqual([second.id])
    await deleteDeck(second.deckId, database)
    expect(await database.drillStats.count()).toBe(0)
  })


  it('backs up drill stats and restores backups made before drills', async () => {
    await database.images.clear()
    const card = (await database.cards.toArray()).find((c) => c.gender)!
    await saveDrillAnswer(card.id, 'gender', false, database)
    const backup = await exportBackup(database)
    expect(backup.drillStats).toHaveLength(1)

    const other = new LernzeitDB(`test-${counter++}`)
    try {
      await restoreBackup(JSON.parse(JSON.stringify(backup)), other)
      expect(await other.drillStats.get(`${card.id}:gender`)).toMatchObject({ wrong: 1, score: 2 })
      await restoreBackup(JSON.parse(JSON.stringify({ ...backup, drillStats: undefined })), other)
      expect(await other.drillStats.count()).toBe(0)
      await expect(restoreBackup({ ...backup, drillStats: {} }, other)).rejects.toThrow('broken "drillStats"')
    } finally {
      await other.delete()
    }
  })
})

describe('grammar', () => {
  it('has well-formed starter topics: unique ids, a rule, examples and exercises that parse', async () => {
    const topics = await loadStarterTopics()
    expect(topics.length).toBeGreaterThanOrEqual(25)
    const ids = topics.flatMap((t) => [t.id, ...t.exercises.map((e) => e.id)])
    expect(new Set(ids).size).toBe(ids.length)
    for (const t of topics) {
      expect(t.title && t.english && t.summary && t.level, t.id).toBeTruthy()
      expect(parseRule(t.rule).length, t.id).toBeGreaterThan(0)
      expect(t.examples.length, t.id).toBeGreaterThanOrEqual(3)
      expect(t.exercises.length, t.id).toBeGreaterThanOrEqual(12)
      for (const e of t.exercises) {
        expect(exerciseProblem(e.text), `${e.id} ${e.text}`).toBeUndefined()
        // Every exercise says why its answer is right; all but rewrites have their English.
        expect(e.why, e.id).toBeTruthy()
        const form = parseExercise(e.text)!
        if (form.type !== 'write') expect(e.en, e.id).toBeTruthy()
        // A choice never repeats, and its right answer is not also a wrong one.
        if (form.type === 'gap') expect(new Set(form.wrong).size, e.id).toBe(form.wrong.length)
        // A mistake really is one.
        if (form.type === 'mistake') expect(form.answers, e.id).not.toContain(form.shown)
        // Every right order uses the same words.
        if (form.type === 'order') {
          const words = (s: string) => wordsOf(s).map((w) => w.toLowerCase()).sort().join(' ')
          for (const other of form.answers) expect(words(other), e.id).toBe(words(form.answers[0]))
        }
      }
      // Each topic mixes kinds of exercise.
      expect(new Set(t.exercises.map((e) => parseExercise(e.text)!.type)).size, t.id).toBeGreaterThanOrEqual(3)
      for (const block of parseRule(t.rule)) {
        // Every table row has as many cells as its header.
        if (block.type === 'table') for (const row of block.rows) expect(row.length, `${t.id}: ${row.join(' | ')}`).toBe(block.header.length)
        // Bold and italic markers pair up, so none shows as a stray *.
        const texts = block.type === 'table' ? [...block.header, ...block.rows.flat()] : block.type === 'list' ? block.items : [block.text]
        for (const text of texts) expect(parseInline(text).some((p) => p.text.includes('*')), `${t.id}: ${text}`).toBe(false)
      }
    }
  })

  it('installs the starter topics once, and adds back deleted ones on request', async () => {
    const all = (await loadStarterTopics()).length
    expect(await syncStarterTopics(database)).toEqual({ added: all, updated: 0 })
    await deleteTopic('grammar-005', database)
    // Once means once: a deleted topic stays deleted until you ask for it.
    expect(await syncStarterTopics(database)).toEqual({ added: 0, updated: 0 })
    expect(await installStarterTopics(database)).toBe(1)
    expect(await database.grammarTopics.count()).toBe(all)
  })

  it('updates starter topics you did not edit to a newer version, keeping scores', async () => {
    await syncStarterTopics(database)
    const plain = (await database.grammarTopics.get('grammar-001'))!
    const edited = (await database.grammarTopics.get('grammar-002'))!
    // As installed by an older version: fewer exercises, no explanations, one exercise since removed.
    const old = { ...plain, exercises: [...plain.exercises.slice(0, 3).map(({ id, text, en }) => ({ id, text, en })), { id: 'grammar-001-99', text: 'Alt {{x}}.' }] }
    await database.grammarTopics.put(old)
    await saveTopic({ ...edited, summary: 'My own words' }, edited.id, database)
    await saveExerciseAnswer('grammar-001', 'grammar-001-01', false, database)
    await saveExerciseAnswer('grammar-001', 'grammar-001-99', false, database)
    await deleteTopic('grammar-003', database)
    await database.kv.put({ key: 'starterGrammar', value: STARTER_GRAMMAR_VERSION - 1 })

    expect(await syncStarterTopics(database)).toEqual({ added: 0, updated: 1 })
    expect((await database.grammarTopics.get('grammar-001'))!).toMatchObject({ exercises: plain.exercises, createdAt: plain.createdAt, updatedAt: plain.createdAt })
    expect((await database.grammarTopics.get('grammar-002'))!.summary).toBe('My own words')
    expect(await database.grammarTopics.get('grammar-003')).toBeUndefined()
    // The score of a kept exercise stays; a removed exercise takes its score with it.
    expect(await database.exerciseStats.get('grammar-001-01')).toMatchObject({ wrong: 1 })
    expect(await database.exerciseStats.get('grammar-001-99')).toBeUndefined()
  })

  it('saves a topic tidied up, and drops the scores of removed exercises', async () => {
    const topic = await saveTopic(
      {
        title: '  Der  Dativ ',
        group: ' ',
        rule: ' Wem? ',
        examples: [{ de: ' Ich helfe dir. ', en: ' ' }, { de: '' }],
        exercises: [{ id: 'x1', text: 'Ich helfe {{dir}}.' }, { id: 'x2', text: 'Er hilft {{mir}}.' }],
        drill: undefined,
      },
      undefined,
      database,
    )
    expect(topic).toMatchObject({ title: 'Der Dativ', group: DEFAULT_GROUP, rule: 'Wem?', examples: [{ de: 'Ich helfe dir.' }] })
    expect(topic).not.toHaveProperty('drill')
    await saveExerciseAnswer(topic.id, 'x1', false, database)
    await saveExerciseAnswer(topic.id, 'x2', false, database)
    expect(await database.exerciseStats.get('x1')).toMatchObject({ topicId: topic.id, wrong: 1, score: 2 })
    await saveTopic({ ...topic, exercises: [topic.exercises[1]] }, topic.id, database)
    expect((await database.exerciseStats.toArray()).map((s) => s.id)).toEqual(['x2'])
    await deleteTopic(topic.id, database)
    expect(await database.exerciseStats.count()).toBe(0)
    await expect(saveTopic({ ...topic, title: ' ' }, undefined, database)).rejects.toThrow('title')
  })

  it('mixes questions about your cards into a linked topic', async () => {
    await installStarterTopics(database)
    const gender = (await database.grammarTopics.get('grammar-001'))!
    const round = buildTopicRound({ topic: gender, exerciseStats: new Map(), cards: await database.cards.toArray(), drillStats: [] })
    expect(round.filter((i) => i.question.kind === 'exercise')).toHaveLength(12)
    expect(round.filter((i) => i.question.kind === 'gender')).toHaveLength(5)
    const past = (await database.grammarTopics.get('grammar-016'))!
    const verbs = buildTopicRound({ topic: past, exerciseStats: new Map(), cards: await database.cards.toArray(), drillStats: [] })
    expect(verbs.filter((i) => i.question.kind === 'verbs').every((i) => i.question.kind === 'verbs' && i.question.tense === 'past')).toBe(true)
  })

  it('records practice time as one session that grows', async () => {
    const topicId = await germanId()
    const start = Date.now()
    const run = { runId: 'grammar:t1:1', topicId, start, title: 'Der Dativ' }
    await recordGrammarTime({ ...run, end: start + 2 * MINUTE, minutes: 2 }, database)
    await recordGrammarTime({ ...run, end: start + 3 * MINUTE, minutes: 3 }, database)
    const sessions = await database.sessions.where('runId').equals(run.runId).toArray()
    expect(sessions).toHaveLength(1)
    expect(sessions[0]).toMatchObject({ minutes: 3, source: 'grammar', note: 'Grammar: Der Dativ', topicId })
  })

  it('backs up topics with their scores, and restores backups made before grammar', async () => {
    await database.images.clear()
    await installStarterTopics(database)
    await saveExerciseAnswer('grammar-001', 'grammar-001-01', false, database)
    const backup = await exportBackup(database)
    expect(backup.grammarTopics?.length).toBeGreaterThanOrEqual(25)
    const other = new LernzeitDB(`test-${counter++}`)
    try {
      await restoreBackup(JSON.parse(JSON.stringify(backup)), other)
      expect(await other.exerciseStats.get('grammar-001-01')).toMatchObject({ wrong: 1 })
      await restoreBackup(JSON.parse(JSON.stringify({ ...backup, grammarTopics: undefined, exerciseStats: undefined })), other)
      expect(await other.grammarTopics.count()).toBe(0)
      await expect(restoreBackup({ ...backup, grammarTopics: 'x' }, other)).rejects.toThrow('broken "grammarTopics"')
    } finally {
      await other.delete()
    }
  })
})
