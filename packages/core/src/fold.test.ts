import { describe, expect, it } from 'vitest'
import { foldLibraries, uploadTime, type Library } from './fold'
import type {
  ActiveTimer,
  Card,
  CardReview,
  Deck,
  Direction,
  Doc,
  DocFolder,
  DrillStat,
  ExerciseStat,
  GrammarTopic,
  PracticeRun,
  Question,
  QuestionResponse,
  ReviewLog,
  Session,
  Story,
  Topic,
} from './types'

type Row = Record<string, unknown>

// Fixture builders: the smallest valid record of each kind, checked against its type.
const week = { mon: 0, tue: 0, wed: 0, thu: 0, fri: 0, sat: 0, sun: 0 }
const topic = (id: string, name: string): Row =>
  ({ id, name, color: 'sage', goalMinutes: week, goalHistory: [], archived: false, order: 0, createdAt: 1 }) satisfies Topic
const session = (id: string, topicId: string): Row =>
  ({ id, topicId, start: 1, end: 2, minutes: 1, date: '2026-11-21', source: 'timer' }) satisfies Session
const deck = (id: string, name: string, topicId?: string): Row =>
  ({ id, name, topicId, newPerDay: 10, reviewsPerDay: 100, directions: { imageToDe: false, enToDe: true, deToEn: true }, order: 0, createdAt: 1 }) satisfies Deck
const card = (id: string, deckId: string, german: string, english: string): Row =>
  ({ id, deckId, type: 'word', german, english, tags: [], createdAt: 1, updatedAt: 1 }) satisfies Card
const fsrs = (reps: number, last_review?: number) => ({
  due: 0, stability: 1, difficulty: 5, elapsed_days: 0, scheduled_days: 1, learning_steps: 0, reps, lapses: 0, state: 2, last_review,
})
const review = (cardId: string, deckId: string, direction: Direction, reps: number): Row =>
  ({ id: `${cardId}:${direction}`, cardId, deckId, direction, fsrs: fsrs(reps, reps * 1000), due: 0, state: 2 }) satisfies CardReview
const logs = (prefix: string, cardId: string, deckId: string, direction: Direction, n: number): Row[] =>
  Array.from({ length: n }, (_, i) =>
    ({ id: `${prefix}${i}`, reviewId: `${cardId}:${direction}`, cardId, deckId, direction, rating: 3, prevState: 2, reviewedAt: i, durationMs: 1000, day: '2026-11-21' }) satisfies ReviewLog,
  )
const drill = (cardId: string, right: number, wrong: number): Row =>
  ({ id: `${cardId}:gender`, cardId, drill: 'gender', right, wrong, score: wrong, lastAt: 1 }) satisfies DrillStat
const story = (id: string, title: string, text: string): Row =>
  ({ id, title, text, tags: [], createdAt: 1, updatedAt: 1, readCount: 0 }) satisfies Story
const question = (id: string, question: string, myAnswer?: string): Row =>
  ({ id, set: 'Sich vorstellen', question, myAnswer, tags: [], createdAt: 1, updatedAt: 1 }) satisfies Question
const response = (id: string, questionId: string): Row => ({ id, questionId, text: 'Ich heiße Sam.', at: 5 }) satisfies QuestionResponse
const grammar = (id: string, exerciseIds: string[]): Row =>
  ({
    id, title: 'Der Dativ', group: 'Cases', rule: 'Dative after mit.', examples: [],
    exercises: exerciseIds.map((e) => ({ id: e, text: 'mit {{dem}} Mann' })), createdAt: 1, updatedAt: 1,
  }) satisfies GrammarTopic
const exStat = (id: string, topicId: string): Row => ({ id, topicId, right: 1, wrong: 0, score: 0, streak: 1, lastAt: 1, due: 2 }) satisfies ExerciseStat
const folder = (id: string, name: string, parentId = 'root'): Row => ({ id, name, parentId, createdAt: 1, updatedAt: 1 }) satisfies DocFolder
const doc = (id: string, folderId: string, title: string, body: string): Row =>
  ({ id, folderId, title, body, tags: [], status: 'toRead', pinned: false, createdAt: 1, updatedAt: 1 }) satisfies Doc
