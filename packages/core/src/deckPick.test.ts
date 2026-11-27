import { describe, expect, it } from 'vitest'
import { parseDeckIds, toggleId } from './deckPick'

describe('parseDeckIds', () => {
  it('reads a saved list', () => {
    expect(parseDeckIds('["a","b"]')).toEqual(['a', 'b'])
    expect(parseDeckIds('[]')).toEqual([])
  })

  it('reads nothing saved, and the older "all", as every deck', () => {
    expect(parseDeckIds(null)).toEqual([])
    expect(parseDeckIds('')).toEqual([])
    expect(parseDeckIds('all')).toEqual([])
  })

  it('reads an older single deck id as a list of one', () => {
    expect(parseDeckIds('deck-1')).toEqual(['deck-1'])
  })

  it('drops what is not a deck id', () => {
    expect(parseDeckIds('["a",3,null,"b"]')).toEqual(['a', 'b'])
    expect(parseDeckIds('{"a":1}')).toEqual(['{"a":1}'])
  })
})

describe('toggleId', () => {
  it('adds an id at the end and takes it out again', () => {
    expect(toggleId(['a'], 'b')).toEqual(['a', 'b'])
    expect(toggleId(['a', 'b'], 'a')).toEqual(['b'])
    expect(toggleId([], 'a')).toEqual(['a'])
  })
})
