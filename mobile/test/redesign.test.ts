import type { Deck } from '@lernzeit/core/types'
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
