import { describe, expect, it } from 'vitest'
import type { Card, CardReview, PracticeRun, Session, Topic, WeekGoals } from './types'
import { MINUTE, WEEKDAYS } from './time'
import { State } from './srs'
import { buildToday, dayEndsAt, dayKeyAt, pickWordOfTheDay, todaySubtitle, type TodayInput } from './today'

const week = (minutes: number) => Object.fromEntries(WEEKDAYS.map((d) => [d, minutes])) as WeekGoals

const topic = (id: string, goal: number | WeekGoals, extra: Partial<Topic> = {}): Topic => ({
  id,
  name: id,
  color: 'sage',
  goalMinutes: typeof goal === 'number' ? week(goal) : goal,
  goalHistory: [],
  archived: false,
  order: 0,
  createdAt: Date.UTC(2026, 0, 1),
  ...extra,
})

const session = (topicId: string, minutes: number, date: string, start: number, extra: Partial<Session> = {}): Session => ({
  id: `${topicId}-${start}`,
  topicId,
  start,
  end: start + minutes * MINUTE,
  minutes,
  date,
  source: 'timer',
  ...extra,
})

// Thursday 19 November 2026, 12:00 in Berlin (UTC+1).
const NOON_BERLIN = Date.UTC(2026, 10, 19, 11, 0)

const input = (extra: Partial<TodayInput> = {}): TodayInput => ({
  topics: [],
  sessions: [],
  cards: [],
  reviews: [],
  practiceRuns: [],
  now: NOON_BERLIN,
  timeZone: 'Europe/Berlin',
  ...extra,
})

describe('buildToday goals', () => {
  it('reports hit and missed goals with the time left', () => {
    const view = buildToday(
      input({
        topics: [topic('german', 120, { order: 0 }), topic('coding', 60, { order: 1 })],
        sessions: [session('german', 120, '2026-11-19', NOON_BERLIN - 3 * 60 * MINUTE), session('coding', 45, '2026-11-19', NOON_BERLIN - 60 * MINUTE)],
      }),
    )
    const [german, coding] = view.progress.topics
    expect(german).toMatchObject({ hit: true, left: 0, done: 120 })
    expect(coding).toMatchObject({ hit: false, left: 15, done: 45 })
    expect(view.progress).toMatchObject({ totalDone: 165, totalGoal: 180, totalLeft: 15, goalsHit: 1, goalCount: 2 })
    expect(view.subtitle).toBe('Thursday, 19 November · 0:15 h left to reach your goals')
  })

  it('uses the weekday goal, and a day without a goal has none', () => {
    const goals = { ...week(0), thu: 30 }
    const thursday = buildToday(input({ topics: [topic('german', goals)] }))
    expect(thursday.progress.topics[0].goal).toBe(30)
    const friday = buildToday(input({ topics: [topic('german', goals)], now: NOON_BERLIN + 24 * 60 * MINUTE }))
    expect(friday.progress.topics[0].goal).toBe(0)
    expect(friday.subtitle).toBe('Friday, 20 November · no goals today')
  })

  it('says when every goal is reached', () => {
    const view = buildToday(input({ topics: [topic('a', 10)], sessions: [session('a', 10, '2026-11-19', NOON_BERLIN - 20 * MINUTE)] }))
    expect(view.subtitle).toBe('Thursday, 19 November · every goal reached')
  })

  it('leaves archived topics out of the goals but counts their time', () => {
    const view = buildToday(
      input({
        topics: [topic('a', 60), topic('old', 60, { archived: true })],
        sessions: [session('old', 20, '2026-11-19', NOON_BERLIN - 30 * MINUTE)],
      }),
    )
    expect(view.progress.topics.map((t) => t.topic.id)).toEqual(['a'])
    expect(view.progress.totalDone).toBe(20)
    expect(view.sessions[0]).toMatchObject({ topicName: 'old', minutes: 20 })
  })

  it('orders topics by their order field', () => {
    const view = buildToday(input({ topics: [topic('b', 10, { order: 2 }), topic('a', 10, { order: 1 })] }))
    expect(view.progress.topics.map((t) => t.topic.id)).toEqual(['a', 'b'])
  })
})

