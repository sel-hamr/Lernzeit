import { describe, expect, it } from 'vitest'
import { isSafeToReload, type ReloadContext } from './updates'

const base: ReloadContext = { pathname: '/', focusedTag: 'BODY', focusedEditable: false, dialogOpen: false }

describe('isSafeToReload', () => {
  it('allows a reload on an ordinary page', () => {
    expect(isSafeToReload(base)).toBe(true)
    expect(isSafeToReload({ ...base, pathname: '/flashcards', focusedTag: 'BUTTON' })).toBe(true)
  })
  it('waits during practice sessions', () => {
    expect(isSafeToReload({ ...base, pathname: '/flashcards/review' })).toBe(false)
    expect(isSafeToReload({ ...base, pathname: '/questions/practice' })).toBe(false)
    expect(isSafeToReload({ ...base, pathname: '/grammar/review' })).toBe(false)
    expect(isSafeToReload({ ...base, pathname: '/grammar/akkusativ/practice' })).toBe(false)
  })
  it('waits while a text field has focus', () => {
    expect(isSafeToReload({ ...base, focusedTag: 'INPUT' })).toBe(false)
    expect(isSafeToReload({ ...base, focusedTag: 'textarea' })).toBe(false)
    expect(isSafeToReload({ ...base, focusedTag: 'DIV', focusedEditable: true })).toBe(false)
  })
  it('waits while a dialog is open', () => {
    expect(isSafeToReload({ ...base, dialogOpen: true })).toBe(false)
  })
})
