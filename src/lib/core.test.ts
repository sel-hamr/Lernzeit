import { describe, expect, it } from 'vitest'
import type { ActiveTimer, CardReview, Deck, ReviewLog, Topic } from '@/db/types'
import { checkAnswer, diffChars } from './answer'
import { germanText, parseCloze, splitArticle, wordKind } from './german'
import { computeStreak, goalFor, indexMinutes, isGoalHit, topicStreak, uniformGoals, withGoalChange } from './goals'
import { heatLevel, topicWeek, weekSummary } from './history'
import { buildPracticeQueue, buildQueue, usageToday } from './queue'
import { splitAtMidnight } from './sessions'
import { applyGrade, newFsrs, previewGrades, State } from './srs'
import { addDays, dateKey, formatHM, formatTimer, startOfWeek, weekdayOf, DAY, MINUTE } from './time'
import { elapsedMs, isPhaseComplete, pause, remainingMs, resume, studiedMinutes } from './timer'

const at = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min).getTime()

describe('time', () => {
  it('formats hours and minutes like the mockups', () => {
    expect(formatHM(70)).toBe('1:10')
    expect(formatHM(150)).toBe('2:30')
    expect(formatHM(5.9)).toBe('0:05')
    expect(formatTimer(24 * 60_000 + 13_000)).toBe('24:13')
    expect(formatTimer(3_723_000)).toBe('1:02:03')
  })

  it('uses Monday-based weeks', () => {
    expect(weekdayOf('2026-10-14')).toBe('wed')
    expect(startOfWeek('2026-10-14')).toBe('2026-10-12')
    expect(startOfWeek('2026-10-18')).toBe('2026-10-12')
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01')
  })
})

describe('splitAtMidnight', () => {
  it('keeps a same-day session whole', () => {
    const parts = splitAtMidnight(at(2026, 10, 14, 9), at(2026, 10, 14, 10, 10))
    expect(parts).toHaveLength(1)
    expect(parts[0]).toMatchObject({ date: '2026-10-14', minutes: 70 })
  })

  it('splits a session that crosses midnight between the two days', () => {
    const parts = splitAtMidnight(at(2026, 10, 14, 23, 30), at(2026, 10, 15, 0, 45))
    expect(parts.map((p) => [p.date, p.minutes])).toEqual([
      ['2026-10-14', 30],
      ['2026-10-15', 45],
    ])
  })

  it('shares paused (shorter) active time in proportion and never loses minutes', () => {
    const parts = splitAtMidnight(at(2026, 10, 14, 23, 0), at(2026, 10, 15, 1, 0), 60)
    expect(parts.map((p) => p.minutes)).toEqual([30, 30])
    const odd = splitAtMidnight(at(2026, 10, 14, 23, 20), at(2026, 10, 15, 0, 50), 61)
    expect(odd.reduce((s, p) => s + p.minutes, 0)).toBeCloseTo(61, 5)
  })
})

function topic(overrides: Partial<Topic> = {}): Topic {
  return {
    id: 't1',
    name: 'German',
    color: 'sage',
    goalMinutes: uniformGoals(150),
    goalHistory: [{ since: '2026-10-01', goals: uniformGoals(150) }],
    archived: false,
    order: 0,
    createdAt: at(2026, 10, 1),
    ...overrides,
  }
}

