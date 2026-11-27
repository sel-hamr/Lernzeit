import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Dialog } from './Dialog'

describe('Dialog', () => {
  it('is named by its title', () => {
    const html = renderToStaticMarkup(createElement(Dialog, { open: true, onClose: () => {}, title: 'Menu' }))
    const labelledBy = /<dialog[^>]*aria-labelledby="([^"]+)"/.exec(html)?.[1]
    expect(labelledBy).toBeTruthy()
    expect(html).toContain(`<h2 id="${labelledBy}"`)
  })
})
