import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DeckTabs } from './DeckTabs'

const tabs = [
  { value: 'all', label: 'All', count: 898 },
  { value: 'd1', label: 'Goethe A1 Wortliste', count: 52 },
]
const render = (value: string) => renderToStaticMarkup(createElement(DeckTabs, { tabs, value, onChange: () => {} }))

describe('DeckTabs', () => {
  it('gives phones one button with the open deck and its cards', () => {
    const html = render('d1')
    expect(html).toMatch(/<button[^>]*aria-label="Deck: Goethe A1 Wortliste · 52"[^>]*class="[^"]*md:hidden/)
    expect(render('all')).toContain('aria-label="Deck: All decks · 898"')
  })
  it('keeps the pill tabs for desktop only', () => {
    expect(render('all')).toMatch(/role="tablist"[^>]*class="hidden [^"]*md:flex/)
  })
})