const run = (id: string, decks: PracticeRun['decks']): Row =>
  ({ id, kind: 'due', start: 1, end: 9, activeMs: 5, reviewed: 2, correct: 1, directions: [], decks, day: '2026-11-21' }) satisfies PracticeRun

const ids = (rows: Row[] | undefined) => (rows ?? []).map((r) => r.id ?? r.key)

/** Both sides hold the German topic under different ids and the same starter deck "Basics" in it. */
function starter(): { local: Library; cloud: Library } {
  return {
    local: { topics: [topic('tL', 'German')], decks: [deck('dL', 'Basics', 'tL')] },
    cloud: { topics: [topic('tC', ' german ')], decks: [deck('dC', 'Basics', 'tC')] },
  }
}

describe('foldLibraries', () => {
  it('two German topics become one', () => {
    const local: Library = { topics: [topic('tL', 'German')], sessions: [session('s1', 'tL')] }
    const cloud: Library = { topics: [topic('tC', ' german ')] }
    const { upload, dropLocal, summary } = foldLibraries(local, cloud)
    expect(upload.topics ?? []).toEqual([])
    expect(dropLocal).toContainEqual({ tbl: 'topics', id: 'tL' })
    expect(upload.sessions).toEqual([{ ...session('s1', 'tL'), topicId: 'tC' }])
    expect(summary.folded).toEqual({ topics: 1 })
    expect(summary.added).toEqual({ sessions: 1 })
  })

  it('same starter ids are not folded', () => {
    const local: Library = { decks: [deck('d1', 'Basics')], cards: [card('c1', 'd1', 'Hund', 'dog')] }
    const cloud: Library = { decks: [deck('d1', 'Basics')], cards: [card('c1', 'd1', 'Hund', 'dog')] }
    const { upload, dropLocal, mustWin, summary } = foldLibraries(local, cloud)
    expect(summary.folded).toEqual({})
    expect(summary.added).toEqual({})
    expect(dropLocal).toEqual([])
    expect(mustWin).toEqual([])
    expect(upload.cards).toEqual([card('c1', 'd1', 'Hund', 'dog')])
    expect(upload.decks).toEqual([deck('d1', 'Basics')])
  })

  it('duplicate card keeps the review with more logs', () => {
    const { local, cloud } = starter()
    local.cards = [card('cL', 'dL', 'der Hund', 'dog')]
    local.reviews = [review('cL', 'dL', 'enToDe', 3)]
    local.reviewLogs = logs('lL', 'cL', 'dL', 'enToDe', 3)
    cloud.cards = [card('cC', 'dC', ' Der Hund', 'Dog ')]
    cloud.reviews = [review('cC', 'dC', 'enToDe', 1)]
    cloud.reviewLogs = logs('lC', 'cC', 'dC', 'enToDe', 1)

    const { upload, dropLocal, mustWin, summary } = foldLibraries(local, cloud)
    expect(mustWin).toEqual([{ tbl: 'reviews', id: 'cC:enToDe' }])
    expect(upload.decks ?? []).toEqual([])
    expect(upload.cards ?? []).toEqual([])
    expect(upload.reviews).toEqual([{ id: 'cC:enToDe', cardId: 'cC', deckId: 'dC', direction: 'enToDe', fsrs: fsrs(3, 3000), due: 0, state: 2 }])
    expect(upload.reviewLogs).toHaveLength(3)
    for (const log of upload.reviewLogs ?? []) expect(log).toMatchObject({ reviewId: 'cC:enToDe', cardId: 'cC', deckId: 'dC' })
    // With the cloud's one log, all four point at the cloud card.
    expect([...(upload.reviewLogs ?? []), ...(cloud.reviewLogs ?? [])].filter((l) => l.cardId === 'cC')).toHaveLength(4)
    expect(dropLocal).toEqual(expect.arrayContaining([
      { tbl: 'topics', id: 'tL' }, { tbl: 'decks', id: 'dL' }, { tbl: 'cards', id: 'cL' }, { tbl: 'reviews', id: 'cL:enToDe' },
    ]))
    expect(summary.folded).toEqual({ topics: 1, decks: 1, cards: 1, reviews: 1 })
    expect(summary.added).toEqual({ reviewLogs: 3 })
  })

  it('cloud review wins a tie', () => {
    const { local, cloud } = starter()
    local.cards = [card('cL', 'dL', 'der Hund', 'dog')]
    local.reviews = [review('cL', 'dL', 'enToDe', 1)]
    local.reviewLogs = logs('lL', 'cL', 'dL', 'enToDe', 1)
    cloud.cards = [card('cC', 'dC', 'der Hund', 'dog')]
    cloud.reviews = [review('cC', 'dC', 'enToDe', 1)]
    cloud.reviewLogs = logs('lC', 'cC', 'dC', 'enToDe', 1)

    const { upload, dropLocal, mustWin } = foldLibraries(local, cloud)
    expect(mustWin).toEqual([])
    expect(ids(upload.reviews)).not.toContain('cC:enToDe')
    expect(upload.reviews ?? []).toEqual([])
    expect(dropLocal).toContainEqual({ tbl: 'reviews', id: 'cL:enToDe' })
    expect(upload.reviewLogs).toEqual([{ ...logs('lL', 'cL', 'dL', 'enToDe', 1)[0], reviewId: 'cC:enToDe', cardId: 'cC', deckId: 'dC' }])
  })

  it('a same-id review with more logs here wins over the cloud row, however old', () => {
    // Starter cards share their pack ids, so their reviews have the same id on both sides.
    const local: Library = { cards: [card('c1', 'd1', 'Hund', 'dog')], reviews: [review('c1', 'd1', 'enToDe', 5)], reviewLogs: logs('l', 'c1', 'd1', 'enToDe', 5) }
    const cloud: Library = { cards: [card('c1', 'd1', 'Hund', 'dog')], reviews: [{ ...review('c1', 'd1', 'enToDe', 0), fsrs: fsrs(0) }] }
    const { upload, mustWin, dropLocal, summary } = foldLibraries(local, cloud)
    expect(upload.reviews).toEqual([review('c1', 'd1', 'enToDe', 5)])
    expect(mustWin).toEqual([{ tbl: 'reviews', id: 'c1:enToDe' }])
    expect(dropLocal).toEqual([])
    expect(summary.folded).toEqual({})
  })

  it('a same-id review the cloud practised more is not uploaded', () => {
    const local: Library = { reviews: [review('c1', 'd1', 'enToDe', 1)], reviewLogs: logs('l', 'c1', 'd1', 'enToDe', 1) }
    const cloud: Library = { reviews: [review('c1', 'd1', 'enToDe', 4)], reviewLogs: logs('k', 'c1', 'd1', 'enToDe', 4) }
    const { upload, mustWin, dropLocal } = foldLibraries(local, cloud)
    expect(upload.reviews ?? []).toEqual([])
    expect(mustWin).toEqual([])
    expect(dropLocal).toEqual([])
    // The logs are this browser's own and still go up.
    expect(upload.reviewLogs).toHaveLength(1)
  })

  it('same-id reviews with as many logs: the later review wins, a tie goes to the cloud', () => {
    const at = (reps: number, last: number): Row => ({ ...review('c1', 'd1', 'enToDe', reps), fsrs: fsrs(reps, last) })
    const later = foldLibraries({ reviews: [at(2, 9_000)] }, { reviews: [at(1, 5_000)] })
    expect(later.upload.reviews).toEqual([at(2, 9_000)])
    expect(later.mustWin).toEqual([{ tbl: 'reviews', id: 'c1:enToDe' }])
    const earlier = foldLibraries({ reviews: [at(2, 5_000)] }, { reviews: [at(1, 9_000)] })
    expect(earlier.upload.reviews ?? []).toEqual([])
    const tie = foldLibraries({ reviews: [at(2, 5_000)] }, { reviews: [at(1, 5_000)] })
    expect(tie.upload.reviews ?? []).toEqual([])
    expect(tie.mustWin).toEqual([])
  })

  it('same-id drill and exercise stats keep the side with more answers, then the later one', () => {
    const local: Library = {
      drillStats: [drill('c1', 4, 2), drill('c2', 1, 0), { ...drill('c3', 1, 1), lastAt: 9 }],
      exerciseStats: [{ ...exStat('e1', 'g1'), right: 6 }, exStat('e2', 'g1'), { ...exStat('e3', 'g1'), lastAt: 9 }],
    }
    const cloud: Library = {
      drillStats: [drill('c1', 1, 0), drill('c2', 3, 3), { ...drill('c3', 2, 0), lastAt: 5 }],
      exerciseStats: [exStat('e1', 'g1'), { ...exStat('e2', 'g1'), wrong: 4 }, { ...exStat('e3', 'g1'), lastAt: 5 }],
    }
    const { upload, mustWin, dropLocal } = foldLibraries(local, cloud)
    expect(ids(upload.drillStats)).toEqual(['c1:gender', 'c3:gender'])
    expect(ids(upload.exerciseStats)).toEqual(['e1', 'e3'])
    expect(mustWin).toEqual(expect.arrayContaining([
      { tbl: 'drillStats', id: 'c1:gender' }, { tbl: 'drillStats', id: 'c3:gender' },
      { tbl: 'exerciseStats', id: 'e1' }, { tbl: 'exerciseStats', id: 'e3' },
    ]))
    expect(mustWin).toHaveLength(4)
    expect(dropLocal).toEqual([])
  })

  it('a review moved onto an id this browser also has competes with that row and the cloud', () => {
    // cC is on both sides; cL is a duplicate of it here, so its review moves onto cC's.
    const base = (): { local: Library; cloud: Library } => ({
      local: {
        cards: [card('cC', 'd1', 'der Hund', 'dog'), card('cL', 'd1', 'der Hund', 'dog')],
        reviews: [review('cC', 'd1', 'enToDe', 2), review('cL', 'd1', 'enToDe', 5)],
        reviewLogs: [...logs('a', 'cC', 'd1', 'enToDe', 2), ...logs('b', 'cL', 'd1', 'enToDe', 5)],
      },
      cloud: { cards: [card('cC', 'd1', 'der Hund', 'dog')], reviews: [review('cC', 'd1', 'enToDe', 3)], reviewLogs: logs('c', 'cC', 'd1', 'enToDe', 3) },
    })
    const won = foldLibraries(base().local, base().cloud)
    expect(won.upload.reviews).toEqual([{ ...review('cL', 'd1', 'enToDe', 5), id: 'cC:enToDe', cardId: 'cC' }])
    expect(won.mustWin).toEqual([{ tbl: 'reviews', id: 'cC:enToDe' }])
    // Both local rows gave way: cL's moved off its id, cC's was replaced by cL's.
    expect(won.dropLocal.filter((d) => d.tbl === 'reviews')).toEqual(expect.arrayContaining([{ tbl: 'reviews', id: 'cL:enToDe' }, { tbl: 'reviews', id: 'cC:enToDe' }]))

    const { local, cloud } = base()
    cloud.reviewLogs = logs('c', 'cC', 'd1', 'enToDe', 6)
    const lost = foldLibraries(local, cloud)
    expect(lost.upload.reviews ?? []).toEqual([])
    expect(lost.mustWin).toEqual([])
    // The moved row leaves its old id; the row already on the cloud's id gives way to the cloud's, as a same-id row does.
    expect(lost.dropLocal.filter((d) => d.tbl === 'reviews')).toEqual([{ tbl: 'reviews', id: 'cL:enToDe' }])
  })

  it('keeps a local review of a direction the cloud card never had', () => {
    const { local, cloud } = starter()
    local.cards = [card('cL', 'dL', 'der Hund', 'dog')]
    local.reviews = [review('cL', 'dL', 'deToEn', 1)]
    cloud.cards = [card('cC', 'dC', 'der Hund', 'dog')]
    cloud.reviews = [review('cC', 'dC', 'enToDe', 4)]
    cloud.reviewLogs = logs('lC', 'cC', 'dC', 'enToDe', 4)
    const { upload, mustWin } = foldLibraries(local, cloud)
    expect(ids(upload.reviews)).toEqual(['cC:deToEn'])
    // The cloud had no row there, so nothing has to be pushed over one.
    expect(mustWin).toEqual([])
  })

  it('a different card in a folded deck is added to the cloud deck', () => {
    const { local, cloud } = starter()
    local.cards = [card('cL', 'dL', 'die Katze', 'cat')]
    local.reviews = [review('cL', 'dL', 'enToDe', 2)]
    local.drillStats = [drill('cL', 1, 1)]
    cloud.cards = [card('cC', 'dC', 'der Hund', 'dog')]
    const { upload, summary } = foldLibraries(local, cloud)
    expect(upload.cards).toEqual([{ ...card('cL', 'dL', 'die Katze', 'cat'), deckId: 'dC' }])
    expect(upload.reviews).toEqual([{ ...review('cL', 'dL', 'enToDe', 2), deckId: 'dC' }])
    expect(upload.drillStats).toEqual([drill('cL', 1, 1)])
    expect(summary.added).toEqual({ cards: 1, reviews: 1, drillStats: 1 })
  })

  it('does not fold decks of the same name in different topics', () => {
    const local: Library = { topics: [topic('tL', 'Spanish')], decks: [deck('dL', 'Basics', 'tL')], cards: [card('cL', 'dL', 'perro', 'dog')] }
    const cloud: Library = { topics: [topic('tC', 'German')], decks: [deck('dC', 'Basics', 'tC')], cards: [card('cC', 'dC', 'perro', 'dog')] }
    const { upload, summary } = foldLibraries(local, cloud)
    expect(ids(upload.decks)).toEqual(['dL'])
    expect(ids(upload.cards)).toEqual(['cL'])
    expect(summary.folded).toEqual({})
  })

  it('drill stats move to the cloud card, keeping the one with more answers', () => {
    const { local, cloud } = starter()
    local.cards = [card('cL', 'dL', 'der Hund', 'dog'), card('cL2', 'dL', 'die Katze', 'cat')]
    local.drillStats = [drill('cL', 4, 2), drill('cL2', 1, 0)]
    cloud.cards = [card('cC', 'dC', 'der Hund', 'dog'), card('cC2', 'dC', 'die Katze', 'cat')]
    cloud.drillStats = [drill('cC', 1, 1), drill('cC2', 5, 0)]
    const { upload, dropLocal, mustWin, summary } = foldLibraries(local, cloud)
    expect(upload.drillStats).toEqual([{ ...drill('cL', 4, 2), id: 'cC:gender', cardId: 'cC' }])
    expect(mustWin).toEqual([{ tbl: 'drillStats', id: 'cC:gender' }])
    expect(dropLocal).toEqual(expect.arrayContaining([{ tbl: 'drillStats', id: 'cL:gender' }, { tbl: 'drillStats', id: 'cL2:gender' }]))
    expect(summary.folded.drillStats).toBe(2)
  })

  it('two local copies of one cloud card upload one review and keep every log', () => {
    const { local, cloud } = starter()
    local.cards = [card('cL1', 'dL', 'der Hund', 'dog'), card('cL2', 'dL', 'der Hund', 'dog')]
    local.reviews = [review('cL1', 'dL', 'enToDe', 1), review('cL2', 'dL', 'enToDe', 2)]
    local.reviewLogs = [...logs('a', 'cL1', 'dL', 'enToDe', 1), ...logs('b', 'cL2', 'dL', 'enToDe', 2)]
    cloud.cards = [card('cC', 'dC', 'der Hund', 'dog')]
    const { upload, dropLocal } = foldLibraries(local, cloud)
    expect(upload.reviews).toEqual([{ ...review('cL2', 'dL', 'enToDe', 2), id: 'cC:enToDe', cardId: 'cC', deckId: 'dC' }])
    expect(upload.reviewLogs).toHaveLength(3)
    for (const log of upload.reviewLogs ?? []) expect(log).toMatchObject({ reviewId: 'cC:enToDe', cardId: 'cC' })
    expect(dropLocal).toEqual(expect.arrayContaining([{ tbl: 'reviews', id: 'cL1:enToDe' }, { tbl: 'reviews', id: 'cL2:enToDe' }]))
  })

  it('identical starter story is dropped, different text is kept', () => {
    const local: Library = { topics: [topic('tL', 'German')], stories: [story('sL', 'Im Café', 'Anna trinkt Kaffee.'), story('sL2', 'Im Café', 'Anna trinkt Tee.')] }
    local.stories![1] = { ...local.stories![1], topicId: 'tL' }
    const cloud: Library = { topics: [topic('tC', 'German')], stories: [story('sC', 'Im Café', 'Anna trinkt Kaffee.')] }
    const { upload, dropLocal, summary } = foldLibraries(local, cloud)
    expect(upload.stories).toEqual([{ ...story('sL2', 'Im Café', 'Anna trinkt Tee.'), topicId: 'tC' }])
    expect(dropLocal).toContainEqual({ tbl: 'stories', id: 'sL' })
    expect(summary.folded.stories).toBe(1)
    expect(summary.added.stories).toBe(1)
  })

  it('folds a question and points its answers at the cloud copy', () => {
    const local: Library = { questions: [question('qL', 'Wie heißt du?')], responses: [response('r1', 'qL')] }
    const cloud: Library = { questions: [question('qC', 'Wie heißt du?')] }
    const { upload, dropLocal } = foldLibraries(local, cloud)
    expect(upload.questions ?? []).toEqual([])
    expect(dropLocal).toContainEqual({ tbl: 'questions', id: 'qL' })
    expect(upload.responses).toEqual([{ ...response('r1', 'qL'), questionId: 'qC' }])
  })

  it('keeps a question whose own answer the cloud copy lacks', () => {
    const local: Library = { questions: [question('qL', 'Wie heißt du?', 'Ich heiße Sam.')], responses: [response('r1', 'qL')] }
    const cloud: Library = { questions: [question('qC', 'Wie heißt du?')] }
    const { upload, summary } = foldLibraries(local, cloud)
    expect(upload.questions).toEqual([question('qL', 'Wie heißt du?', 'Ich heiße Sam.')])
    expect(upload.responses).toEqual([response('r1', 'qL')])
    expect(summary.folded).toEqual({})
  })

  it('a folded grammar topic keeps the scores of exercises the cloud copy has', () => {
    const local: Library = { grammarTopics: [grammar('gL', ['e1', 'e2'])], exerciseStats: [exStat('e1', 'gL'), exStat('e2', 'gL'), exStat('x9', 'gOther')] }
    const cloud: Library = { grammarTopics: [grammar('gC', ['e1'])] }
    const { upload, dropLocal, summary } = foldLibraries(local, cloud)
    expect(upload.grammarTopics ?? []).toEqual([])
    expect(upload.exerciseStats).toEqual([{ ...exStat('e1', 'gL'), topicId: 'gC' }, exStat('x9', 'gOther')])
    expect(dropLocal).toEqual(expect.arrayContaining([{ tbl: 'grammarTopics', id: 'gL' }, { tbl: 'exerciseStats', id: 'e2' }]))
    expect(summary.folded).toEqual({ grammarTopics: 1, exerciseStats: 1 })
  })

  it('folds nested doc folders through their parents', () => {
    const local: Library = {
      docFolders: [folder('fL2', 'Grammatik', 'fL1'), folder('fL1', 'Deutsch'), folder('fL3', 'Eigenes', 'fL2')],
      docs: [doc('dc1', 'fL2', 'Kasus', 'Text'), doc('dc2', 'fL2', 'Kasus', 'Other text'), doc('dc3', 'fL3', 'Mine', 'x')],
    }
    const cloud: Library = { docFolders: [folder('fC1', 'Deutsch'), folder('fC2', 'Grammatik', 'fC1')], docs: [doc('dcC', 'fC2', 'Kasus', 'Text')] }
    const { upload, dropLocal, summary } = foldLibraries(local, cloud)
    expect(upload.docFolders).toEqual([folder('fL3', 'Eigenes', 'fC2')])
    expect(upload.docs).toEqual([doc('dc2', 'fC2', 'Kasus', 'Other text'), doc('dc3', 'fL3', 'Mine', 'x')])
    expect(dropLocal).toEqual(expect.arrayContaining([
      { tbl: 'docFolders', id: 'fL1' }, { tbl: 'docFolders', id: 'fL2' }, { tbl: 'docs', id: 'dc1' },
    ]))
    expect(summary.folded).toEqual({ docFolders: 2, docs: 1 })
  })

  it('repoints tasks and practice runs, adding up two local decks folded into one', () => {
    const { local, cloud } = starter()
    local.decks = [...local.decks!, deck('dL2', 'basics ', 'tL'), deck('dOwn', 'Mine', 'tL')]
    local.tasks = [{ id: 'k1', title: 'Read', topicId: 'tL', priority: 'low', status: 'todo', order: 0, createdAt: 1 }]
    local.practiceRuns = [run('p1', { dL: { ms: 10, reviewed: 1, correct: 1 }, dL2: { ms: 5, reviewed: 2, correct: 0 }, dOwn: { ms: 1, reviewed: 1, correct: 1 } })]
    const { upload } = foldLibraries(local, cloud)
    expect(upload.decks).toEqual([{ ...deck('dOwn', 'Mine', 'tL'), topicId: 'tC' }])
    expect(upload.tasks).toEqual([{ ...local.tasks[0], topicId: 'tC' }])
    expect(upload.practiceRuns?.[0].decks).toEqual({ dC: { ms: 15, reviewed: 3, correct: 1 }, dOwn: { ms: 1, reviewed: 1, correct: 1 } })
  })

  it('kv settings: cloud wins', () => {
    const local: Library = {
      topics: [topic('tL', 'German')],
      kv: [
        { key: 'settings', value: { pomodoroFocus: 50 } },
        { key: 'activeTimer', value: { runId: 'r', topicId: 'tL' } satisfies Partial<ActiveTimer> },
        { key: 'tour', value: true },
      ],
    }
    const cloud: Library = { topics: [topic('tC', 'German')], kv: [{ key: 'settings', value: { pomodoroFocus: 25 } }] }
    const { upload, dropLocal, summary } = foldLibraries(local, cloud)
    expect(upload.kv).toEqual([{ key: 'activeTimer', value: { runId: 'r', topicId: 'tC' } }])
    expect(dropLocal).toContainEqual({ tbl: 'kv', id: 'settings' })
    expect(summary.folded.kv).toBe(1)
    expect(summary.added.kv).toBe(1)
  })

  it('uploads everything when the cloud is empty', () => {
    const { local } = starter()
    local.cards = [card('c1', 'dL', 'der Hund', 'dog')]
    local.images = [{ id: 'i1', width: 1, height: 1, fit: 'cover', type: 'image/webp' }]
    const { upload, dropLocal, summary } = foldLibraries(local, {})
    expect(upload).toEqual(local)
    expect(dropLocal).toEqual([])
    expect(summary.added).toEqual({ topics: 1, decks: 1, cards: 1, images: 1 })
  })

  it('does not change its inputs', () => {
    const { local, cloud } = starter()
    local.cards = [card('cL', 'dL', 'der Hund', 'dog')]
    local.reviews = [review('cL', 'dL', 'enToDe', 3)]
    local.reviewLogs = logs('lL', 'cL', 'dL', 'enToDe', 3)
    local.practiceRuns = [run('p1', { dL: { ms: 1, reviewed: 1, correct: 1 } })]
    cloud.cards = [card('cC', 'dC', 'der Hund', 'dog')]
    const before = structuredClone({ local, cloud })
    foldLibraries(local, cloud)
    expect({ local, cloud }).toEqual(before)
  })
})

