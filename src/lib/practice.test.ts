import { describe, expect, it } from 'vitest'
import type { PracticeRun } from '@/db/types'
import { addDeckTime, formatLastPractised, formatPracticeTime, inPlan, percentCorrect, planHref, practiceTotals, readPlan, runPart, totalsByDeck } from './practice'

describe('review plan', () => {
  it('reads decks, directions and scope from the address, ignoring unknown directions', () => {
    expect(readPlan(new URLSearchParams('decks=a,b&dirs=enToDe,sideways,deToEn&cards=all'))).toEqual({
      deckIds: ['a', 'b'],
      directions: ['enToDe', 'deToEn'],
      scope: 'all',
    })
    expect(readPlan(new URLSearchParams(''))).toEqual({ deckIds: [], directions: [], scope: 'due' })
    // The one-deck link from before the Review dialog still works.
    expect(readPlan(new URLSearchParams('deck=a')).deckIds).toEqual(['a'])
  })

  it('keeps the decks and leaves out directions that are every one the deck has', () => {
    const available = ['enToDe', 'deToEn'] as const
    expect(planHref({ deckIds: ['a'], directions: [...available], scope: 'all' }, [...available])).toBe('/flashcards/review?decks=a&cards=all')
    expect(planHref({ deckIds: ['a'], directions: ['deToEn'], scope: 'all' }, [...available])).toBe('/flashcards/review?decks=a&dirs=deToEn&cards=all')
    expect(planHref({ deckIds: [], directions: [], scope: 'due' }, [...available])).toBe('/flashcards/review')
  })

  it('round-trips through the address', () => {
    const plan = { deckIds: ['a', 'b'], directions: ['cloze' as const], scope: 'all' as const }
    const href = planHref(plan, ['enToDe', 'cloze'])
    expect(readPlan(new URLSearchParams(href.split('?')[1]))).toEqual(plan)
  })

  it('takes a review when its deck and direction are in the plan; an empty list takes every one', () => {
    const review = { deckId: 'a', direction: 'enToDe' as const }
    expect(inPlan(review, { deckIds: [], directions: [] })).toBe(true)
    expect(inPlan(review, { deckIds: ['a'], directions: ['enToDe', 'deToEn'] })).toBe(true)
    expect(inPlan(review, { deckIds: ['b'], directions: [] })).toBe(false)
    expect(inPlan(review, { deckIds: [], directions: ['deToEn'] })).toBe(false)
  })
})

describe('practice sessions', () => {
  const run = (id: string, decks: PracticeRun['decks'], end = Number(id) * 1000): PracticeRun => {
    const parts = Object.values(decks)
    const sum = (key: 'ms' | 'reviewed' | 'correct') => parts.reduce((n, p) => n + p[key], 0)
    return { id, kind: 'all', start: 0, end, activeMs: sum('ms'), reviewed: sum('reviewed'), correct: sum('correct'), directions: [], decks, day: '2026-10-14' }
  }

  it('adds each rated card to its deck without changing the old record', () => {
    const before = addDeckTime({}, 'a', 4000, true)
    const after = addDeckTime(addDeckTime(before, 'a', 6000, false), 'b', 1000, true)
    expect(before).toEqual({ a: { ms: 4000, reviewed: 1, correct: 1 } })
    expect(after).toEqual({ a: { ms: 10_000, reviewed: 2, correct: 1 }, b: { ms: 1000, reviewed: 1, correct: 1 } })
  })

  it('totals every deck, or one deck’s share of mixed sessions', () => {
    const runs = [run('1', { a: { ms: 60_000, reviewed: 4, correct: 3 }, b: { ms: 30_000, reviewed: 2, correct: 2 } }), run('2', { b: { ms: 120_000, reviewed: 6, correct: 3 } })]
    expect(practiceTotals(runs)).toEqual({ sessions: 2, ms: 210_000, reviewed: 12, correct: 8, last: 2000 })
    expect(practiceTotals(runs, 'b')).toEqual({ sessions: 2, ms: 150_000, reviewed: 8, correct: 5, last: 2000 })
    expect(practiceTotals(runs, 'a').last).toBe(1000)
    expect(practiceTotals(runs, 'gone')).toEqual({ sessions: 0, ms: 0, reviewed: 0, correct: 0, last: 0 })
    expect(runPart(runs[1], 'a')).toBeUndefined()
    expect(totalsByDeck(runs).map(([id, t]) => [id, t.sessions])).toEqual([
      ['b', 2],
      ['a', 1],
    ])
  })

  it('formats time and the share correct', () => {
    expect(formatPracticeTime(45_000)).toBe('45 s')
    expect(formatPracticeTime(12 * 60_000)).toBe('12 min')
    expect(formatPracticeTime(65 * 60_000)).toBe('1 h 05 min')
    expect(percentCorrect({ reviewed: 6, correct: 5 })).toBe('83%')
    expect(percentCorrect({ reviewed: 0, correct: 0 })).toBe('')
  })

  it('says when a deck was last practised', () => {
    const now = new Date(2026, 10, 3, 15, 0).getTime()
    expect(formatLastPractised(0, now)).toBe('Never')
    expect(formatLastPractised(new Date(2026, 10, 3, 8, 0).getTime(), now)).toBe('Today')
    expect(formatLastPractised(new Date(2026, 10, 2, 23, 0).getTime(), now)).toBe('Yesterday')
    expect(formatLastPractised(new Date(2026, 9, 28, 12, 0).getTime(), now)).toBe('28 Oct')
  })
})
