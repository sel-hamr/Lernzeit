import { beforeEach, describe, expect, it } from 'vitest'
import { DOC_ROOT } from '../docs'
import type { Doc, DocFolder } from '../types'
import { expectCode, makeStore, NOW } from './fixture'
import { AI_TAG, runAction } from './index'

let store: ReturnType<typeof makeStore>

beforeEach(() => {
  store = makeStore()
})

describe('docs', () => {
  it('saves a doc in a new folder, tagged ai and titled from its heading', async () => {
    const { doc, created } = await runAction(store, 'create_doc', { body: '# Pasta\n\nBoil water.', folder: 'Recipes/Italian', tags: ['food'] })
    expect(created).toBe(true)
    // updatedAt is the owner's local time: 10:00 in Berlin.
    expect(doc).toEqual({ id: doc.id, title: 'Pasta', folder: 'Recipes/Italian', tags: ['food', AI_TAG], status: 'toRead', words: 3, updatedAt: '2026-10-15T10:00' })
    const folders = await store.list<DocFolder>('docFolders')
    expect(folders).toHaveLength(2)
    const recipes = folders.find((f) => f.name === 'Recipes')!
    expect(recipes).toEqual({ id: recipes.id, name: 'Recipes', parentId: DOC_ROOT, createdAt: NOW, updatedAt: NOW })
    expect(folders.find((f) => f.name === 'Italian')?.parentId).toBe(recipes.id)
    expect(await store.get<Doc>('docs', doc.id)).toEqual({
      id: doc.id, folderId: folders.find((f) => f.name === 'Italian')!.id, title: 'Pasta', body: '# Pasta\n\nBoil water.', tags: ['food', AI_TAG],
      status: 'toRead', pinned: false, createdAt: NOW, updatedAt: NOW,
    })
  })

  it('adds nothing when the folder already has the same text', async () => {
    const first = await runAction(store, 'create_doc', { body: 'Same text', folder: 'A' })
    const before = store.committed.length
    const again = await runAction(store, 'create_doc', { body: ' Same text\n', title: 'Other', folder: 'a' })
    expect(again).toMatchObject({ created: false, doc: { id: first.doc.id } })
    expect(store.committed).toHaveLength(before)
    expect((await runAction(store, 'create_doc', { body: 'Same text', folder: 'B' })).created).toBe(true)
  })

  it('refuses a doc with no text', async () => {
    await expectCode(runAction(store, 'create_doc', { body: '  ' }), 'invalid_input')
    await expectCode(runAction(store, 'create_doc', { body: 'x'.repeat(200_001) }), 'invalid_input')
  })

  it('lists docs in a folder and its subfolders, without their text', async () => {
    await runAction(store, 'create_doc', { body: '# One', folder: 'A/B' })
    await runAction(store, 'create_doc', { body: '# Two', folder: 'A' })
    await runAction(store, 'create_doc', { body: '# Three' })
    const inA = await runAction(store, 'list_docs', { folder: 'a' })
    expect(inA.total).toBe(2)
    expect(inA.folders).toEqual(['A', 'A/B'])
    expect(inA.docs[0]).not.toHaveProperty('body')
    expect((await runAction(store, 'list_docs', { search: 'three' })).docs.map((d) => d.title)).toEqual(['Three'])
    expect((await runAction(store, 'list_docs', { limit: 1, offset: 1 })).docs).toHaveLength(1)
    await expectCode(runAction(store, 'list_docs', { folder: 'Nope' }), 'folder_not_found')
  })

  it('reads a doc by id or title, and asks which when titles repeat', async () => {
    const { doc } = await runAction(store, 'create_doc', { body: '# One\n\nText', folder: 'A' })
    expect((await runAction(store, 'read_doc', { doc: doc.id })).body).toBe('# One\n\nText')
    expect((await runAction(store, 'read_doc', { doc: 'one' })).folder).toBe('A')
    await runAction(store, 'create_doc', { body: '# One\n\nOther text', folder: 'B' })
    await expectCode(runAction(store, 'read_doc', { doc: 'One' }), 'invalid_input')
    await expectCode(runAction(store, 'read_doc', { doc: 'Nope' }), 'doc_not_found')
  })
})
