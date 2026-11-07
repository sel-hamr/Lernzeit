import { describe, expect, it } from 'vitest'
import { placeNote } from './notePosition'

const screen = { width: 1200, height: 800 }
const box = { width: 340, height: 300 }
const word = (left: number, top: number) => ({ left, right: left + 60, top, bottom: top + 24 })

describe('placeNote', () => {
  it('sits above the word, centred on it', () => {
    expect(placeNote(word(500, 500), box, screen)).toMatchObject({ left: 360, top: 192, maxHeight: 480 })
  })

  it('goes below a word near the top of the window', () => {
    expect(placeNote(word(500, 100), box, screen).top).toBe(132)
  })

  it('stays above when the box is too tall for both sides but there is more room above', () => {
    expect(placeNote(word(500, 600), { width: 340, height: 700 }, screen)).toMatchObject({ left: 360, top: 12, maxHeight: 580 })
  })

  it('keeps inside the window', () => {
    expect(placeNote(word(4, 500), box, screen).left).toBe(12)
    expect(placeNote(word(1130, 500), box, screen).left).toBe(848)
  })

  it('stays clear of the sidebar', () => {
    expect(placeNote(word(280, 500), box, { ...screen, left: 240 }).left).toBe(252)
  })

  it('leaves the box room on a very short window', () => {
    expect(placeNote(word(500, 40), box, { width: 1200, height: 120 }).maxHeight).toBe(160)
  })

  it('fits a phone', () => {
    expect(placeNote(word(150, 500), { width: 351, height: 300 }, { width: 375, height: 812 }).left).toBe(12)
  })

  it('grows out of the word, wherever the box ends up', () => {
    expect(placeNote(word(500, 500), box, screen)).toMatchObject({ originX: 170, originY: 308 })
    expect(placeNote(word(500, 100), box, screen)).toMatchObject({ originX: 170, originY: -8 })
    // Pushed against the window's edge, the box still grows from the word, not from its own middle.
    expect(placeNote(word(4, 500), box, screen).originX).toBe(22)
  })
})
