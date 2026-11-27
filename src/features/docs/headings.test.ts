import { describe, expect, it } from 'vitest'
import { docHeadings } from './headings'

describe('headings', () => {
  it('lists headings for the contents, without a lone top heading', () => {
    expect(docHeadings('# Title\n\n## One\n\n### Two\n\n#### Too deep')).toEqual([
      { level: 2, text: 'One', id: 'one' },
      { level: 3, text: 'Two', id: 'two' },
    ])
  })

  it('keeps several top headings', () => {
    expect(docHeadings('# A\n\n# B').map((h) => h.text)).toEqual(['A', 'B'])
  })

  it('gives repeated headings their own ids, and keeps other alphabets', () => {
    expect(docHeadings('## Setup\n\n## Setup\n\n## Über uns\n\n## مرحبا بكم').map((h) => h.id)).toEqual(['setup', 'setup-1', 'über-uns', 'مرحبا-بكم'])
  })

  it('reads headings with inline code, and skips code blocks', () => {
    expect(docHeadings('## Use `npm` now\n\n```md\n## Not a heading\n```').map((h) => h.text)).toEqual(['Use npm now'])
  })
})
