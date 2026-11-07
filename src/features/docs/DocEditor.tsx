import { useEffect, useRef, useState, type ClipboardEvent, type DragEvent } from 'react'
import { useBlocker } from 'react-router'
import { Save } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Field, Input, Segmented, Select, Textarea } from '@/components/ui/form'
import { PageHeader, Section } from '@/components/ui/primitives'
import { useFeedback } from '@/components/ui/feedback'
import { addDocImage, removeUnusedDocImages, saveDoc } from '@/data/docs'
import type { Doc, DocFolder } from '@/db/types'
import { DOC_ROOT, docImageUrl, firstHeading, folderChoices, parseTags } from '@/lib/docs'
import { imageFromDataTransfer, prepareImage } from '@/lib/image'
import { DocMarkdown } from './DocMarkdown'

/** Wide enough to read a screenshot, and much smaller than the file a screen capture pastes. */
const MAX_DOC_IMAGE_WIDTH = 1400

/** Writes a new doc, or changes one. Leaving with unsaved changes asks first. */
export function DocEditor({
  doc,
  folderId,
  folders,
  onCancel,
  onSaved,
}: {
  doc?: Doc
  folderId: string
  folders: DocFolder[]
  onCancel: () => void
  onSaved: (doc: Doc) => void
}) {
  const [title, setTitle] = useState(doc?.title ?? '')
  // A title you typed or a saved one stays. Otherwise it follows the text's first heading.
  const [titleTouched, setTitleTouched] = useState(!!doc)
  const [body, setBody] = useState(doc?.body ?? '')
  const [tags, setTags] = useState(doc?.tags.join(', ') ?? '')
  const [folder, setFolder] = useState(folderId)
  const [preview, setPreview] = useState(false)
  const [saving, setSaving] = useState(false)
  const textarea = useRef<HTMLTextAreaElement>(null)
  const addedImages = useRef(new Set<string>())
  const finished = useRef(false)
  const { confirm, toast } = useFeedback()

  const dirty =
    title !== (doc?.title ?? '') || body !== (doc?.body ?? '') || folder !== folderId || parseTags(tags).join('\n') !== (doc?.tags ?? []).join('\n')

  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && !finished.current && currentLocation.pathname !== nextLocation.pathname)
  useEffect(() => {
    if (blocker.state !== 'blocked') return
    void confirm({ title: 'Leave without saving?', body: 'Your changes to this doc are lost.', confirmLabel: 'Leave', danger: true }).then((leave) => {
      if (leave) blocker.proceed()
      else blocker.reset()
    })
  }, [blocker, confirm])

  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  // Pictures pasted and then not kept in the text go away with the editor.
  useEffect(() => {
    const added = addedImages.current
    return () => void removeUnusedDocImages(added)
  }, [])

  const changeBody = (value: string) => {
    setBody(value)
    if (!titleTouched) setTitle(firstHeading(value))
  }

  const addImage = async (file: File) => {
    const start = textarea.current?.selectionStart ?? body.length
    const end = textarea.current?.selectionEnd ?? body.length
    try {
      const id = await addDocImage(await prepareImage(file, MAX_DOC_IMAGE_WIDTH))
      addedImages.current.add(id)
      const name = file.name.replace(/\.[^.]+$/, '').replace(/[[\]]/g, '') || 'image'
      setBody((text) => `${text.slice(0, start)}![${name}](${docImageUrl(id)})${text.slice(end)}`)
    } catch {
      toast('Could not add this image', { tone: 'error' })
    }
  }

  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    // Copying from a page can bring a picture of the text along. The text is what was meant.
    if (e.clipboardData.getData('text/plain')) return
    const image = imageFromDataTransfer(e.clipboardData)
    if (!image) return
    e.preventDefault()
    void addImage(image)
  }

  const onDrop = (e: DragEvent<HTMLTextAreaElement>) => {
    const image = imageFromDataTransfer(e.dataTransfer)
    if (!image) return
    e.preventDefault()
    void addImage(image)
  }

  const save = async () => {
    if (saving) return
    setSaving(true)
    finished.current = true
    try {
      onSaved(await saveDoc({ title, body, folderId: folder, tags: parseTags(tags) }, doc?.id))
    } catch (error) {
      finished.current = false
      setSaving(false)
      toast(error instanceof Error ? error.message : 'Could not save this doc', { tone: 'error' })
    }
  }

  const cancel = async () => {
    if (dirty && !(await confirm({ title: 'Discard your changes?', confirmLabel: 'Discard', danger: true }))) return
    finished.current = true
    onCancel()
  }

  return (
    <div
      className="contents"
      onKeyDown={(e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
          e.preventDefault()
          void save()
        }
      }}
    >
      <PageHeader
        title={doc ? 'Edit doc' : 'New doc'}
        actions={
          <>
            <Segmented<'write' | 'preview'>
              label="Write or preview"
              value={preview ? 'preview' : 'write'}
              onChange={(mode) => setPreview(mode === 'preview')}
              options={[
                { value: 'write', label: 'Write' },
                { value: 'preview', label: 'Preview' },
              ]}
            />
            <Button variant="ghost" onClick={() => void cancel()}>
              Cancel
            </Button>
            <Button variant="primary" icon={<Save size={15} strokeWidth={1.8} />} disabled={saving || !body.trim()} onClick={() => void save()}>
              Save
            </Button>
          </>
        }
      />

      {preview ? (
        <Section className="px-5 py-6 sm:px-8 sm:py-8">
          <DocMarkdown body={body} />
        </Section>
      ) : (
        <Section className="flex flex-col gap-5 p-5 sm:p-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Title" htmlFor="doc-title" hint="Filled in from the first # heading" className="sm:col-span-2">
              <Input
                id="doc-title"
                value={title}
                maxLength={200}
                autoComplete="off"
                onChange={(e) => {
                  setTitle(e.target.value)
                  setTitleTouched(true)
                }}
              />
            </Field>
            <Field label="Folder" htmlFor="doc-folder">
              <Select id="doc-folder" value={folder} onChange={(e) => setFolder(e.target.value)}>
                <option value={DOC_ROOT}>Top level</option>
                {folderChoices(folders).map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.path}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Markdown" htmlFor="doc-body" hint="Paste your text here. You can paste or drop images too.">
            <Textarea
              id="doc-body"
              ref={textarea}
              autoFocus={!doc}
              dir="auto"
              spellCheck={false}
              value={body}
              onChange={(e) => changeBody(e.target.value)}
              onPaste={onPaste}
              onDrop={onDrop}
              className="min-h-[50dvh] font-mono text-small leading-relaxed"
            />
          </Field>
          <Field label="Tags" htmlFor="doc-tags" hint="Separate them with commas">
            <Input id="doc-tags" value={tags} autoComplete="off" onChange={(e) => setTags(e.target.value)} />
          </Field>
        </Section>
      )}
    </div>
  )
}