describe('buildToday days and zones', () => {
  it('counts only the sessions dated today, also for a run split at midnight', () => {
    // 23:50 to 00:20 Berlin: 10 minutes belong to the 18th, 20 to the 19th.
    const midnight = Date.UTC(2026, 10, 18, 23, 0)
    const before = session('a', 10, '2026-11-18', midnight - 10 * MINUTE, { runId: 'r' })
    const after = session('a', 20, '2026-11-19', midnight, { runId: 'r' })
    const view = buildToday(input({ topics: [topic('a', 60)], sessions: [before, after] }))
    expect(view.progress.totalDone).toBe(20)
    expect(view.sessions).toHaveLength(1)
    expect(view.sessions[0]).toMatchObject({ startClock: '00:00', endClock: '00:20' })
  })

  it('reads the date and clock in the owner zone, not the device zone', () => {
    // 23:30 UTC on the 19th is already the 20th in Berlin and still the 19th in New York.
    const now = Date.UTC(2026, 10, 19, 23, 30)
    expect(dayKeyAt(now, 'Europe/Berlin')).toBe('2026-11-20')
    expect(dayKeyAt(now, 'America/New_York')).toBe('2026-11-19')
    const s = session('a', 30, '2026-11-20', Date.UTC(2026, 10, 19, 23, 0))
    const berlin = buildToday(input({ topics: [topic('a', 60)], sessions: [s], now, timeZone: 'Europe/Berlin' }))
    expect(berlin.today).toBe('2026-11-20')
    expect(berlin.sessions[0]).toMatchObject({ startClock: '00:00', endClock: '00:30' })
    const newYork = buildToday(input({ topics: [topic('a', 60)], sessions: [s], now, timeZone: 'America/New_York' }))
    expect(newYork.today).toBe('2026-11-19')
    expect(newYork.sessions).toEqual([])
  })

  it('knows when the day ends in the owner zone', () => {
    const now = Date.UTC(2026, 10, 19, 11, 0)
    expect(dayEndsAt(now, 'Europe/Berlin')).toBe(Date.UTC(2026, 10, 19, 23, 0))
    expect(dayEndsAt(now, 'America/New_York')).toBe(Date.UTC(2026, 10, 20, 5, 0))
    expect(buildToday(input({ now })).dayEndsAt).toBe(Date.UTC(2026, 10, 19, 23, 0))
  })

  it('falls back to the device day for a zone it does not know', () => {
    expect(() => dayKeyAt(NOON_BERLIN, 'Not/AZone')).not.toThrow()
    expect(dayKeyAt(NOON_BERLIN, undefined)).toBe(dayKeyAt(NOON_BERLIN, 'Not/AZone'))
  })

  it('shows sessions in time order with whole minutes and the note', () => {
    const late = session('a', 0.2, '2026-11-19', NOON_BERLIN - 10 * MINUTE, { note: 'verbs' })
    const early = session('a', 29.6, '2026-11-19', NOON_BERLIN - 60 * MINUTE)
    const view = buildToday(input({ topics: [topic('a', 60, { color: 'clay' })], sessions: [late, early] }))
    expect(view.sessions.map((s) => s.minutes)).toEqual([30, 1])
    expect(view.sessions[1]).toMatchObject({ note: 'verbs', topicColor: 'clay' })
    expect(view.sessions[0].note).toBeUndefined()
  })
})

