import { markExample } from '../src/practice/example'
import { flyDuration, leanFor, MAX_TILT, ratingHaptic, tiltFor } from '../src/practice/swipe'
import { positionLabel, practiceTime, roundSummary, sideCounts } from '../src/practice/summary'

const t = { x: 120, y: 110 }

describe('the swipe', () => {
  it('tilts with the drag, up to 12 degrees either way', () => {
    expect(tiltFor(0, 400)).toBe(0)
    expect(tiltFor(100, 400)).toBeCloseTo(6)
    expect(tiltFor(-100, 400)).toBeCloseTo(-6)
    expect(tiltFor(900, 400)).toBe(MAX_TILT)
    expect(tiltFor(-900, 400)).toBe(-MAX_TILT)
    expect(tiltFor(50, 0)).toBe(0)
  })

  it('leans toward one rating at a time, full at the threshold', () => {
    expect(leanFor(60, 0, t)).toEqual({ good: 0.5, again: 0, easy: 0 })
    expect(leanFor(-240, 10, t)).toEqual({ good: 0, again: 1, easy: 0 })
    expect(leanFor(20, -55, t)).toEqual({ good: 0, again: 0, easy: 0.5 })
    expect(leanFor(0, 80, t)).toEqual({ good: 0, again: 0, easy: 0 })
  })

  it('flies faster after a harder fling, within bounds', () => {
    expect(flyDuration(600, 0)).toBe(260)
    expect(flyDuration(600, 6000)).toBe(140)
    expect(flyDuration(600, 4000)).toBe(150)
    expect(flyDuration(-600, -4000)).toBe(150)
  })

  it('buzzes a warning for Again and a light tap for Good and Easy', () => {
    expect(ratingHaptic(1)).toBe('warning')
    expect(ratingHaptic(2)).toBe('select')
    expect(ratingHaptic(3)).toBe('tap')
    expect(ratingHaptic(4)).toBe('tap')
  })
})

describe('the round numbers', () => {
  it('counts Again on the left and Good or Easy on the right', () => {
    expect(sideCounts({})).toEqual({ again: 0, good: 0 })
    expect(sideCounts({ a: 1, b: 2, c: 3, d: 4, e: 1 })).toEqual({ again: 2, good: 2 })
  })

  it('shows the card being practised out of the round', () => {
    expect(positionLabel(0, 40)).toBe('1 / 40')
    expect(positionLabel(11, 29)).toBe('12 / 40')
    expect(positionLabel(40, 0)).toBe('40 / 40')
    expect(positionLabel(0, 0)).toBe('0 / 0')
  })

  it('says the time in seconds under a minute, then minutes', () => {
    expect(practiceTime(0)).toBe('0 s')
    expect(practiceTime(45_400)).toBe('45 s')
    expect(practiceTime(4 * 60_000 + 20_000)).toBe('4 min')
    expect(practiceTime(65 * 60_000)).toBe('1:05 h')
  })

  it('splits the ring by rating and leaves empty ratings out', () => {
    const s = roundSummary({ a: 1, b: 3, c: 3, d: 4 })
    expect(s.total).toBe(4)
    expect(s.segments.map((x) => [x.grade, x.count, x.start, x.size])).toEqual([
      [1, 1, 0, 0.25],
      [3, 2, 0.25, 0.5],
      [4, 1, 0.75, 0.25],
    ])
    expect(s.share).toBe(0.75)
  })

  it('picks a headline from how the round went', () => {
    expect(roundSummary({}).headline).toBe('Round done')
    expect(roundSummary({ a: 3, b: 4 }).headline).toBe('Perfect round')
    expect(roundSummary({ a: 3, b: 4, c: 3, d: 3, e: 2 }).headline).toBe('Great work')
    expect(roundSummary({ a: 3, b: 1 }).headline).toBe('Nice going')
    expect(roundSummary({ a: 1, b: 1, c: 3 }).headline).toBe('Good practice')
  })
})

describe('the example sentence', () => {
  const hits = (s: string, card: { german: string; plural?: string }) =>
    markExample(s, card)
      .filter((p) => p.hit)
      .map((p) => p.text)

  it('marks the noun and its forms, not its article', () => {
    expect(hits('Der Hund bellt. Die Hunde spielen.', { german: 'Hund', plural: 'die Hunde' })).toEqual(['Hund', 'Hunde'])
  })

  it('marks a verb in another person', () => {
    expect(hits('Er geht nach Hause.', { german: 'gehen' })).toEqual(['geht'])
    expect(hits('Ich spiele gern.', { german: 'spielen' })).toEqual(['spiele'])
  })

  it('keeps every character and leaves an unrelated sentence unmarked', () => {
    const s = 'Wir essen Äpfel, oder?'
    expect(markExample(s, { german: 'Apfel', plural: 'Äpfel' }).map((p) => p.text).join('')).toBe(s)
    expect(hits('Das ist gut.', { german: 'Katze' })).toEqual([])
  })
})
