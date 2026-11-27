import { describe, expect, it } from 'vitest'
import { menuIds, phoneTabIds, PHONE_TAB_IDS } from './nav'

const ALL = ['today', 'timer', 'flashcards', 'grammar', 'stories', 'questions', 'docs', 'history', 'board']
const without = (...ids: string[]) => ALL.filter((id) => !ids.includes(id))

describe('phoneTabIds', () => {
  it('is Today, Cards, Stories, Timer in that order', () => {
    expect(phoneTabIds(ALL)).toEqual(['today', 'flashcards', 'stories', 'timer'])
    expect([...PHONE_TAB_IDS]).toEqual(['today', 'flashcards', 'stories', 'timer'])
  })
  it('leaves a turned-off page out without replacing it', () => {
    expect(phoneTabIds(without('stories'))).toEqual(['today', 'flashcards', 'timer'])
  })
})

describe('menuIds', () => {
  it('lists every other enabled page, in order', () => {
    expect(menuIds(ALL)).toEqual(['grammar', 'questions', 'docs', 'history', 'board'])
  })
  it('leaves out a turned-off page and never lists a tab', () => {
    const list = menuIds(without('stories', 'grammar'))
    expect(list).not.toContain('grammar')
    expect(list).not.toContain('stories')
    expect(list).toContain('board')
  })
})
