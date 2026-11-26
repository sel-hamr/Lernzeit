import type { Card, Deck } from '@lernzeit/core/types'
import { cardMatches } from '../src/cards/search'
import { sessionsByDay } from '../src/history/sessionsByDay'
import { ringProgress } from '../src/timer/ring'
import { pillStart, tabWeight } from '../src/components/BottomBar'
import { flyTarget, ratingForSwipe } from '../src/practice/swipe'
import { deckCarousel } from '../src/today/decks'
import { greeting, hourIn } from '../src/today/greeting'

describe('greeting', () => {
  it('says Guten Morgen, Tag or Abend by the hour', () => {
    expect(greeting(5)).toBe('Guten Morgen')
    expect(greeting(10)).toBe('Guten Morgen')
    expect(greeting(11)).toBe('Guten Tag')
    expect(greeting(17)).toBe('Guten Tag')
    expect(greeting(18)).toBe('Guten Abend')
    expect(greeting(23)).toBe('Guten Abend')
    expect(greeting(0)).toBe('Guten Abend')
    expect(greeting(4)).toBe('Guten Abend')
  })

  it('adds the first name when there is one, and nothing otherwise', () => {
    expect(greeting(9, 'Sami El')).toBe('Guten Morgen, Sami')
    expect(greeting(9, '  ')).toBe('Guten Morgen')
    expect(greeting(9)).toBe('Guten Morgen')
  })

  it('reads the hour in the synced zone', () => {
    // 11:00 UTC is 12:00 in Berlin in November and 06:00 in New York.
    const at = Date.UTC(2026, 10, 19, 11, 0)
    expect(hourIn(at, 'Europe/Berlin')).toBe(12)
    expect(hourIn(at, 'America/New_York')).toBe(6)
    expect(hourIn(at, 'Not/AZone')).toBe(new Date(at).getHours())
  })
})

describe('the deck carousel', () => {
  const deck = (id: string, order: number): Deck => ({ id, name: id, order }) as Deck
  it('keeps the decks in order, those with cards first, with counts and colours', () => {
    const decks = [deck('c', 2), deck('a', 0), deck('b', 1), deck('d', 3)]
    const cards = [{ deckId: 'b' }, { deckId: 'b' }, { deckId: 'd' }, { deckId: 'gone' }]
    expect(deckCarousel(decks, cards).map((d) => [d.deck.id, d.count, d.tone])).toEqual([
      ['b', 2, 'accent'],
      ['d', 1, 'inverse'],
      ['a', 0, 'card'],
      ['c', 0, 'accent'],
    ])
  })

  it('shows at most the limit', () => {
    const decks = Array.from({ length: 14 }, (_, i) => deck(`d${i}`, i))
    expect(deckCarousel(decks, [], 10)).toHaveLength(10)
    expect(deckCarousel([], [])).toEqual([])
  })
})

describe('swiping a card', () => {
  const t = { x: 100, y: 110 }
  it('rates right Good, left Again and up Easy past the thresholds', () => {
    expect(ratingForSwipe(140, 10, t)).toBe(3)
    expect(ratingForSwipe(-140, -20, t)).toBe(1)
    expect(ratingForSwipe(20, -150, t)).toBe(4)
  })

  it('rates nothing short of a threshold, or downwards', () => {
    expect(ratingForSwipe(90, 0, t)).toBeNull()
    expect(ratingForSwipe(-60, -100, t)).toBeNull()
    expect(ratingForSwipe(0, 300, t)).toBeNull()
    expect(ratingForSwipe(120, 200, t)).toBeNull()
  })

  it('takes the stronger direction on a diagonal', () => {
    expect(ratingForSwipe(160, -130, t)).toBe(3)
    expect(ratingForSwipe(120, -150, t)).toBe(4)
  })

  it('flies a rated card off the way it was sent', () => {
    expect(flyTarget(3, 400, 800).x).toBeGreaterThan(400)
    expect(flyTarget(1, 400, 800).x).toBeLessThan(-400)
    expect(flyTarget(4, 400, 800).y).toBeLessThan(-800)
    expect(flyTarget(2, 400, 800).y).toBeGreaterThan(800)
  })
})

describe('the tab bar pill', () => {
  it('makes the active tab twice as wide and slides between tabs', () => {
    expect([0, 1, 2, 3].map((j) => tabWeight(j, 1))).toEqual([1, 2, 1, 1])
    expect([0, 1, 2, 3].reduce((sum, j) => sum + tabWeight(j, 1.5), 0)).toBeCloseTo(5)
    expect(pillStart(4, 0)).toBe(0)
    expect(pillStart(4, 2)).toBe(2)
    expect(pillStart(4, 3)).toBe(3)
    expect(pillStart(4, 1.5)).toBeGreaterThan(pillStart(4, 1))
    expect(pillStart(4, 1.5)).toBeLessThan(pillStart(4, 2))
  })
})

describe('the timer ring', () => {
  it('is empty before a start and fills with the phase, or once an hour when counting up', () => {
    expect(ringProgress(0, 25 * 60_000, false)).toBe(0)
    expect(ringProgress(5 * 60_000, 20 * 60_000, true)).toBeCloseTo(0.2)
    expect(ringProgress(25 * 60_000, 0, true)).toBe(1)
    expect(ringProgress(90 * 60_000, undefined, true)).toBeCloseTo(0.5)
    expect(ringProgress(0, 0, true)).toBe(0)
  })
})

describe('sessions by day', () => {
  const session = (id: string, date: string, start: number, minutes = 30) => ({ id, topicId: 't', date, start, end: start + minutes * 60_000, minutes, source: 'timer' as const })
  it('groups the week’s sessions by day, newest day and latest session first, with the day’s minutes', () => {
    const days = ['2026-11-23', '2026-11-24', '2026-11-25']
    const grouped = sessionsByDay([session('a', '2026-11-23', 1), session('b', '2026-11-25', 5, 20), session('c', '2026-11-25', 9, 15), session('x', '2026-11-30', 3)], days)
    expect(grouped.map((g) => [g.day, g.minutes, g.sessions.map((s) => s.id)])).toEqual([
      ['2026-11-25', 35, ['c', 'b']],
      ['2026-11-23', 30, ['a']],
    ])
    expect(sessionsByDay([], days)).toEqual([])
  })
})

describe('card search', () => {
  const card = { id: 'c', deckId: 'd', type: 'word', german: 'Hund', gender: 'der', english: 'dog', tags: ['animals'], createdAt: 1 } as unknown as Card
  it('matches the German with its article, the English and the tags, ignoring case', () => {
    expect(cardMatches(card, 'HUND')).toBe(true)
    expect(cardMatches(card, 'der hu')).toBe(true)
    expect(cardMatches(card, 'Dog')).toBe(true)
    expect(cardMatches(card, 'anim')).toBe(true)
    expect(cardMatches(card, 'cat')).toBe(false)
    expect(cardMatches(card, '  ')).toBe(true)
  })
})
