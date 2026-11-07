import { useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { ChevronLeft, FileText, Folder, FolderInput, FolderPlus, Pencil, Pin, Plus, Search, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Segmented } from '@/components/ui/form'
import { useFeedback } from '@/components/ui/feedback'
import { Chip, EmptyState, PageHeader, SectionHeader } from '@/components/ui/primitives'
import { countDocFolder, createDocFolder, deleteDocFolder, moveDocFolder, renameDocFolder } from '@/data/docs'
import { useDocFolders, useDocs } from '@/data/hooks'
import type { Doc, DocFolder, DocStatus } from '@/db/types'
import { DOC_ROOT, DOC_STATUS_LABEL, docDateLabel, docExcerpt, docReadingMinutes, filterDocs, folderPath, folderSubtree, folderTrail } from '@/lib/docs'
import { countWords } from '@/lib/reader'
import { count } from '@/lib/text'
import { FolderNameDialog, MoveDialog } from './DocDialogs'

/** Tiles at the top of the library. Every pinned doc gets one, even when there are more. */
const CONTINUE_TILES = 3
const TILE_GRID = 'grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4'
const TILE = 'rounded-section border border-line bg-main transition-[border-color,background-color] hover:border-line-strong hover:bg-soft'

function DocTile({ doc, folders, showFolder }: { doc: Doc; folders: DocFolder[]; showFolder?: boolean }) {
  const path = showFolder ? folderPath(folders, doc.folderId) : ''
  return (
    <Link to={`/docs/${doc.id}`} className={`group flex flex-col gap-3 p-5 ${TILE}`}>
      <div className="flex flex-wrap items-center gap-1.5">
        <Chip tone={doc.status === 'read' ? 'neutral' : 'sage'}>{DOC_STATUS_LABEL[doc.status]}</Chip>
        {doc.tags.slice(0, 2).map((tag) => (
          <Chip key={tag} tone="soft">
            {tag}
          </Chip>
        ))}
        {doc.pinned && <Pin size={14} strokeWidth={1.8} className="ms-auto text-muted" aria-label="Pinned" />}
      </div>
      <div className="flex flex-col gap-1.5">
        <h3 className="text-section font-semibold group-hover:underline">{doc.title}</h3>
        <p className="line-clamp-2 text-small text-muted">{docExcerpt(doc.body)}</p>
      </div>
      <div className="mt-auto flex justify-between gap-3 pt-1 text-chip text-muted tabular-nums">
        <span className="truncate">{path || docDateLabel(doc.updatedAt)}</span>
        <span className="shrink-0">{docReadingMinutes(countWords(doc.body))} min</span>
      </div>
    </Link>
  )
}

function FolderTile({ folder, items }: { folder: DocFolder; items: number }) {
  return (
    <Link to={`/docs/folder/${folder.id}`} className={`group flex min-w-0 items-center gap-3 p-4 ${TILE}`}>
      <span className="flex size-10 shrink-0 items-center justify-center rounded-img bg-sage text-sage-ink">
        <Folder size={18} strokeWidth={1.7} />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-section font-semibold group-hover:underline">{folder.name}</span>
        <span className="text-small text-muted tabular-nums">{count(items, 'item')}</span>
      </span>
    </Link>
  )
}

function Group({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <SectionHeader title={title} />
      {children}
    </section>
  )
}

type StatusFilter = DocStatus | 'all'
type DialogName = 'newFolder' | 'rename' | 'move'

/** The start of the library, or one folder with what is inside it. */
export function DocsPage() {
  const { folderId } = useParams()
  const docs = useDocs()
  const folders = useDocFolders()
  const { confirm, toast } = useFeedback()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [tag, setTag] = useState<string>()
  const [dialog, setDialog] = useState<DialogName | null>(null)

  const currentId = folderId ?? DOC_ROOT
  const folder = folders?.find((f) => f.id === folderId)

  // What the search and filters look through: this folder with its subfolders.
  const scope = useMemo(() => {
    if (!docs || !folders) return []
    if (!folderId) return docs
    const ids = folderSubtree(folders, folderId)
    return docs.filter((d) => ids.has(d.folderId))
  }, [docs, folders, folderId])
  const tags = useMemo(() => [...new Set(scope.flatMap((d) => d.tags))].sort((a, b) => a.localeCompare(b)), [scope])

  if (!docs || !folders) return null
  if (folderId && !folder) {
    return (
      <EmptyState title="This folder is gone" action={<Button onClick={() => navigate('/docs')}>All docs</Button>}>
        It may have been deleted.
      </EmptyState>
    )
  }

  const activeTag = tag && tags.includes(tag) ? tag : undefined
  const filtering = !!query.trim() || status !== 'all' || !!activeTag
  const results = filtering ? filterDocs(scope, { query, status: status === 'all' ? undefined : status, tag: activeTag }) : []
  const subfolders = folders.filter((f) => f.parentId === currentId)
  const here = docs.filter((d) => d.folderId === currentId).sort((a, b) => Number(b.pinned) - Number(a.pinned) || a.title.localeCompare(b.title))
  const pinned = docs.filter((d) => d.pinned)
  const opened = docs.filter((d) => d.openedAt && !d.pinned)
  const tiles = folderId ? [] : [...pinned, ...opened].slice(0, Math.max(CONTINUE_TILES, pinned.length))
  const itemsIn = (id: string) => folders.filter((f) => f.parentId === id).length + docs.filter((d) => d.folderId === id).length
  const empty = !subfolders.length && !here.length
  const parent = folder && folderTrail(folders, folder.parentId).at(-1)

  const removeFolder = async () => {
    if (!folder) return
    const inside = await countDocFolder(folder.id)
    const subfolderCount = inside.folders - 1
    const parts = [count(inside.docs, 'doc'), ...(subfolderCount ? [count(subfolderCount, 'subfolder')] : [])]
    const ok = await confirm({
      title: `Delete "${folder.name}"?`,
      body: `This also deletes the ${parts.join(' and ')} inside it. This cannot be undone.`,
      confirmLabel: 'Delete',
      danger: true,
    })
    if (!ok) return
    await deleteDocFolder(folder.id)
    navigate(parent ? `/docs/folder/${parent.id}` : '/docs', { replace: true })
    toast('Folder deleted')
  }

  const header = (
    <PageHeader
      title={folder?.name ?? 'Docs'}
      subtitle={folder ? count(itemsIn(folder.id), 'item') : `${count(docs.length, 'doc')} · save Markdown and read it like a README`}
      actions={
        <>
          {folder && (
            <div className="flex items-center">
              <Button variant="ghost" iconOnly aria-label="Rename folder" title="Rename folder" icon={<Pencil size={16} strokeWidth={1.8} />} onClick={() => setDialog('rename')} />
              <Button variant="ghost" iconOnly aria-label="Move folder" title="Move folder" icon={<FolderInput size={16} strokeWidth={1.8} />} onClick={() => setDialog('move')} />
              <Button variant="ghost" iconOnly aria-label="Delete folder" title="Delete folder" icon={<Trash2 size={16} strokeWidth={1.8} />} onClick={() => void removeFolder()} />
            </div>
          )}
          <Button variant="outline" icon={<FolderPlus size={15} strokeWidth={1.8} />} onClick={() => setDialog('newFolder')}>
            New folder
          </Button>
          <Button variant="soft" icon={<Plus size={16} strokeWidth={1.8} />} onClick={() => navigate(folderId ? `/docs/new?folder=${folderId}` : '/docs/new')}>
            New doc
          </Button>
        </>
      }
    />
  )

  return (
    <>
      {folder ? (
        <div className="flex flex-col gap-3">
          <Link to={parent ? `/docs/folder/${parent.id}` : '/docs'} className="inline-flex items-center gap-1 self-start rounded-img text-small text-muted transition-colors hover:text-ink">
            <ChevronLeft size={16} strokeWidth={1.8} className="rtl:rotate-180" aria-hidden />
            {parent?.name ?? 'Docs'}
          </Link>
          {header}
        </div>
      ) : (
        header
      )}

      {scope.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex h-10 min-w-50 flex-1 items-center gap-2 rounded-img border border-line bg-main px-3 text-body text-muted transition-[border-color,box-shadow] hover:border-line-strong focus-within:border-sage-dot focus-within:ring-3 focus-within:ring-sage-dot/15">
              <Search size={16} strokeWidth={1.8} aria-hidden />
              <input
                type="search"
                aria-label={folder ? `Search in ${folder.name}` : 'Search docs'}
                placeholder={folder ? `Search in ${folder.name}` : 'Search docs'}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full min-w-0 bg-transparent text-ink outline-none"
              />
            </label>
            <Segmented<StatusFilter>
              label="Filter by status"
              value={status}
              onChange={setStatus}
              options={[
                { value: 'all', label: 'All' },
                { value: 'toRead', label: DOC_STATUS_LABEL.toRead },
                { value: 'read', label: DOC_STATUS_LABEL.read },
              ]}
            />
          </div>
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by tag">
              {tags.map((t) => (
                <button key={t} type="button" aria-pressed={t === activeTag} onClick={() => setTag(t === activeTag ? undefined : t)}>
                  <Chip tone={t === activeTag ? 'sage' : 'soft'}>{t}</Chip>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {filtering ? (
        results.length ? (
          <Group title={count(results.length, 'result')}>
            <div className={TILE_GRID}>
              {results.map((d) => (
                <DocTile key={d.id} doc={d} folders={folders} showFolder />
              ))}
            </div>
          </Group>
        ) : (
          <div className="rounded-section border border-line">
            <EmptyState icon={<Search size={20} strokeWidth={1.6} />} title="No docs match" />
          </div>
        )
      ) : (
        <>
          {tiles.length > 0 && (
            <Group title="Continue reading">
              <div className={TILE_GRID}>
                {tiles.map((d) => (
                  <DocTile key={d.id} doc={d} folders={folders} showFolder />
                ))}
              </div>
            </Group>
          )}
          {subfolders.length > 0 && (
            <Group title="Folders">
              <div className={TILE_GRID}>
                {subfolders.map((f) => (
                  <FolderTile key={f.id} folder={f} items={itemsIn(f.id)} />
                ))}
              </div>
            </Group>
          )}
          {here.length > 0 && (
            <Group title="Documents">
              <div className={TILE_GRID}>
                {here.map((d) => (
                  <DocTile key={d.id} doc={d} folders={folders} />
                ))}
              </div>
            </Group>
          )}
          {empty && (
            <div className="rounded-section border border-line">
              <EmptyState
                icon={<FileText size={20} strokeWidth={1.6} />}
                title={folder ? 'This folder is empty' : 'No docs yet'}
                action={
                  <Button variant="soft" icon={<Plus size={16} strokeWidth={1.8} />} onClick={() => navigate(folderId ? `/docs/new?folder=${folderId}` : '/docs/new')}>
                    New doc
                  </Button>
                }
              >
                Paste your Markdown text and read it like a README.
              </EmptyState>
            </div>
          )}
        </>
      )}

      {dialog === 'newFolder' && (
        <FolderNameDialog
          title={folder ? `New folder in ${folder.name}` : 'New folder'}
          action="Create"
          onClose={() => setDialog(null)}
          onSave={(name) => createDocFolder(name, currentId)}
        />
      )}
      {dialog === 'rename' && folder && (
        <FolderNameDialog title="Rename folder" action="Save" initial={folder.name} onClose={() => setDialog(null)} onSave={(name) => renameDocFolder(folder.id, name)} />
      )}
      {dialog === 'move' && folder && (
        <MoveDialog
          title={`Move "${folder.name}"`}
          folders={folders}
          current={folder.parentId}
          without={folder.id}
          onClose={() => setDialog(null)}
          onMove={(target) => moveDocFolder(folder.id, target)}
        />
      )}
    </>
  )
}