describe('goals and streaks', () => {
  it('judges past days by the goal that applied then', () => {
    const t = withGoalChange(topic(), uniformGoals(60), '2026-10-10')
    expect(goalFor(t, '2026-09-30')).toBe(0)
    expect(goalFor(t, '2026-10-05')).toBe(150)
    expect(goalFor(t, '2026-10-10')).toBe(60)
  })

  it('supports a different goal per weekday', () => {
    const goals = { ...uniformGoals(150), sat: 180 }
    const t = topic({ goalMinutes: goals, goalHistory: [{ since: '2026-10-01', goals }] })
    expect(goalFor(t, '2026-10-17')).toBe(180) // Saturday
    expect(goalFor(t, '2026-10-16')).toBe(150)
  })

  it('counts a goal as hit on whole minutes', () => {
    expect(isGoalHit(149.6, 150)).toBe(false)
    expect(isGoalHit(150, 150)).toBe(true)
    expect(isGoalHit(10, 0)).toBe(false)
  })

  it('does not break a streak on an unfinished today, and skips goal-free days', () => {
    const hit = new Set(['2026-10-10', '2026-10-11', '2026-10-13'])
    const streak = computeStreak({
      firstDay: '2026-10-08',
      today: '2026-10-14',
      counts: (d) => d !== '2026-10-12', // no goal that day
      hit: (d) => hit.has(d),
    })
    expect(streak).toEqual({ current: 3, longest: 3 })
  })

  it('computes topic streaks from sessions', () => {
    const t = topic()
    const sessions = ['2026-10-12', '2026-10-13'].map((date, i) => ({
      id: String(i), topicId: 't1', start: 0, end: 0, minutes: 150, date, source: 'timer' as const,
    }))
    expect(topicStreak(t, indexMinutes(sessions), '2026-10-14')).toEqual({ current: 2, longest: 2 })
  })

  it('summarises a week', () => {
    const t = topic()
    const sessions = [
      { id: 'a', topicId: 't1', start: 0, end: 0, minutes: 150, date: '2026-10-12', source: 'timer' as const },
      { id: 'b', topicId: 't1', start: 0, end: 0, minutes: 60, date: '2026-10-13', source: 'timer' as const },
    ]
    const days = Array.from({ length: 7 }, (_, i) => addDays('2026-10-12', i))
    const s = weekSummary([t], indexMinutes(sessions), days, '2026-10-14')
    expect(s.totalMinutes).toBe(210)
    expect(s.totalGoal).toBe(150 * 7)
    expect(s.allHitDays).toBe(1)
    expect(s.countedDays).toBe(3)
    expect(topicWeek(t, indexMinutes(sessions), days, '2026-10-14').hits).toBe(1)
  })

  it('maps study time to heatmap levels', () => {
    expect(heatLevel(0, 150, false)).toBe(0)
    expect(heatLevel(30, 150, false)).toBe(1)
    expect(heatLevel(80, 150, false)).toBe(2)
    expect(heatLevel(120, 150, false)).toBe(3)
    expect(heatLevel(150, 150, true)).toBe(4)
  })
})

describe('timer maths', () => {
  const base: ActiveTimer = {
    runId: 'r', topicId: 't1', mode: 'countdown', startedAt: at(2026, 10, 14, 14, 2), pausedTotalMs: 0,
    targetMinutes: 45, phase: 'focus', cycle: 1, firstStartedAt: at(2026, 10, 14, 14, 2), note: '',
  }

  it('derives everything from timestamps, so a refresh changes nothing', () => {
    const now = base.startedAt + 20 * MINUTE + 47_000
    expect(formatTimer(remainingMs(base, now)!)).toBe('24:13')
    expect(isPhaseComplete(base, now)).toBe(false)
    expect(isPhaseComplete(base, base.startedAt + 45 * MINUTE)).toBe(true)
  })

  it('excludes paused time', () => {
    const paused = pause(base, base.startedAt + 10 * MINUTE)
    expect(elapsedMs(paused, base.startedAt + 60 * MINUTE)).toBe(10 * MINUTE)
    const resumed = resume(paused, base.startedAt + 30 * MINUTE)
    expect(elapsedMs(resumed, base.startedAt + 35 * MINUTE)).toBe(15 * MINUTE)
    expect(isPhaseComplete(paused, base.startedAt + 120 * MINUTE)).toBe(false)
  })

  it('never counts more than the countdown length, and never counts breaks', () => {
    expect(studiedMinutes(base, base.startedAt + 90 * MINUTE)).toBe(45)
    expect(studiedMinutes({ ...base, mode: 'pomodoro', phase: 'break' }, base.startedAt + MINUTE)).toBe(0)
    expect(studiedMinutes({ ...base, mode: 'free', targetMinutes: undefined }, base.startedAt + 90 * MINUTE)).toBe(90)
  })
})

