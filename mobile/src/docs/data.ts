/*
 * Docs and their folders over the local library, with the web's rules (src/data/docs.ts): a doc
 * needs some text, its title comes from the first heading when left blank, images nothing uses
 * any more go with it, and deleting a folder deletes everything inside it. Opening, pinning,
 * the status and the reading position are not edits, so `updatedAt` stays.
 */
import { DOC_ROOT, docImageIds, folderSubtree, normalizeDoc, unusedImages } from '@lernzeit/core/docs'
import type { Card, Doc, DocFolder, DocStatus } from '@lernzeit/core/types'
import { newId } from '../data/ids'
import type { LocalLibrary } from '../store/library'
import { useLiveQuery } from '../store/live'

export type DocInput = Pick<Doc, 'title' | 'body' | 'folderId' | 'tags'>

export const useDocs = (): Doc[] => useLiveQuery(['docs'], (l) => l.list<Doc>('docs'), [])
export const useDoc = (id: string): Doc | undefined => useLiveQuery(['docs'], (l) => l.get<Doc>('docs', id), [id])
export const useDocFolders = (): DocFolder[] => useLiveQuery(['docFolders'], (l) => l.list<DocFolder>('docFolders').sort((a, b) => a.name.localeCompare(b.name)), [])

function assertFolder(library: LocalLibrary, id: string) {
  if (id !== DOC_ROOT && !library.get('docFolders', id)) throw new Error('This folder does not exist any more')
}

function removeUnusedImages(library: LocalLibrary, ids: string[]) {
  if (!ids.length) return
  for (const id of unusedImages(ids, library.list<Card>('cards'), library.list<Doc>('docs'))) library.remove('images', id)
}

export function saveDoc(library: LocalLibrary, input: DocInput, existingId?: string): Doc {
  const { title, body, tags } = normalizeDoc(input)
  if (!body.trim()) throw new Error('A doc needs some text')
  return library.write(() => {
    assertFolder(library, input.folderId)
    const previous = existingId ? library.get<Doc>('docs', existingId) : undefined
    const now = Date.now()
    const doc: Doc = { status: 'toRead', pinned: false, createdAt: now, ...previous, id: previous?.id ?? newId(), folderId: input.folderId, title, body, tags, updatedAt: now }
    library.put('docs', doc)
    if (previous) removeUnusedImages(library, docImageIds(previous.body))
    return doc
  })
}

function patchDoc(library: LocalLibrary, id: string, patch: Partial<Doc>) {
  library.write(() => {
    const doc = library.get<Doc>('docs', id)
    if (doc) library.put('docs', { ...doc, ...patch })
  })
}

export const markDocOpened = (library: LocalLibrary, id: string, now = Date.now()) => patchDoc(library, id, { openedAt: now })
export const setDocStatus = (library: LocalLibrary, id: string, status: DocStatus) => patchDoc(library, id, { status })
export const setDocPinned = (library: LocalLibrary, id: string, pinned: boolean) => patchDoc(library, id, { pinned })
export const setDocPosition = (library: LocalLibrary, id: string, position: number) => patchDoc(library, id, { position: Math.max(0, Math.min(1, position)) })

export function moveDoc(library: LocalLibrary, id: string, folderId: string): void {
  library.write(() => {
    assertFolder(library, folderId)
    patchDoc(library, id, { folderId })
  })
}

export function deleteDoc(library: LocalLibrary, id: string): void {
  library.write(() => {
    const doc = library.get<Doc>('docs', id)
    if (!doc) return
    library.remove('docs', id)
    removeUnusedImages(library, docImageIds(doc.body))
  })
}

export function createDocFolder(library: LocalLibrary, name: string, parentId: string = DOC_ROOT): DocFolder {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('A folder needs a name')
  return library.write(() => {
    assertFolder(library, parentId)
    const now = Date.now()
    const folder: DocFolder = { id: newId(), name: trimmed, parentId, createdAt: now, updatedAt: now }
    library.put('docFolders', folder)
    return folder
  })
}

export function renameDocFolder(library: LocalLibrary, id: string, name: string): void {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('A folder needs a name')
  library.write(() => {
    const folder = library.get<DocFolder>('docFolders', id)
    if (folder) library.put('docFolders', { ...folder, name: trimmed, updatedAt: Date.now() })
  })
}

/** A folder cannot move into itself or into one of its own subfolders. */
export function moveDocFolder(library: LocalLibrary, id: string, parentId: string): void {
  library.write(() => {
    assertFolder(library, parentId)
    if (folderSubtree(library.list<DocFolder>('docFolders'), id).has(parentId)) throw new Error('A folder cannot move into itself')
    const folder = library.get<DocFolder>('docFolders', id)
    if (folder) library.put('docFolders', { ...folder, parentId, updatedAt: Date.now() })
  })
}

/** How much deleting a folder removes, counting the folder itself. */
export function countDocFolder(library: LocalLibrary, id: string): { folders: number; docs: number } {
  const ids = folderSubtree(library.list<DocFolder>('docFolders'), id)
  return { folders: ids.size, docs: library.list<Doc>('docs').filter((d) => ids.has(d.folderId)).length }
}

export function deleteDocFolder(library: LocalLibrary, id: string): void {
  library.write(() => {
    const ids = folderSubtree(library.list<DocFolder>('docFolders'), id)
    const docs = library.list<Doc>('docs').filter((d) => ids.has(d.folderId))
    for (const d of docs) library.remove('docs', d.id)
    for (const f of ids) library.remove('docFolders', f)
    removeUnusedImages(library, docs.flatMap((d) => docImageIds(d.body)))
  })
}
