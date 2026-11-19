import { describe, expect, it } from 'vitest'
import { capList, filterByLabel, fitTabs } from './tabs'

describe('fitTabs', () => {
  const widths = [50, 100, 100, 100, 100]

  it('shows every tab when they all fit', () => {
    expect(fitTabs(widths, 450, 80)).toEqual([0, 1, 2, 3, 4])
    expect(fitTabs(widths, 458, 80, -1, 2)).toEqual([0, 1, 2, 3, 4])
  })

  it('keeps the tabs that fit beside the More button', () => {
    // 50 + 100 + 100 + 80 fits in 330, a third deck does not.
    expect(fitTabs(widths, 330, 80)).toEqual([0, 1, 2])
    expect(fitTabs(widths, 449, 80)).toEqual([0, 1, 2, 3])
    // The gaps count too.
    expect(fitTabs(widths, 330, 80, -1, 2)).toEqual([0, 1])
  })

  it('swaps the selected tab in for the last ones that fit', () => {
    expect(fitTabs(widths, 330, 80, 4)).toEqual([0, 1, 4])
    expect(fitTabs([50, 100, 100, 40, 200], 330, 80, 4)).toEqual([0, 4])
    expect(fitTabs(widths, 330, 80, 2)).toEqual([0, 1, 2])
  })

  it('never moves out the first tab or the selected one', () => {
    expect(fitTabs(widths, 60, 80)).toEqual([0])
    expect(fitTabs(widths, 60, 80, 3)).toEqual([0, 3])
    expect(fitTabs(widths, 60, 80, 0)).toEqual([0])
  })
})

describe('filterByLabel', () => {
  const decks = [
    { label: 'Verbs – Shopping & Money' },
    { label: 'Adjectives – Size, Shape & Amount' },
    { label: 'Shopping' },
    { label: 'Straße & Stadt' },
    { label: 'Café' },
  ]
  const labels = (query: string) => filterByLabel(decks, query).map((d) => d.label)

  it('keeps every item, in order, for an empty query', () => {
    expect(labels('')).toEqual(decks.map((d) => d.label))
    expect(labels('   ')).toEqual(decks.map((d) => d.label))
  })

  it('ignores case, accents and ß', () => {
    expect(labels('CAFE')).toEqual(['Café'])
    expect(labels('strasse')).toEqual(['Straße & Stadt'])
  })

  it('needs every word of the query, in any order', () => {
    expect(labels('money verbs')).toEqual(['Verbs – Shopping & Money'])
    expect(labels('verbs size')).toEqual([])
  })

  it('ranks labels that start with the query, then word starts, then the rest', () => {
    // "Shopping" starts with "sh"; the other two only have a word that does.
    expect(labels('sh')).toEqual(['Shopping', 'Verbs – Shopping & Money', 'Adjectives – Size, Shape & Amount'])
    // Inside a word only: kept, in order.
    expect(labels('hop')).toEqual(['Verbs – Shopping & Money', 'Shopping'])
  })
})

describe('capList', () => {
  it('shows a short list whole, also one item over the limit', () => {
    expect(capList(3, 5)).toEqual([0, 1, 2])
    expect(capList(6, 5)).toEqual([0, 1, 2, 3, 4, 5])
    expect(capList(0, 5)).toEqual([])
  })

  it('keeps the first items of a longer list', () => {
    expect(capList(14, 5)).toEqual([0, 1, 2, 3, 4])
    expect(capList(14, 5, 2)).toEqual([0, 1, 2, 3, 4])
  })

  it('swaps a selected item further down in for the last one', () => {
    expect(capList(14, 5, 11)).toEqual([0, 1, 2, 3, 11])
  })
})
