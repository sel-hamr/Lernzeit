import { db, newId, type LernzeitDB } from '@/db/db'
import type { Doc, DocFolder, DocStatus, StoredImage } from '@/db/types'
import { DOC_ROOT, docImageIds, folderSubtree, titleFromMarkdown } from '@/lib/docs'
import { foldText } from '@/lib/text'

export type DocInput = Pick<Doc, 'title' | 'body' | 'folderId' | 'tags'>

async function assertFolder(database: LernzeitDB, id: string) {
  if (id !== DOC_ROOT && !(await database.docFolders.get(id))) throw new Error('This folder does not exist any more')
}

/** Deletes the images nothing uses any more. Docs and cards can share one. */
export async function removeUnusedDocImages(ids: Iterable<string>, database: LernzeitDB = db) {
  const candidates = [...ids]
  if (!candidates.length) return
  await database.transaction('rw', database.docs, database.cards, database.images, async () => {
    const used = new Set((await database.docs.toArray()).flatMap((d) => docImageIds(d.body)))
    await database.cards.each((card) => {
      if (card.imageId) used.add(card.imageId)
    })
    await database.images.bulkDelete(candidates.filter((id) => !used.has(id)))
  })
}

export async function saveDoc(input: DocInput, existingId?: string, database: LernzeitDB = db): Promise<Doc> {
  const body = input.body.trimEnd()
  if (!body.trim()) throw new Error('A doc needs some text')
  await assertFolder(database, input.folderId)
  const previous = existingId ? await database.docs.get(existingId) : undefined
  const now = Date.now()
  const doc: Doc = {
    status: 'toRead',
    pinned: false,
    createdAt: now,
    ...previous,
    id: previous?.id ?? newId(),
    folderId: input.folderId,
    title: input.title.trim() || titleFromMarkdown(body) || 'Untitled',
    body,
    tags: [...new Set(input.tags.map((t) => t.trim()).filter(Boolean))],
    updatedAt: now,
  }
  await database.docs.put(doc)
  if (previous) await removeUnusedDocImages(docImageIds(previous.body), database)
  return doc
}

/** These changes are not edits, so `updatedAt` stays. */
export async function markDocOpened(id: string, database: LernzeitDB = db) {
  await database.docs.update(id, { openedAt: Date.now() })
}

export async function setDocStatus(id: string, status: DocStatus, database: LernzeitDB = db) {
  await database.docs.update(id, { status })
}

export async function setDocPinned(id: string, pinned: boolean, database: LernzeitDB = db) {
  await database.docs.update(id, { pinned })
}

export async function setDocPosition(id: string, position: number, database: LernzeitDB = db) {
  await database.docs.update(id, { position })
}

export async function moveDoc(id: string, folderId: string, database: LernzeitDB = db) {
  await assertFolder(database, folderId)
  await database.docs.update(id, { folderId })
}

export async function deleteDoc(id: string, database: LernzeitDB = db) {
  const doc = await database.docs.get(id)
  if (!doc) return
  await database.docs.delete(id)
  await removeUnusedDocImages(docImageIds(doc.body), database)
}

export async function addDocImage(image: Omit<StoredImage, 'id'>, database: LernzeitDB = db): Promise<string> {
  const id = newId()
  await database.images.add({ id, ...image })
  return id
}

export async function createDocFolder(name: string, parentId: string = DOC_ROOT, database: LernzeitDB = db): Promise<DocFolder> {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('A folder needs a name')
  await assertFolder(database, parentId)
  const now = Date.now()
  const folder: DocFolder = { id: newId(), name: trimmed, parentId, createdAt: now, updatedAt: now }
  await database.docFolders.add(folder)
  return folder
}

export async function renameDocFolder(id: string, name: string, database: LernzeitDB = db) {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('A folder needs a name')
  await database.docFolders.update(id, { name: trimmed, updatedAt: Date.now() })
}

/** A folder cannot move into itself or into one of its own subfolders. */
export async function moveDocFolder(id: string, parentId: string, database: LernzeitDB = db) {
  await assertFolder(database, parentId)
  if (folderSubtree(await database.docFolders.toArray(), id).has(parentId)) throw new Error('A folder cannot move into itself')
  await database.docFolders.update(id, { parentId, updatedAt: Date.now() })
}

/** How much deleting a folder removes, counting the folder itself. */
export async function countDocFolder(id: string, database: LernzeitDB = db): Promise<{ folders: number; docs: number }> {
  const ids = folderSubtree(await database.docFolders.toArray(), id)
  return { folders: ids.size, docs: await database.docs.where('folderId').anyOf([...ids]).count() }
}

/** Deletes a folder with everything inside it. */
export async function deleteDocFolder(id: string, database: LernzeitDB = db) {
  const ids = [...folderSubtree(await database.docFolders.toArray(), id)]
  const docs = await database.docs.where('folderId').anyOf(ids).toArray()
  await database.transaction('rw', database.docFolders, database.docs, async () => {
    await database.docs.bulkDelete(docs.map((d) => d.id))
    await database.docFolders.bulkDelete(ids)
  })
  await removeUnusedDocImages(docs.flatMap((d) => docImageIds(d.body)), database)
}

/** The folder at a path like "Recipes/Italian", or undefined. Names ignore case. */
export async function findDocFolder(path: string, database: LernzeitDB = db): Promise<DocFolder | undefined> {
  const folders = await database.docFolders.toArray()
  let parentId = DOC_ROOT
  let found: DocFolder | undefined
  for (const name of splitPath(path)) {
    found = folders.find((f) => f.parentId === parentId && foldText(f.name) === foldText(name))
    if (!found) return undefined
    parentId = found.id
  }
  return found
}

/** The folder at a path like "Recipes/Italian", made if it is missing. An empty path is the top level. */
export async function ensureDocFolder(path: string, database: LernzeitDB = db): Promise<string> {
  let parentId = DOC_ROOT
  for (const name of splitPath(path)) {
    const folders = await database.docFolders.where('parentId').equals(parentId).toArray()
    const existing = folders.find((f) => foldText(f.name) === foldText(name))
    parentId = (existing ?? (await createDocFolder(name, parentId, database))).id
  }
  return parentId
}

function splitPath(path: string): string[] {
  return path.split('/').map((name) => name.trim()).filter(Boolean)
}
