import { describe, expect, it } from 'vitest'
import type { Doc, DocFolder } from '@/db/types'
import { docHeadings } from '@/features/docs/headings'
import { DOC_ROOT, docDateLabel, docExcerpt, docImageId, docImageIds, filterDocs, opensWithTitle, firstHeading, folderChoices, folderPath, folderSubtree, parseTags, titleFromMarkdown } from './docs'

const folder = (id: string, name: string, parentId = DOC_ROOT): DocFolder => ({ id, name, parentId, createdAt: 0, updatedAt: 0 })
const doc = (id: string, title: string, body = '', extra: Partial<Doc> = {}): Doc => ({
  id,
  title,
  body,
  folderId: DOC_ROOT,
  tags: [],
  status: 'toRead',
  pinned: false,
  createdAt: 0,
  updatedAt: 0,
  ...extra,
})

describe('titles', () => {
  it('uses the first heading, without its marks', () => {
    expect(firstHeading('intro\n\n# The **big** [guide](https://a.b) #\n\n# Other')).toBe('The big guide')
    expect(firstHeading('## Only a second level')).toBe('')
  })

  it('does not take a comment in a code block for a heading', () => {
    expect(firstHeading('```bash\n# install\n```\n\n# Real')).toBe('Real')
  })

  it('falls back to the first line of text', () => {
    expect(titleFromMarkdown('\n\n- A *list* item\nmore')).toBe('A list item')
    expect(titleFromMarkdown('## Second level')).toBe('Second level')
    expect(titleFromMarkdown('```\ncode')).toBe('code')
  })

  it('knows when the text opens with its title', () => {
    expect(opensWithTitle('\n# The **guide**\n\nText', 'The guide')).toBe(true)
    expect(opensWithTitle('# Other\n\nText', 'The guide')).toBe(false)
    expect(opensWithTitle('Intro\n\n# The guide', 'The guide')).toBe(false)
  })

  it('cuts a long line to the longest title', () => {
    expect(titleFromMarkdown('x'.repeat(500))).toHaveLength(200)
  })
})

describe('previews', () => {
  it('takes plain sentences and skips headings, code, tables and pictures', () => {
    const body = '# Title\n\n![pic](image:a)\n\n```\ncode\n```\n\n| a | b |\n\n- **First** [line](https://a.b)\n\nSecond line'
    expect(docExcerpt(body)).toBe('First line Second line')
  })

  it('cuts a long preview', () => {
    expect(docExcerpt('word '.repeat(100), 20)).toHaveLength(19)
  })

  it('says how long ago a doc changed', () => {
    const now = new Date(2026, 10, 7, 9).getTime()
    expect(docDateLabel(new Date(2026, 10, 7, 1).getTime(), now)).toBe('Today')
    expect(docDateLabel(new Date(2026, 10, 6, 23).getTime(), now)).toBe('Yesterday')
    expect(docDateLabel(new Date(2026, 10, 3, 12).getTime(), now)).toBe('4 days ago')
    expect(docDateLabel(new Date(2026, 9, 1).getTime(), now)).toMatch(/Oct/)
  })
})

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

describe('images', () => {
  it('finds the stored images of a text', () => {
    expect(docImageIds('![a](image:one) ![b](image:two-2) ![a](image:one) [c](https://x.y/image:three)')).toEqual(['one', 'two-2'])
  })

  it('accepts only a plain image id', () => {
    expect(docImageId('image:abc-1')).toBe('abc-1')
    expect(docImageId('image:../x')).toBeUndefined()
    expect(docImageId('javascript:alert(1)')).toBeUndefined()
    expect(docImageId(undefined)).toBeUndefined()
  })
})

describe('folders', () => {
  const folders = [folder('a', 'Recipes'), folder('b', 'Italian', 'a'), folder('c', 'Pasta', 'b'), folder('d', 'Work')]

  it('finds a folder with everything inside it', () => {
    expect([...folderSubtree(folders, 'a')].sort()).toEqual(['a', 'b', 'c'])
    expect([...folderSubtree(folders, 'd')]).toEqual(['d'])
  })

  it('writes the path of a folder', () => {
    expect(folderPath(folders, 'c')).toBe('Recipes / Italian / Pasta')
    expect(folderPath(folders, DOC_ROOT)).toBe('')
  })

  it('survives a loop in broken data', () => {
    expect(folderPath([folder('x', 'X', 'y'), folder('y', 'Y', 'x')], 'x')).toBe('Y / X')
  })

  it('does not offer a moving folder or its subfolders', () => {
    expect(folderChoices(folders, 'b').map((f) => f.path)).toEqual(['Recipes', 'Work'])
  })
})

describe('filterDocs', () => {
  const docs = [
    doc('1', 'Notes', 'All about cafe culture', { tags: ['travel'] }),
    doc('2', 'Café guide', 'Coffee', { status: 'read' }),
    doc('3', 'Other', 'Nothing', { tags: ['travel'], status: 'read' }),
  ]
  const ids = (filter: Parameters<typeof filterDocs>[1]) => filterDocs(docs, filter).map((d) => d.id)

  it('looks through titles, text and tags, ignoring case and accents, title matches first', () => {
    expect(ids({ query: 'CAFÉ' })).toEqual(['2', '1'])
    expect(ids({ query: 'travel' })).toEqual(['1', '3'])
  })

  it('combines the filters', () => {
    expect(ids({ status: 'read' })).toEqual(['2', '3'])
    expect(ids({ status: 'read', tag: 'travel' })).toEqual(['3'])
    expect(ids({})).toEqual(['1', '2', '3'])
  })
})

it('reads tags from commas', () => {
  expect(parseTags(' a, b ,, a')).toEqual(['a', 'b'])
})
