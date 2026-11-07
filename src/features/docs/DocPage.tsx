import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import clsx from 'clsx'
import { Check, ChevronLeft, Copy, FolderInput, Pencil, Pin, PinOff, RotateCcw, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useFeedback } from '@/components/ui/feedback'
import { Chip, EmptyState, PageHeader, Section } from '@/components/ui/primitives'
import { deleteDoc, markDocOpened, moveDoc, setDocPinned, setDocPosition, setDocStatus } from '@/data/docs'
import { useDoc, useDocFolders } from '@/data/hooks'
import type { Doc, DocFolder } from '@/db/types'
import { DOC_ROOT, DOC_STATUS_LABEL, docDateLabel, docReadingMinutes, folderTrail, opensWithTitle } from '@/lib/docs'
import { countWords } from '@/lib/reader'
import { MoveDialog } from './DocDialogs'
import { DocEditor } from './DocEditor'
import { DocMarkdown } from './DocMarkdown'
import { docHeadings, scrollToHeading, type DocHeading } from './headings'

const MIN_TOC_HEADINGS = 3
const POSITION_SAVE_MS = 700

function scrollable() {
  return document.documentElement.scrollHeight - window.innerHeight
}

/** Goes back to where you stopped, and keeps track of how far down you are. */
function useReadingPosition(id: string, saved: number | undefined) {
  const [start] = useState(saved)
  useEffect(() => {
    window.scrollTo(0, (start ?? 0) * scrollable())
    let timer: ReturnType<typeof setTimeout> | undefined
    const onScroll = () => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        const height = scrollable()
        if (height > 0) void setDocPosition(id, Math.min(1, window.scrollY / height))
      }, POSITION_SAVE_MS)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      clearTimeout(timer)
      window.removeEventListener('scroll', onScroll)
    }
  }, [id, start])
}

function Contents({ headings }: { headings: DocHeading[] }) {
  const lowest = Math.min(...headings.map((h) => h.level))
  return (
    <ul className="flex flex-col">
      {headings.map((h) => (
        <li key={h.id} style={{ paddingInlineStart: (h.level - lowest) * 12 }}>
          <button type="button" onClick={() => scrollToHeading(h.id)} className="w-full py-1 text-start text-small text-muted transition-colors hover:text-ink">
            {h.text}
          </button>
        </li>
      ))}
    </ul>
  )
}

