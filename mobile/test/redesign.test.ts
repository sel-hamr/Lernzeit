import type { Card, Deck } from '@lernzeit/core/types'
import { cardMatches } from '../src/cards/search'
import { sessionsByDay } from '../src/history/sessionsByDay'
import { ringProgress } from '../src/timer/ring'
import { pillStart, tabWeight } from '../src/components/BottomBar'
import { flyTarget, ratingForSwipe } from '../src/practice/swipe'
import { deckCarousel } from '../src/today/decks'
import { greeting, hourIn } from '../src/today/greeting'
import { heroLine, lastPractisedByDeck, practisedLabel, weekStrip } from '../src/today/hero'
import { flowUnits } from '../src/stories/flow'
import { tabBarHeight } from '../src/components/BottomBar'
import type { Piece } from '@lernzeit/core/reader'
import type { Session, Topic } from '@lernzeit/core/types'

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
      ['d', 1, 'card'],
      ['a', 0, 'card'],
      ['c', 0, 'card'],
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

describe('the week strip', () => {
  const goals = { mon: 60, tue: 60, wed: 60, thu: 60, fri: 60, sat: 0, sun: 0 }
  const topic = (id: string, archived = false) => ({ id, name: id, goalMinutes: goals, goalHistory: [], archived, order: 0, createdAt: Date.UTC(2026, 0, 1) }) as unknown as Topic
  const session = (date: string, minutes: number, topicId = 'de') => ({ id: `${date}${topicId}`, topicId, date, minutes, start: 0, end: 0, source: 'timer' }) as unknown as Session

  it('has Monday to Sunday with minutes against each day’s goal, scaled to the busiest day', () => {
    // Thursday 19 November 2026.
    const bars = weekStrip([topic('de'), topic('old', true)], [session('2026-11-16', 90), session('2026-11-17', 30), session('2026-11-17', 500, 'old'), session('2026-11-09', 40)], '2026-11-19', 15)
    expect(bars.map((b) => b.letter).join('')).toBe('MTWTFSS')
    expect(bars.map((b) => b.minutes)).toEqual([90, 530, 0, 15, 0, 0, 0])
    expect(bars.map((b) => b.goal)).toEqual([60, 60, 60, 60, 60, 0, 0])
    expect(bars[0]).toMatchObject({ hit: true, today: false, future: false, short: 'Mon' })
    expect(bars[1]!.fill).toBe(1)
    expect(bars[0]!.fill).toBeCloseTo(90 / 530)
    expect(bars[3]).toMatchObject({ today: true, hit: false })
    expect(bars[4]).toMatchObject({ future: true })
    expect(bars[5]!.goalAt).toBe(0)
  })

  it('keeps an empty week at zero without dividing by zero', () => {
    const bars = weekStrip([], [], '2026-11-19')
    expect(bars.every((b) => b.fill === 0 && b.goalAt === 0)).toBe(true)
  })
})

describe('the Today hero line', () => {
  it('says something kind under the hero number', () => {
    expect(heroLine(0, 0, 0)).toBe('A free day. Enjoy it')
    expect(heroLine(20, 0, 0)).toBe('No goal today, so every minute is a bonus')
    expect(heroLine(0, 120, 120)).toBe('A fresh day. Ten minutes is a good start')
    expect(heroLine(30, 120, 90)).toBe('1:30 h left, keep it going')
    expect(heroLine(70, 120, 50)).toBe('0:50 h left, more than halfway there')
    expect(heroLine(120, 120, 0)).toBe('Every goal reached. Great work')
  })
})

describe('when a deck was last practised', () => {
  it('takes the newest day per deck from the practice log', () => {
    const last = lastPractisedByDeck([
      { day: '2026-11-10', decks: { a: { ms: 1, reviewed: 1, correct: 1 } } },
      { day: '2026-11-18', decks: { a: { ms: 1, reviewed: 1, correct: 1 }, b: { ms: 1, reviewed: 1, correct: 0 } } },
      { day: '2026-11-12', decks: { b: { ms: 1, reviewed: 1, correct: 1 } } },
    ])
    expect(Object.fromEntries(last)).toEqual({ a: '2026-11-18', b: '2026-11-18' })
  })

  it('says it in words', () => {
    expect(practisedLabel(undefined, '2026-11-19')).toBe('Not practised yet')
    expect(practisedLabel('2026-11-19', '2026-11-19')).toBe('Practised today')
    expect(practisedLabel('2026-11-18', '2026-11-19')).toBe('Practised yesterday')
    expect(practisedLabel('2026-11-15', '2026-11-19')).toBe('Practised 4 days ago')
    expect(practisedLabel('2026-11-10', '2026-11-19')).toBe('Practised last week')
    expect(practisedLabel('2026-10-20', '2026-11-19')).toBe('Practised 4 weeks ago')
  })
})

describe('the reader word flow', () => {
  const piece = (text: string, start: number, words = 1): Piece => ({ text, start, words, cardIds: [] })
  it('keeps punctuation on its word and breaks only at spaces', () => {
    // "Es regnet. „Ja“, zu Hause!"
    const units = flowUnits([piece('Es', 0), piece(' ', 2, 0), piece('regnet', 3), piece('. „', 9, 0), piece('Ja', 12), piece('“, ', 14, 0), piece('zu Hause', 17, 2), piece('!', 25, 0)])
    expect(units.map((u) => [u.pieces.map((p) => p.text).join('|'), u.space])).toEqual([
      ['Es', true],
      ['regnet|.', true],
      ['„|Ja|“,', true],
      ['zu Hause|!', false],
    ])
    expect(units[2]!.pieces[0]).toMatchObject({ text: '„', start: 11, words: 0 })
    expect(units[1]!.key).toBe(3)
  })

  it('handles a paragraph that starts with a space or punctuation', () => {
    expect(flowUnits([piece(' ', 0, 0), piece('Hallo', 1)]).map((u) => u.pieces.length)).toEqual([1])
    expect(flowUnits([])).toEqual([])
  })
})

describe('the floating tab bar', () => {
  it('reaches over the safe area, with at least 8 px under it', () => {
    expect(tabBarHeight(0)).toBe(64 + 4 + 8 + 4)
    expect(tabBarHeight(24)).toBe(64 + 4 + 24 + 4)
  })
})
