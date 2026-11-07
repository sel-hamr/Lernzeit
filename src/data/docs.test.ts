import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { LernzeitDB } from '@/db/db'
import { DOC_ROOT, docImageUrl } from '@/lib/docs'
import {
  countDocFolder,
  createDocFolder,
  deleteDoc,
  deleteDocFolder,
  ensureDocFolder,
  findDocFolder,
  markDocOpened,
  moveDoc,
  moveDocFolder,
  removeUnusedDocImages,
  saveDoc,
  setDocPinned,
} from './docs'
import { exportBackup, resetAllData, restoreBackup } from './io'

let database: LernzeitDB
let counter = 0

beforeEach(() => {
  database = new LernzeitDB(`docs-test-${counter++}`)
})

afterEach(async () => {
  await database.delete()
})

const doc = (body: string, folderId = DOC_ROOT, title = '') => saveDoc({ title, body, folderId, tags: [] }, undefined, database)

async function addImage(id: string) {
  await database.images.add({ id, blob: new Blob(['x']), width: 1, height: 1, fit: 'cover' })
}

describe('docs', () => {
  it('saves pasted text as a doc to read, titled from its first heading', async () => {
    const saved = await doc('# Hello **world**\n\nText\n\n')
    expect(saved).toMatchObject({ title: 'Hello world', body: '# Hello **world**\n\nText', status: 'toRead', pinned: false, folderId: DOC_ROOT })
  })

  it('needs some text, and keeps a title you typed', async () => {
    await expect(doc('   \n ')).rejects.toThrow('needs some text')
    expect((await doc('# Heading', DOC_ROOT, 'Mine')).title).toBe('Mine')
    expect((await doc('Just a line')).title).toBe('Just a line')
  })

  it('finds its docs by a top-level folder too, which IndexedDB could not do with null', async () => {
    await doc('one')
    expect(await database.docs.where('folderId').equals(DOC_ROOT).count()).toBe(1)
  })

  it('keeps status, pin and creation time when a doc is edited', async () => {
    const first = await doc('one')
    await setDocPinned(first.id, true, database)
    const edited = await saveDoc({ title: 'New', body: 'two', folderId: DOC_ROOT, tags: ['a', 'a', ' '] }, first.id, database)
    expect(edited).toMatchObject({ id: first.id, title: 'New', body: 'two', pinned: true, createdAt: first.createdAt, tags: ['a'] })
  })

  it('does not count opening or pinning as an edit', async () => {
    const first = await doc('one')
    await database.docs.update(first.id, { updatedAt: 5 })
    await markDocOpened(first.id, database)
    await setDocPinned(first.id, true, database)
    const after = await database.docs.get(first.id)
    expect(after?.updatedAt).toBe(5)
    expect(after?.openedAt).toBeGreaterThan(0)
  })

  it('will not save or move a doc into a folder that is gone', async () => {
    await expect(doc('one', 'nope')).rejects.toThrow('does not exist')
    const first = await doc('one')
    await expect(moveDoc(first.id, 'nope', database)).rejects.toThrow('does not exist')
  })
})

describe('folders', () => {
  it('nests folders, and a folder cannot move into itself or its own subfolder', async () => {
    const top = await createDocFolder('Top', DOC_ROOT, database)
    const child = await createDocFolder('Child', top.id, database)
    const other = await createDocFolder('Other', DOC_ROOT, database)
    await expect(moveDocFolder(top.id, top.id, database)).rejects.toThrow('cannot move into itself')
    await expect(moveDocFolder(top.id, child.id, database)).rejects.toThrow('cannot move into itself')
    await moveDocFolder(top.id, other.id, database)
    expect((await database.docFolders.get(top.id))?.parentId).toBe(other.id)
  })

  it('deletes a folder with its subfolders and all their docs, and nothing else', async () => {
    const top = await createDocFolder('Top', DOC_ROOT, database)
    const child = await createDocFolder('Child', top.id, database)
    await doc('in top', top.id)
    await doc('in child', child.id)
    const kept = await doc('at the top level')
    expect(await countDocFolder(top.id, database)).toEqual({ folders: 2, docs: 2 })
    await deleteDocFolder(top.id, database)
    expect(await database.docFolders.count()).toBe(0)
    expect((await database.docs.toArray()).map((d) => d.id)).toEqual([kept.id])
  })

  it('finds and makes folders by a path, ignoring case', async () => {
    const id = await ensureDocFolder('Recipes / Italian', database)
    expect(await ensureDocFolder('recipes/ITALIAN', database)).toBe(id)
    expect(await database.docFolders.count()).toBe(2)
    expect((await findDocFolder('recipes/italian', database))?.id).toBe(id)
    expect(await findDocFolder('recipes/french', database)).toBeUndefined()
    expect(await ensureDocFolder('', database)).toBe(DOC_ROOT)
  })
})

describe('doc images', () => {
  it('deletes a picture with the last doc that uses it', async () => {
    await addImage('pic')
    const body = `![a](${docImageUrl('pic')})`
    const first = await doc(body)
    const second = await doc(`Copy ${body}`)
    await deleteDoc(first.id, database)
    expect(await database.images.get('pic')).toBeDefined()
    await deleteDoc(second.id, database)
    expect(await database.images.get('pic')).toBeUndefined()
  })

  it('deletes a picture taken out of a doc while editing', async () => {
    await addImage('pic')
    const first = await doc(`![a](${docImageUrl('pic')})`)
    await saveDoc({ title: 'x', body: 'no picture', folderId: DOC_ROOT, tags: [] }, first.id, database)
    expect(await database.images.get('pic')).toBeUndefined()
  })

  it('deletes the pictures of a deleted folder', async () => {
    await addImage('pic')
    const folder = await createDocFolder('Top', DOC_ROOT, database)
    await doc(`![a](${docImageUrl('pic')})`, folder.id)
    await deleteDocFolder(folder.id, database)
    expect(await database.images.get('pic')).toBeUndefined()
  })

  it('keeps pictures that a doc or a card still uses', async () => {
    await addImage('inDoc')
    await addImage('onCard')
    await addImage('unused')
    await doc(`![a](${docImageUrl('inDoc')})`)
    await database.cards.add({ id: 'c', imageId: 'onCard' } as never)
    await removeUnusedDocImages(['inDoc', 'onCard', 'unused'], database)
    expect((await database.images.toArray()).map((i) => i.id).sort()).toEqual(['inDoc', 'onCard'])
  })
})

describe('backups', () => {
  it('keeps folders and docs through a backup, and restores older backups without them', async () => {
    const folder = await createDocFolder('Top', DOC_ROOT, database)
    const saved = await doc('# Hello', folder.id)
    const backup = JSON.parse(JSON.stringify(await exportBackup(database)))
    const other = new LernzeitDB(`docs-test-${counter++}`)
    try {
      await restoreBackup(backup, other)
      expect(await other.docFolders.get(folder.id)).toEqual(folder)
      expect(await other.docs.get(saved.id)).toEqual(saved)
      await restoreBackup({ ...backup, docs: undefined, docFolders: undefined }, other)
      expect(await other.docs.count()).toBe(0)
      await expect(restoreBackup({ ...backup, docs: 'oops' }, other)).rejects.toThrow('broken "docs"')
    } finally {
      await other.delete()
    }
  })

  it('clears folders and docs on reset', async () => {
    await doc('one', (await createDocFolder('Top', DOC_ROOT, database)).id)
    await resetAllData(database)
    expect(await database.docs.count()).toBe(0)
    expect(await database.docFolders.count()).toBe(0)
  })
})
