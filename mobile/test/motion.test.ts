import { describe, expect, it } from '@jest/globals'
import { pillStart, tabCenter, tabWeight } from '../src/components/BottomBar'
import { stackAnimation, tabSceneOptions } from '../src/motion/transitions'
import { isFirstSync } from '../src/sync/status'

describe('stack transitions', () => {
  it('slides pages in from the right', () => {
    expect(stackAnimation('settings', false)).toBe('ios_from_right')
    expect(stackAnimation('card/[id]', false)).toBe('ios_from_right')
    expect(stackAnimation('more/[id]', false)).toBe('ios_from_right')
  })

  it('raises practice and the editors from the bottom', () => {
    for (const route of ['practice', 'card/edit', 'grammar/practice', 'questions/practice', 'story/edit', 'doc/edit', 'import-csv']) expect(stackAnimation(route, false)).toBe('slide_from_bottom')
  })

  it('fades search and the sign-in switch', () => {
    expect(stackAnimation('search', false)).toBe('fade')
    expect(stackAnimation('sign-in', false)).toBe('fade')
    expect(stackAnimation('(tabs)', false)).toBe('fade')
  })

  it('fades everything with "remove animations" on', () => {
    for (const route of ['settings', 'practice', 'search']) expect(stackAnimation(route, true)).toBe('fade')
  })
})

describe('tab page transitions', () => {
  it('shifts and fades, or only fades with reduce motion', () => {
    expect(tabSceneOptions(false)).toMatchObject({ animation: 'shift', transitionSpec: { animation: 'timing' } })
    expect(tabSceneOptions(false).sceneStyleInterpolator).toBeInstanceOf(Function)
    expect(tabSceneOptions(true)).toMatchObject({ animation: 'fade' })
    expect('sceneStyleInterpolator' in tabSceneOptions(true)).toBe(false)
  })
})

describe('tab bar geometry', () => {
  it('puts each tab face in the middle of its slot at rest', () => {
    // Four tabs, the second active: widths 1, 2, 1, 1.
    expect([0, 1, 2, 3].map((j) => tabCenter(j, 1))).toEqual([0.5, 2, 3.5, 4.5])
    // The active tab's middle is the pill's middle.
    expect(tabCenter(1, 1)).toBe(pillStart(4, 1) + 1)
  })

  it('moves the faces smoothly while the pill slides', () => {
    const mid = tabCenter(2, 1.5)
    // Tab 2 moves left (3.5 to 3) as it grows into the active one.
    expect(mid).toBeLessThan(tabCenter(2, 1))
    expect(mid).toBeGreaterThan(tabCenter(2, 2))
    // The weights still add up, so the menu slot never moves.
    expect([0, 1, 2, 3].reduce((sum, j) => sum + tabWeight(j, 1.5), 0)).toBeCloseTo(5)
  })
})

describe('first sync', () => {
  it('is on only while a phone that never synced is syncing', () => {
    expect(isFirstSync({ state: 'syncing' })).toBe(true)
    expect(isFirstSync({ state: 'syncing', lastSyncedAt: 1 })).toBe(false)
    expect(isFirstSync({ state: 'idle' })).toBe(false)
    expect(isFirstSync({ state: 'offline' })).toBe(false)
    expect(isFirstSync({ state: 'error' })).toBe(false)
  })
})
