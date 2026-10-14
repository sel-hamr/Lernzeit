import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { Field, Input, Segmented, Select, Textarea } from '@/components/ui/form'
import { useFeedback } from '@/components/ui/feedback'
import { db } from '@/db/db'
import type { Priority, Task, TaskStatus } from '@/db/types'
import { useTopics } from '@/data/hooks'
import { createTask, deleteTask, restoreTask, STATUS_LABEL, STATUSES, updateTask } from '@/data/tasks'
import type { TaskEditorRequest } from '@/app/ui'
import { addDays, dateKey, formatDayMonth } from '@/lib/time'

const PRIORITY_OPTIONS: { value: Priority; label: React.ReactNode }[] = [
  { value: 'high', label: <span className="text-red-ink">High</span> },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: <span className="text-sage-ink">Low</span> },
]

export function TaskEditorDialog({ request, onClose }: { request: TaskEditorRequest | null; onClose: () => void }) {
  const task = useLiveQuery(() => (request?.taskId ? db.tasks.get(request.taskId) : undefined), [request?.taskId])
  const loading = !!request?.taskId && !task
  return (
    <Dialog open={!!request} onClose={onClose} title={request?.taskId ? 'Edit task' : 'New task'}>
      {request && !loading && <TaskForm key={request.taskId ?? 'new'} task={task} request={request} onDone={onClose} />}
    </Dialog>
  )
}

function TaskForm({ task, request, onDone }: { task?: Task; request: TaskEditorRequest; onDone: () => void }) {
  const topics = useTopics()
  const { toast } = useFeedback()
  const [title, setTitle] = useState(task?.title ?? '')
  const [description, setDescription] = useState(task?.description ?? '')
  const [status, setStatus] = useState<TaskStatus>(task?.status ?? request.status ?? 'todo')
  const [priority, setPriority] = useState<Priority>(task?.priority ?? 'medium')
  const [topicId, setTopicId] = useState(task?.topicId ?? request.topicId ?? '')
  const [dueDate, setDueDate] = useState(task?.dueDate ?? request.dueDate ?? '')
  const [error, setError] = useState('')
  const today = dateKey()

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) {
      setError('Give the task a title')
      return
    }
    const input = { title, description, status, priority, topicId: topicId || undefined, dueDate: dueDate || undefined }
    if (task) await updateTask(task.id, input)
    else await createTask(input)
    toast(task ? 'Task saved' : 'Task added')
    onDone()
  }

  const remove = async () => {
    if (!task) return
    await deleteTask(task.id)
    toast('Task deleted', { action: { label: 'Undo', onClick: () => void restoreTask(task) } })
    onDone()
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <Field label="Title" htmlFor="task-title" error={error}>
        <Input
          id="task-title"
          autoFocus={!task}
          value={title}
          onChange={(e) => {
            setTitle(e.target.value)
            setError('')
          }}
          placeholder="Akkusativ exercises, chapter 4"
          maxLength={160}
        />
      </Field>
      <Field label="Description" htmlFor="task-description">
        <Textarea id="task-description" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional details" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Column" htmlFor="task-status">
          <Select id="task-status" value={status} onChange={(e) => setStatus(e.target.value as TaskStatus)}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Topic" htmlFor="task-topic">
          <Select id="task-topic" value={topicId} onChange={(e) => setTopicId(e.target.value)}>
            <option value="">No topic</option>
            {topics.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Priority">
        <Segmented label="Priority" options={PRIORITY_OPTIONS} value={priority} onChange={setPriority} size="sm" className="self-start" />
      </Field>
      <Field label="Due date" htmlFor="task-due">
        <div className="flex flex-wrap items-center gap-2">
          <Input id="task-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="w-auto min-w-40" />
          <Button size="sm" variant={dueDate === today ? 'soft' : 'ghost'} onClick={() => setDueDate(today)}>
            Today
          </Button>
          <Button size="sm" variant={dueDate === addDays(today, 1) ? 'soft' : 'ghost'} onClick={() => setDueDate(addDays(today, 1))}>
            Tomorrow
          </Button>
          {dueDate && (
            <Button size="sm" variant="ghost" onClick={() => setDueDate('')}>
              Clear
            </Button>
          )}
        </div>
      </Field>
      <div className="flex flex-wrap items-center gap-2 pt-1">
        {task && (
          <>
            <Button variant="ghost" className="text-red-ink hover:text-red-ink" icon={<Trash2 size={15} strokeWidth={1.8} />} onClick={() => void remove()}>
              Delete
            </Button>
            <span className="text-chip text-muted">Created {formatDayMonth(dateKey(task.createdAt))}</span>
          </>
        )}
        <div className="ml-auto flex gap-2">
          <Button variant="ghost" onClick={onDone}>
            Cancel
          </Button>
          <Button variant="primary" type="submit">
            {task ? 'Save' : 'Add task'}
          </Button>
        </div>
      </div>
    </form>
  )
}