describe('buildToday streak and practice', () => {
  it('counts the first topic streak, today only extending it', () => {
    const t = topic('a', 30, { createdAt: Date.UTC(2026, 10, 15), goalHistory: [{ since: '2026-11-15', goals: week(30) }] })
    const day = (d: number, minutes: number) => session('a', minutes, `2026-11-${d}`, Date.UTC(2026, 10, d, 9))
    const view = buildToday(input({ topics: [t], sessions: [day(16, 30), day(17, 30), day(18, 30)] }))
    expect(view.streak).toEqual({ days: 3, topicName: 'a' })
    const broken = buildToday(input({ topics: [t], sessions: [day(16, 30), day(18, 30)] }))
    expect(broken.streak.days).toBe(1)
  })

  it('has no streak without topics', () => {
    expect(buildToday(input()).streak).toEqual({ days: 0, topicName: undefined })
  })

  it('adds up the flashcard practice of today only', () => {
    const run = (id: string, day: string, ms: number, reviewed: number): PracticeRun => ({
      id,
      kind: 'practice',
      start: 0,
      end: 1,
      activeMs: ms,
      reviewed,
      correct: reviewed,
      directions: [],
      decks: {},
      day,
    })
    const view = buildToday(input({ practiceRuns: [run('1', '2026-11-19', 60_000, 10), run('2', '2026-11-19', 30_000, 5), run('3', '2026-11-18', 99_000, 50)] }))
    expect(view.practised).toEqual({ ms: 90_000, reviewed: 15 })
  })
})

describe('todaySubtitle', () => {
  it('shows the time left in hours and minutes', () => {
    expect(todaySubtitle({ today: '2026-11-19', goalCount: 2, totalLeft: 70 })).toBe('Thursday, 19 November · 1:10 h left to reach your goals')
  })
})

const card = (id: string, extra: Partial<Card> = {}): Card => ({
  id,
  deckId: 'd',
  type: 'word',
  english: id,
  german: id,
  tags: [],
  createdAt: 0,
  updatedAt: 0,
  ...extra,
})
const learned = (cardId: string): CardReview => ({ id: `${cardId}:enToDe`, cardId, deckId: 'd', direction: 'enToDe', fsrs: {} as CardReview['fsrs'], due: 0, state: State.Review })

describe('pickWordOfTheDay', () => {
  it('is undefined without words, and ignores cloze cards', () => {
    expect(pickWordOfTheDay([], [], '2026-11-19')).toBeUndefined()
    expect(pickWordOfTheDay([card('c', { type: 'cloze' })], [], '2026-11-19')).toBeUndefined()
  })

  it('picks the same word all day and varies over days', () => {
    const cards = Array.from({ length: 20 }, (_, i) => card(`w${String(i).padStart(2, '0')}`, { emoji: '🐶' }))
    const a = pickWordOfTheDay(cards, [], '2026-11-19')
    expect(pickWordOfTheDay([...cards].reverse(), [], '2026-11-19')).toBe(cards.find((c) => c.id === a!.id))
    const days = new Set(Array.from({ length: 10 }, (_, i) => pickWordOfTheDay(cards, [], `2026-11-${10 + i}`)!.id))
    expect(days.size).toBeGreaterThan(1)
  })

  it('prefers a learned word with a picture, then any learned word', () => {
    const cards = [card('plain'), card('pic', { emoji: '🐶' }), card('learnedPlain'), card('learnedPic', { imageId: 'i' })]
    expect(pickWordOfTheDay(cards, [learned('learnedPlain'), learned('learnedPic')], '2026-11-19')!.id).toBe('learnedPic')
    expect(pickWordOfTheDay(cards, [learned('learnedPlain')], '2026-11-19')!.id).toBe('learnedPlain')
  })

  it('before anything is learned prefers a pictured noun', () => {
    const cards = [card('verb', { emoji: '🏃', partOfSpeech: 'verb' }), card('noun', { emoji: '🐶', gender: 'der' }), card('bare')]
    expect(pickWordOfTheDay(cards, [], '2026-11-19')!.id).toBe('noun')
  })
})
