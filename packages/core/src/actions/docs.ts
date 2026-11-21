import { DOC_ROOT, filterDocs, folderChoices, folderSubtree, folderTrail, titleFromMarkdown } from '../docs'
import {
  BridgeError,
  MAX_DOC_CHARS,
  MAX_DOC_TITLE,
  MAX_DOCS_PER_LIST,
  type CreateDocParams,
  type CreateDocResult,
  type DocDetails,
  type DocSummary,
  type ListDocsParams,
  type ListDocsResult,
  type ReadDocParams,
} from '../protocol'
import { countWords } from '../reader'
import { foldText } from '../text'
import type { Doc, DocFolder } from '../types'
import { AI_TAG, byId, cleanTags, invalid, localDateTime, type ActionContext } from './shared'

const docFolderPath = (folders: DocFolder[], id: string) =>
  folderTrail(folders, id)
    .map((f) => f.name)
    .join('/')

function describeDoc(ctx: ActionContext, doc: Doc, folders: DocFolder[]): DocSummary {
  const { id, title, tags, status } = doc
  return { id, title, folder: docFolderPath(folders, doc.folderId), tags, status, words: countWords(doc.body), updatedAt: localDateTime(ctx, doc.updatedAt) }
}

const splitPath = (path: string) => path.split('/').map((name) => name.trim()).filter(Boolean)

const allFolders = async (ctx: ActionContext) => (await ctx.store.list<DocFolder>('docFolders')).sort(byId)

/** The folder at a path like "Recipes/Italian", or undefined. Names ignore case. */
async function findDocFolder(ctx: ActionContext, path: string): Promise<DocFolder | undefined> {
  const folders = await allFolders(ctx)
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
async function ensureDocFolder(ctx: ActionContext, path: string): Promise<string> {
  let parentId = DOC_ROOT
  for (const name of splitPath(path)) {
    const folders = (await ctx.store.list<DocFolder>('docFolders', { parentId })).sort(byId)
    let folder = folders.find((f) => foldText(f.name) === foldText(name))
    if (!folder) {
      folder = { id: ctx.newId(), name, parentId, createdAt: ctx.now, updatedAt: ctx.now }
      ctx.store.put('docFolders', folder)
    }
    parentId = folder.id
  }
  return parentId
}

export async function listDocs({ folder, search, tag, limit = MAX_DOCS_PER_LIST, offset = 0 }: ListDocsParams, ctx: ActionContext): Promise<ListDocsResult> {
  const [docs, folders] = await Promise.all([ctx.store.list<Doc>('docs'), allFolders(ctx)])
  docs.sort(byId)
  const paths = folderChoices(folders).map((f) => docFolderPath(folders, f.id))
  let inside = docs
  if (folder?.trim()) {
    const found = await findDocFolder(ctx, folder)
    if (!found) throw new BridgeError('folder_not_found', `There is no folder "${folder}". Folders: ${paths.join(', ') || 'none'}.`)
    const ids = folderSubtree(folders, found.id)
    inside = docs.filter((d) => ids.has(d.folderId))
  }
  const matches = filterDocs(inside, { query: search, tag: tag?.trim() })
  const size = Math.min(Math.max(1, limit), MAX_DOCS_PER_LIST)
  return { folders: paths, total: matches.length, offset, docs: matches.slice(offset, offset + size).map((d) => describeDoc(ctx, d, folders)) }
}

export async function readDoc({ doc: ref }: ReadDocParams, ctx: ActionContext): Promise<DocDetails> {
  const folders = await allFolders(ctx)
  const byRefId = await ctx.store.get<Doc>('docs', ref)
  const named = byRefId ? [byRefId] : (await ctx.store.list<Doc>('docs')).sort(byId).filter((d) => foldText(d.title) === foldText(ref.trim()))
  if (!named.length) throw new BridgeError('doc_not_found', `There is no doc "${ref}". Call list_docs to see the docs.`)
  if (named.length > 1) throw invalid(`${named.length} docs are called "${ref}". Use an id: ${named.map((d) => d.id).join(', ')}.`)
  return { ...describeDoc(ctx, named[0], folders), body: named[0].body }
}

export async function createDoc({ title, body, folder, tags }: CreateDocParams, ctx: ActionContext): Promise<CreateDocResult> {
  if (!body.trim()) throw invalid('A doc needs some text.')
  if (body.length > MAX_DOC_CHARS) throw invalid(`A doc can have at most ${MAX_DOC_CHARS} characters.`)
  if (title && title.length > MAX_DOC_TITLE) throw invalid(`A title can have at most ${MAX_DOC_TITLE} characters.`)
  const folderId = await ensureDocFolder(ctx, folder ?? '')
  const twin = (await ctx.store.list<Doc>('docs', { folderId })).sort(byId).find((d) => d.body.trim() === body.trim())
  let doc = twin
  if (!doc) {
    // As the doc editor saves a new doc.
    const text = body.trimEnd()
    doc = {
      status: 'toRead',
      pinned: false,
      createdAt: ctx.now,
      id: ctx.newId(),
      folderId,
      title: (title ?? '').trim() || titleFromMarkdown(text) || 'Untitled',
      body: text,
      tags: cleanTags([...(tags ?? []), AI_TAG]),
      updatedAt: ctx.now,
    }
    ctx.store.put('docs', doc)
  }
  return { doc: describeDoc(ctx, doc, await allFolders(ctx)), created: !twin }
}