describe('uploadTime', () => {
  it('uses the time each kind of record last changed', () => {
    expect(uploadTime('reviews', { ...review('c', 'd', 'enToDe', 1), fsrs: fsrs(1, 1_700_000_000_000) })).toBe(1_700_000_000_000)
    expect(uploadTime('reviews', { ...review('c', 'd', 'enToDe', 0), fsrs: fsrs(0) })).toBe(0)
    expect(uploadTime('docs', { ...doc('x', 'root', 't', 'b'), updatedAt: 77 })).toBe(77)
    expect(uploadTime('reviewLogs', logs('l', 'c', 'd', 'enToDe', 2)[1])).toBe(1)
    expect(uploadTime('sessions', session('s', 't'))).toBe(2)
    expect(uploadTime('practiceRuns', run('p', {}))).toBe(9)
    expect(uploadTime('drillStats', { ...drill('c', 0, 0), lastAt: 33 })).toBe(33)
    expect(uploadTime('exerciseStats', { ...exStat('e', 'g'), lastAt: 44 })).toBe(44)
    expect(uploadTime('responses', response('r', 'q'))).toBe(5)
    expect(uploadTime('topics', { ...topic('t', 'German'), createdAt: 12 })).toBe(12)
    expect(uploadTime('kv', { key: 'seeded', value: true })).toBe(0)
  })
})
