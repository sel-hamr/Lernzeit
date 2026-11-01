import { describe, expect, it } from 'vitest'
import { fitTabs } from './tabs'

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
