import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Field, Input, Select } from '@/components/ui/form'
import { useFeedback } from '@/components/ui/feedback'
import type { DocFolder } from '@/db/types'
import { DOC_ROOT, folderChoices } from '@/lib/docs'

/** Asks for a folder's name, to make or rename a folder. */
export function FolderNameDialog({
  title,
  action,
  initial = '',
  onClose,
  onSave,
}: {
  title: string
  action: string
  initial?: string
  onClose: () => void
  onSave: (name: string) => Promise<unknown>
}) {
  const [name, setName] = useState(initial)
  const { toast } = useFeedback()
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    try {
      await onSave(name)
      onClose()
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not save the folder', { tone: 'error' })
    }
  }
  return (
    <Dialog
      open
      onClose={onClose}
      size="sm"
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="doc-folder-name" disabled={!name.trim()}>
            {action}
          </Button>
        </>
      }
    >
      <form id="doc-folder-name" onSubmit={(e) => void submit(e)}>
        <Field label="Name" htmlFor="doc-folder-name-input">
          <Input id="doc-folder-name-input" autoFocus value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
        </Field>
      </form>
    </Dialog>
  )
}

/** Picks a folder to move a doc or folder to. */
export function MoveDialog({
  title,
  folders,
  current,
  without,
  onClose,
  onMove,
}: {
  title: string
  folders: DocFolder[]
  current: string
  /** A folder that is moving: it and its subfolders are not offered. */
  without?: string
  onClose: () => void
  onMove: (folderId: string) => Promise<unknown>
}) {
  const [target, setTarget] = useState(current)
  const { toast } = useFeedback()
  const move = async () => {
    try {
      await onMove(target)
      onClose()
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not move it', { tone: 'error' })
    }
  }
  return (
    <Dialog
      open
      onClose={onClose}
      size="sm"
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={target === current} onClick={() => void move()}>
            Move
          </Button>
        </>
      }
    >
      <Field label="Move to" htmlFor="doc-move-target">
        <Select id="doc-move-target" value={target} onChange={(e) => setTarget(e.target.value)}>
          <option value={DOC_ROOT}>Top level</option>
          {folderChoices(folders, without).map((f) => (
            <option key={f.id} value={f.id}>
              {f.path}
            </option>
          ))}
        </Select>
      </Field>
    </Dialog>
  )
}
