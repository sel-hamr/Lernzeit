import { MAX_DOC_TITLE } from '@/bridge/protocol'
import type { Doc, DocFolder, DocStatus } from '@/db/types'
import { foldText } from './text'

/** The `folderId` of a doc and the `parentId` of a folder at the top level. IndexedDB cannot index null. */
export const DOC_ROOT = 'root'

export const DOC_STATUS_LABEL: Record<DocStatus, string> = { toRead: 'To read', read: 'Read' }

const IMAGE_SCHEME = 'image:'
const FENCE_RE = /^\s{0,3}(```|~~~)/
const H1_RE = /^\s{0,3}#\s+(.+?)\s*#*\s*$/
const LINE_MARK_RE = /^\s*(#{1,6}\s+|[-*+>]\s+|\d+[.)]\s+)+/

/** "**Hello** [world](url)" -> "Hello world" */
function plainInline(text: string): string {
  return text
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\*\*|__|\*|`|~~/g, '')
    .trim()
}

/** The text of the first `# Heading`, skipping code blocks. */
export function firstHeading(body: string): string {
  let inFence = false
  for (const line of body.split(/\r?\n/)) {
    if (FENCE_RE.test(line)) inFence = !inFence
    else if (!inFence) {
      const heading = H1_RE.exec(line)
      if (heading) return plainInline(heading[1]).slice(0, MAX_DOC_TITLE)
    }
  }
  return ''
}

/** True when the text opens with this title as its `# Heading`. */
export function opensWithTitle(body: string, title: string): boolean {
  const first = body.split(/\r?\n/).find((line) => line.trim()) ?? ''
  return H1_RE.test(first) && firstHeading(first) === title
}

/** A title for text that was saved without one: the first heading, or else the first line of text. */
export function titleFromMarkdown(body: string): string {
  const heading = firstHeading(body)
  if (heading) return heading
  const line = body.split(/\r?\n/).find((l) => l.trim() && !FENCE_RE.test(l)) ?? ''
  return plainInline(line.replace(LINE_MARK_RE, '')).slice(0, MAX_DOC_TITLE)
}

export function docImageUrl(id: string): string {
  return `${IMAGE_SCHEME}${id}`
}

/** The stored image a doc's link points to, if it points to one. */
export function docImageId(url: string | undefined): string | undefined {
  return url?.match(/^image:([\w-]+)$/)?.[1]
}

/** The stored images a doc's text uses. */
export function docImageIds(body: string): string[] {
  return [...new Set([...body.matchAll(/\]\(image:([\w-]+)\)/g)].map((m) => m[1]))]
}

/** A folder and everything inside it. */
export function folderSubtree(folders: DocFolder[], id: string): Set<string> {
  const ids = new Set([id])
  let grew = true
  while (grew) {
    grew = false
    for (const folder of folders) {
      if (ids.has(folder.parentId) && !ids.has(folder.id)) {
        ids.add(folder.id)
        grew = true
      }
    }
  }
  return ids
}

/** The folders from the top level down to `id`. */
export function folderTrail(folders: DocFolder[], id: string): DocFolder[] {
  const trail: DocFolder[] = []
  const byId = new Map(folders.map((f) => [f.id, f]))
  let folder = byId.get(id)
  while (folder && !trail.includes(folder)) {
    trail.unshift(folder)
    folder = byId.get(folder.parentId)
  }
  return trail
}

/** "Recipes / Italian", or "" at the top level. */
export function folderPath(folders: DocFolder[], id: string): string {
  return folderTrail(folders, id)
    .map((f) => f.name)
    .join(' / ')
}

/** Every folder a doc or folder can move to, with its path, sorted. `without` leaves a folder and its subfolders out. */
export function folderChoices(folders: DocFolder[], without?: string): { id: string; path: string }[] {
  const hidden = without ? folderSubtree(folders, without) : new Set<string>()
  return folders
    .filter((f) => !hidden.has(f.id))
    .map((f) => ({ id: f.id, path: folderPath(folders, f.id) }))
    .sort((a, b) => a.path.localeCompare(b.path))
}

export function parseTags(text: string): string[] {
  return [...new Set(text.split(',').map((t) => t.trim()).filter(Boolean))]
}

export interface DocFilter {
  query?: string
  status?: DocStatus
  tag?: string
}

/** Docs whose title, text or tags have the query. A match in the title comes first. */
export function filterDocs(docs: Doc[], { query = '', status, tag }: DocFilter): Doc[] {
  const q = foldText(query.trim())
  const matches = docs.filter(
    (d) => (!status || d.status === status) && (!tag || d.tags.includes(tag)) && (!q || foldText(`${d.title} ${d.tags.join(' ')} ${d.body}`).includes(q)),
  )
  if (!q) return matches
  const inTitle = (d: Doc) => foldText(d.title).includes(q)
  return [...matches.filter(inTitle), ...matches.filter((d) => !inTitle(d))]
}

/** The first real sentences of a doc, for a preview: no headings, code, tables or pictures. */
export function docExcerpt(body: string, length = 160): string {
  let inFence = false
  const parts: string[] = []
  for (const line of body.split(/\r?\n/)) {
    if (FENCE_RE.test(line)) inFence = !inFence
    else if (!inFence && line.trim() && !/^\s*(#|\||!\[|<|---|\*\*\*)/.test(line)) parts.push(plainInline(line.replace(LINE_MARK_RE, '')))
    if (parts.join(' ').length >= length) break
  }
  return parts.join(' ').slice(0, length).trim()
}

/** "Today", "Yesterday", "3 days ago", then a short date. */
export function docDateLabel(time: number, now: number = Date.now()): string {
  const midnight = (ms: number) => new Date(ms).setHours(0, 0, 0, 0)
  const days = Math.round((midnight(now) - midnight(time)) / 86_400_000)
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days} days ago`
  return new Date(time).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

/** Minutes to read at an ordinary pace of about 200 words a minute. */
export function docReadingMinutes(words: number): number {
  return Math.max(1, Math.round(words / 200))
}
