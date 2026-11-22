import { describe, expect, it } from 'vitest'
import { deckButtonLabel, roundPosition } from './labels'

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

describe('roundPosition', () => {
  it('counts the card on screen as the next one', () => {
    expect(roundPosition(0, 1159)).toBe('1 / 1159')
    expect(roundPosition(11, 1148)).toBe('12 / 1159')
  })
  it('is the last card when one is left', () => {
    expect(roundPosition(9, 1)).toBe('10 / 10')
  })
  it('never counts past the total', () => {
    expect(roundPosition(5, 0)).toBe('5 / 5')
  })
})