function DocReader({ doc, folders, onEdit }: { doc: Doc; folders: DocFolder[]; onEdit: () => void }) {
  const navigate = useNavigate()
  const { confirm, toast } = useFeedback()
  const [moving, setMoving] = useState(false)
  const headings = useMemo(() => docHeadings(doc.body), [doc.body])
  const words = useMemo(() => countWords(doc.body), [doc.body])
  const showContents = headings.length >= MIN_TOC_HEADINGS
  const isRead = doc.status === 'read'
  const parent = folderTrail(folders, doc.folderId).at(-1)

  useReadingPosition(doc.id, doc.position)
  useEffect(() => {
    void markDocOpened(doc.id)
  }, [doc.id])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(doc.body)
      toast('Markdown copied')
    } catch {
      toast('Could not copy the text', { tone: 'error' })
    }
  }

  const remove = async () => {
    const ok = await confirm({ title: `Delete "${doc.title}"?`, body: 'This cannot be undone.', confirmLabel: 'Delete', danger: true })
    if (!ok) return
    await deleteDoc(doc.id)
    navigate(doc.folderId === DOC_ROOT ? '/docs' : `/docs/folder/${doc.folderId}`, { replace: true })
    toast('Doc deleted')
  }

  return (
    <div className={clsx('mx-auto flex w-full flex-col gap-5', showContents ? 'max-w-265' : 'max-w-200')}>
      <div className="flex flex-col gap-3">
        <Link to={parent ? `/docs/folder/${parent.id}` : '/docs'} className="inline-flex items-center gap-1 self-start rounded-img text-small text-muted transition-colors hover:text-ink">
          <ChevronLeft size={16} strokeWidth={1.8} className="rtl:rotate-180" aria-hidden />
          {parent?.name ?? 'Docs'}
        </Link>
        <PageHeader
          title={doc.title}
          subtitle={
            <div className="flex flex-wrap items-center gap-2">
              <Chip tone={isRead ? 'neutral' : 'sage'}>{DOC_STATUS_LABEL[doc.status]}</Chip>
              {doc.tags.map((tag) => (
                <Chip key={tag} tone="soft">
                  {tag}
                </Chip>
              ))}
              <span className="text-small">
                {docReadingMinutes(words)} min · updated {docDateLabel(doc.updatedAt).toLowerCase()}
              </span>
            </div>
          }
          actions={
            <>
              <div className="flex items-center">
                <Button
                  variant="ghost"
                  iconOnly
                  aria-label={doc.pinned ? 'Unpin' : 'Pin'}
                  title={doc.pinned ? 'Unpin' : 'Pin'}
                  aria-pressed={doc.pinned}
                  icon={doc.pinned ? <PinOff size={16} strokeWidth={1.8} /> : <Pin size={16} strokeWidth={1.8} />}
                  onClick={() => void setDocPinned(doc.id, !doc.pinned)}
                />
                <Button variant="ghost" iconOnly aria-label="Copy Markdown" title="Copy Markdown" icon={<Copy size={16} strokeWidth={1.8} />} onClick={() => void copy()} />
                <Button variant="ghost" iconOnly aria-label="Move doc" title="Move doc" icon={<FolderInput size={16} strokeWidth={1.8} />} onClick={() => setMoving(true)} />
                <Button variant="ghost" iconOnly aria-label="Delete doc" title="Delete doc" icon={<Trash2 size={16} strokeWidth={1.8} />} onClick={() => void remove()} />
              </div>
              <Button icon={isRead ? <RotateCcw size={15} strokeWidth={1.8} /> : <Check size={15} strokeWidth={2} />} onClick={() => void setDocStatus(doc.id, isRead ? 'toRead' : 'read')}>
                {isRead ? 'Mark to read' : 'Mark as read'}
              </Button>
              <Button icon={<Pencil size={15} strokeWidth={1.8} />} onClick={onEdit}>
                Edit
              </Button>
            </>
          }
        />
      </div>

      {showContents && (
        <Section className="px-5 py-3.5 lg:hidden">
          <details>
            <summary className="cursor-pointer text-small font-medium">On this page</summary>
            <div className="pt-2">
              <Contents headings={headings} />
            </div>
          </details>
        </Section>
      )}

      <div className="flex items-start gap-6">
        <Section className="min-w-0 flex-1 px-5 py-6 sm:px-8 sm:py-8">
          <DocMarkdown body={doc.body} hideTitle={opensWithTitle(doc.body, doc.title)} />
        </Section>
        {showContents && (
          <Section className="sticky top-8 hidden max-h-[calc(100dvh-4rem)] w-60 shrink-0 overflow-y-auto px-5 py-4 scrollbar-none lg:block">
            <p className="mb-1.5 text-small font-medium">On this page</p>
            <Contents headings={headings} />
          </Section>
        )}
      </div>

      {moving && <MoveDialog title={`Move "${doc.title}"`} folders={folders} current={doc.folderId} onClose={() => setMoving(false)} onMove={(target) => moveDoc(doc.id, target)} />}
    </div>
  )
}

function DocView({ doc, folders }: { doc: Doc; folders: DocFolder[] }) {
  const [editing, setEditing] = useState(false)
  if (editing) return <DocEditor doc={doc} folderId={doc.folderId} folders={folders} onCancel={() => setEditing(false)} onSaved={() => setEditing(false)} />
  return <DocReader doc={doc} folders={folders} onEdit={() => setEditing(true)} />
}

export function DocPage() {
  const { docId } = useParams()
  const doc = useDoc(docId)
  const folders = useDocFolders()
  const navigate = useNavigate()
  if (doc === undefined || !folders) return null
  if (!doc) {
    return (
      <EmptyState title="This doc is gone" action={<Button onClick={() => navigate('/docs')}>All docs</Button>}>
        It may have been deleted.
      </EmptyState>
    )
  }
  return <DocView key={doc.id} doc={doc} folders={folders} />
}