describe('typed answers', () => {
  it('accepts the exact answer and ignores end punctuation', () => {
    expect(checkAnswer('der Hund', 'der Hund').verdict).toBe('exact')
    expect(checkAnswer('Der Hund spielt im Garten', 'Der Hund spielt im Garten.').verdict).toBe('exact')
  })

  it('accepts ue for ü and a missing umlaut as close', () => {
    expect(checkAnswer('der Schluessel', 'der Schlüssel').verdict).toBe('close')
    expect(checkAnswer('der Schlussel', 'der Schlüssel').verdict).toBe('close')
    expect(checkAnswer('die Strasse', 'die Straße').verdict).toBe('close')
    expect(checkAnswer('der hund', 'der Hund').verdict).toBe('close')
  })

  it('treats a missing article as close but a wrong article as wrong', () => {
    const missing = checkAnswer('Hund', 'der Hund')
    expect(missing.verdict).toBe('close')
    expect(missing.notes[0]).toContain('der')
    expect(checkAnswer('das Hund', 'der Hund').verdict).toBe('wrong')
  })

  it('rejects a different word', () => {
    expect(checkAnswer('Katze', 'der Hund').verdict).toBe('wrong')
    expect(checkAnswer('', 'der Hund').verdict).toBe('wrong')
  })

  it('marks wrong and missing letters', () => {
    expect(diffChars('Hnud', 'Hund').some((p) => p.kind !== 'ok')).toBe(true)
    expect(diffChars('Hun', 'Hund')).toEqual([
      { text: 'Hun', kind: 'ok' },
      { text: 'd', kind: 'missing' },
    ])
  })
})

describe('German helpers', () => {
  it('splits the article from a noun', () => {
    expect(splitArticle('der Hund')).toEqual({ gender: 'der', word: 'Hund' })
    expect(splitArticle('Die Sonne')).toEqual({ gender: 'die', word: 'Sonne' })
    expect(splitArticle('gehen')).toEqual({ word: 'gehen' })
    expect(splitArticle('der / die / das')).toEqual({ word: 'der / die / das' })
  })

  it('shows plural-only nouns with their article', () => {
    const leute = { type: 'word' as const, german: 'Leute', plural: 'die Leute', partOfSpeech: 'noun' }
    expect(germanText(leute)).toBe('die Leute')
    expect(germanText({ type: 'word', german: 'Hund', gender: 'der' })).toBe('der Hund')
    expect(wordKind({ type: 'word', german: 'gehen', partOfSpeech: 'verb' })).toBe('verb')
  })

  it('parses cloze markers', () => {
    expect(parseCloze('Der Hund {{spielt}} im Garten.')).toMatchObject({
      answer: 'spielt',
      masked: 'Der Hund ___ im Garten.',
      full: 'Der Hund spielt im Garten.',
    })
    expect(parseCloze('Kein Marker')).toBeNull()
  })
})

describe('review queue', () => {
  const deck: Deck = {
    id: 'd', name: 'German A1', newPerDay: 2, reviewsPerDay: 1,
    directions: { imageToDe: true, enToDe: true, deToEn: false }, order: 0, createdAt: 0,
  }
  const now = at(2026, 10, 14, 12)
  const review = (cardId: string, direction: CardReview['direction'], state: number, due: number): CardReview => ({
    id: `${cardId}:${direction}`, cardId, deckId: 'd', direction, fsrs: { ...newFsrs(0), state, due }, due, state,
  })

  it('limits new cards per card, not per direction, and caps reviews', () => {
    const reviews = [
      review('a', 'imageToDe', State.New, now), review('a', 'enToDe', State.New, now),
      review('b', 'enToDe', State.New, now), review('c', 'enToDe', State.New, now),
      review('x', 'enToDe', State.Review, now - 1000), review('y', 'enToDe', State.Review, now - 2000),
    ]
    const { counts, queue } = buildQueue({ reviews, decks: [deck], usage: new Map(), now })
    expect(counts.newCount).toBe(3) // a (two directions) + b
    expect(counts.reviewCount).toBe(1)
    expect(queue.some((r) => r.cardId === 'c')).toBe(false)
  })

  it('remembers new cards started earlier today', () => {
    const logs: ReviewLog[] = [
      { id: 'l', reviewId: 'a:imageToDe', cardId: 'a', deckId: 'd', direction: 'imageToDe', rating: 3, prevState: State.New, reviewedAt: now, durationMs: 0, day: dateKey(now) },
    ]
    const reviews = [review('a', 'enToDe', State.New, now), review('b', 'enToDe', State.New, now), review('c', 'enToDe', State.New, now)]
    const { queue } = buildQueue({ reviews, decks: [deck], usage: usageToday(logs, dateKey(now)), now })
    expect(queue.map((r) => r.cardId).sort()).toEqual(['a', 'b'])
  })

  it('includes learning cards that are due soon', () => {
    const reviews = [review('l', 'enToDe', State.Learning, now + 5 * MINUTE), review('m', 'enToDe', State.Learning, now + 2 * 60 * MINUTE)]
    const { queue } = buildQueue({ reviews, decks: [deck], usage: new Map(), now })
    expect(queue.map((r) => r.cardId)).toEqual(['l'])
  })
})

