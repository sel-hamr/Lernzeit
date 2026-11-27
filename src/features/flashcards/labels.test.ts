import { describe, expect, it } from 'vitest'
import { deckButtonLabel, roundProgress } from './labels'

const tabs = [
  { value: 'all', label: 'All', count: 898 },
  { value: 'd1', label: 'Goethe A1 Wortliste', count: 52 },
  { value: 'd2', label: 'Food', count: 0 },
]

describe('deckButtonLabel', () => {
  it('reads "All decks" and the total on All', () => {
    expect(deckButtonLabel(tabs, 'all')).toEqual({ name: 'All decks', count: 898, text: 'All decks · 898' })
  })
  it('names the open deck and its cards', () => {
    expect(deckButtonLabel(tabs, 'd1')).toEqual({ name: 'Goethe A1 Wortliste', count: 52, text: 'Goethe A1 Wortliste · 52' })
    expect(deckButtonLabel(tabs, 'd2').text).toBe('Food · 0')
  })
  it('falls back to the first tab for an unknown deck', () => {
    expect(deckButtonLabel(tabs, 'gone').text).toBe('All decks · 898')
  })
  it('reads "All decks · 0" with no tabs', () => {
    expect(deckButtonLabel([], 'all').text).toBe('All decks · 0')
  })
})

describe('roundProgress', () => {
  it('counts the cards rated and the cards left', () => {
    expect(roundProgress(0, 1159)).toBe('0 done · 1159 left')
    expect(roundProgress(12, 1147)).toBe('12 done · 1147 left')
  })
  it('holds "left" steady when a rated card comes back in the round', () => {
    // Good on a practice round requeues the card: one more done, the same left.
    expect(roundProgress(1, 1159)).toBe('1 done · 1159 left')
  })
})
