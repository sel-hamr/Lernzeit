import { describe, expect, it } from 'vitest'
import { PLUGINS } from '@/app/plugins'
import { menuItems, phoneTabs } from './nav'

const without = (...ids: string[]) => PLUGINS.filter((p) => !ids.includes(p.id))
const ids = (list: { id: string }[]) => list.map((p) => p.id)

describe('phoneTabs', () => {
  it('is Today, Cards, Stories, Timer in that order', () => {
    expect(ids(phoneTabs(PLUGINS))).toEqual(['today', 'flashcards', 'stories', 'timer'])
  })
  it('leaves a turned-off feature out without replacing it', () => {
    expect(ids(phoneTabs(without('stories')))).toEqual(['today', 'flashcards', 'timer'])
  })
})

describe('menuItems', () => {
  it('lists every other enabled page', () => {
    expect(ids(menuItems(PLUGINS))).toEqual(['grammar', 'questions', 'docs', 'history', 'board'])
  })
  it('does not list a turned-off tab or page', () => {
    const list = ids(menuItems(without('stories', 'grammar')))
    expect(list).not.toContain('stories')
    expect(list).not.toContain('grammar')
    expect(list).toContain('board')
  })
})