describe('practice queue', () => {
  const deck: Deck = {
    id: 'd', name: 'German A1', newPerDay: 0, reviewsPerDay: 0,
    directions: { imageToDe: true, enToDe: true, deToEn: false }, order: 0, createdAt: 0,
  }
  const other: Deck = { ...deck, id: 'o', name: 'Other' }
  const now = at(2026, 10, 14, 12)
  const review = (cardId: string, direction: CardReview['direction'], state: number, due: number, deckId = 'd'): CardReview => ({
    id: `${cardId}:${direction}`, cardId, deckId, direction, fsrs: { ...newFsrs(0), state, due }, due, state,
  })

  it('still has cards when the daily queue is empty', () => {
    const reviews = [review('a', 'enToDe', State.Review, now + 5 * DAY), review('b', 'enToDe', State.New, now)]
    expect(buildQueue({ reviews, decks: [deck], usage: new Map(), now }).queue).toEqual([])
    expect(buildPracticeQueue({ reviews, decks: [deck] }).map((r) => r.cardId)).toEqual(['a', 'b'])
  })

  it('puts studied cards first, soonest due first, then new cards in the order they were added', () => {
    const reviews = [
      review('late', 'enToDe', State.Review, now + 9 * DAY),
      review('n2', 'enToDe', State.New, now),
      review('soon', 'enToDe', State.Review, now + DAY),
      review('n1', 'enToDe', State.New, now),
      review('over', 'enToDe', State.Review, now - DAY), // held back by the review limit
      review('relearn', 'enToDe', State.Relearning, now + 2 * 60 * MINUTE),
    ]
    const created: Record<string, number> = { n1: 1, n2: 2 }
    const ids = buildPracticeQueue({ reviews, decks: [deck], createdAt: (id) => created[id] ?? 0 }).map((r) => r.cardId)
    expect(ids).toEqual(['over', 'relearn', 'soon', 'late', 'n1', 'n2'])
  })

  it('keeps to the chosen decks, caps the round and spreads directions of one card', () => {
    const reviews = [
      review('a', 'imageToDe', State.Review, now + DAY), review('a', 'enToDe', State.Review, now + DAY + 1),
      review('b', 'enToDe', State.Review, now + 2 * DAY), review('x', 'enToDe', State.Review, now, 'o'),
    ]
    expect(buildPracticeQueue({ reviews, decks: [deck] }).map((r) => r.id)).toEqual(['a:imageToDe', 'b:enToDe', 'a:enToDe'])
    expect(buildPracticeQueue({ reviews, decks: [deck, other], size: 2 }).map((r) => r.cardId)).toEqual(['x', 'a'])
    expect(buildPracticeQueue({ reviews, decks: [] })).toEqual([])
  })
  it('brings practised cards back soon instead of weeks out', () => {
    // A well-known card: FSRS alone would wait weeks after Good or Easy.
    const known = { ...newFsrs(0), state: State.Review, stability: 30, difficulty: 5, reps: 6, last_review: now - 10 * DAY, due: now + 20 * DAY }
    const normal = previewGrades(known, now)
    const practice = previewGrades(known, now, true)
    expect(normal[3].due - now).toBeGreaterThan(2 * DAY)
    expect(practice[1].due - now).toBeLessThanOrEqual(10 * MINUTE)
    expect(practice[2].due - now).toBeLessThanOrEqual(60 * MINUTE)
    expect(practice[3].due - now).toBe(DAY)
    expect(practice[4].due - now).toBe(2 * DAY)
    expect(applyGrade(known, 3, now, true).due).toBe(practice[3].due)
    // Never later than FSRS: a new card's Again stays at a minute.
    expect(previewGrades(newFsrs(now), now, true)[1].due).toBe(previewGrades(newFsrs(now), now)[1].due)
  })
})
