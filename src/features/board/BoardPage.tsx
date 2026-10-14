import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import clsx from 'clsx'
import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { AlignLeft, CalendarClock, Plus } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Dot, PageHeader, PriorityChip } from '@/components/ui/primitives'
import { Segmented, TextSelect } from '@/components/ui/form'
import { useUI } from '@/app/ui'
import type { Priority, Task, TaskStatus, Topic } from '@/db/types'
import { useTasks, useToday, useTopics } from '@/data/hooks'
import { isDueToday, isOverdue, setColumnOrder, STATUS_LABEL, STATUSES } from '@/data/tasks'
import { addDays, formatDayMonthShort } from '@/lib/time'

type Columns = Record<TaskStatus, string[]>

function dueLabel(task: Task, today: string): string {
  if (!task.dueDate) return ''
  if (task.dueDate === today) return 'Due today'
  if (task.dueDate === addDays(today, 1)) return 'Tomorrow'
  if (task.dueDate === addDays(today, -1)) return 'Yesterday'
  return formatDayMonthShort(task.dueDate)
}

function TaskCardBody({ task, topic, today, dragging }: { task: Task; topic?: Topic; today: string; dragging?: boolean }) {
  const overdue = isOverdue(task, today)
  const done = task.status === 'done'
  return (
    <div
      className={clsx(
        'flex flex-col gap-2.5 rounded-row border border-line bg-main p-3.5 text-left',
        dragging ? 'rotate-[1.5deg] shadow-popup' : 'transition-shadow hover:shadow-nav',
      )}
    >
      <div className={clsx('text-body leading-snug font-medium', done && 'text-muted line-through')}>{task.title}</div>
      {task.description && (
        <div className="flex items-start gap-1.5 text-chip text-muted">
          <AlignLeft size={13} strokeWidth={1.8} className="mt-px shrink-0" />
          <span className="line-clamp-2">{task.description}</span>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-chip">
        {topic && (
          <span className="flex items-center gap-1.5 text-ink-2">
            <Dot color={topic.color} />
            {topic.name}
          </span>
        )}
        {task.dueDate && (
          <span className={clsx('flex items-center gap-1 tabular-nums', overdue ? 'font-medium text-red-ink' : task.dueDate === today && !done ? 'text-red-ink' : 'text-muted')}>
            <CalendarClock size={13} strokeWidth={1.8} />
            {overdue ? `Overdue · ${dueLabel(task, today)}` : dueLabel(task, today)}
          </span>
        )}
        <PriorityChip priority={task.priority} className="ml-auto" />
      </div>
    </div>
  )
}

function SortableTask({ task, topic, today, onOpen }: { task: Task; topic?: Topic; today: string; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id, data: { status: task.status } })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={clsx('touch-manipulation', isDragging && 'opacity-40')}
      {...attributes}
      {...listeners}
      onClick={onOpen}
      onKeyDown={(e) => {
        listeners?.onKeyDown?.(e)
        if (e.key === 'Enter' && !e.defaultPrevented) onOpen()
      }}
      aria-label={`${task.title}. Press space to move, enter to edit.`}
    >
      <TaskCardBody task={task} topic={topic} today={today} />
    </div>
  )
}

function Column({ status, ids, tasks, topics, today, onAdd, onOpen }: { status: TaskStatus; ids: string[]; tasks: Map<string, Task>; topics: Map<string, Topic>; today: string; onAdd: () => void; onOpen: (id: string) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: status })
  return (
    <section
      aria-label={STATUS_LABEL[status]}
      className={clsx(
        'flex w-[82vw] max-w-80 shrink-0 snap-start flex-col gap-3 rounded-section border border-line bg-soft p-3 transition-colors md:w-auto md:max-w-none md:min-w-0 md:flex-1',
        isOver && 'border-sage-border bg-sage/40',
      )}
    >
      <div className="flex items-center justify-between px-1.5 pt-0.5">
        <h2 className="flex items-center gap-2 text-body font-semibold">
          {STATUS_LABEL[status]}
          <span className="text-chip font-normal text-muted tabular-nums">{ids.length}</span>
        </h2>
        <button type="button" onClick={onAdd} aria-label={`Add task to ${STATUS_LABEL[status]}`} className="flex size-7 items-center justify-center rounded-full text-muted hover:bg-main hover:text-ink">
          <Plus size={16} strokeWidth={1.8} />
        </button>
      </div>
      <SortableContext id={status} items={ids} strategy={verticalListSortingStrategy}>
        <div ref={setNodeRef} className="flex min-h-30 flex-1 flex-col gap-2.5">
          {ids.map((id) => {
            const task = tasks.get(id)
            if (!task) return null
            return <SortableTask key={id} task={task} topic={task.topicId ? topics.get(task.topicId) : undefined} today={today} onOpen={() => onOpen(id)} />
          })}
          {ids.length === 0 && (
            <button type="button" onClick={onAdd} className="flex flex-1 items-center justify-center rounded-row border border-dashed border-line-strong py-6 text-small text-muted hover:bg-main hover:text-ink">
              {status === 'backlog' ? 'Park ideas for later here' : 'Drop tasks here'}
            </button>
          )}
        </div>
      </SortableContext>
    </section>
  )
}

/** Fills the visible slots of a column with the new order and keeps filtered-out tasks where they were. */
function mergeOrder(full: string[], visibleOrder: string[], visible: Set<string>): string[] {
  const queue = [...visibleOrder]
  const out: string[] = []
  for (const id of full) {
    if (!visible.has(id)) out.push(id)
    else if (queue.length) out.push(queue.shift()!)
  }
  return [...out, ...queue]
}

export default function BoardPage() {
  const tasks = useTasks()
  const topics = useTopics(true)
  const today = useToday()
  const { openTaskEditor } = useUI()
  const [params, setParams] = useSearchParams()
  const [scope, setScope] = useState<'all' | 'today'>('all')
  const [topicFilter, setTopicFilter] = useState('all')
  const [priorityFilter, setPriorityFilter] = useState<'all' | Priority>('all')
  const [activeId, setActiveId] = useState<string | null>(null)
  const [dragColumns, setDragColumns] = useState<Columns | null>(null)

  // Opened from search: /board?task=<id>
  const taskParam = params.get('task')
  useEffect(() => {
    if (!taskParam) return
    openTaskEditor({ taskId: taskParam })
    const next = new URLSearchParams(params)
    next.delete('task')
    setParams(next, { replace: true })
  }, [taskParam, params, setParams, openTaskEditor])

  const taskMap = useMemo(() => new Map((tasks ?? []).map((t) => [t.id, t])), [tasks])
  const topicMap = useMemo(() => new Map(topics.map((t) => [t.id, t])), [topics])

  const passes = (t: Task) =>
    (scope === 'all' || isDueToday(t, today)) &&
    (topicFilter === 'all' || (topicFilter === 'none' ? !t.topicId : t.topicId === topicFilter)) &&
    (priorityFilter === 'all' || t.priority === priorityFilter)

  const fullColumns = useMemo(() => {
    const cols: Columns = { backlog: [], todo: [], doing: [], done: [] }
    for (const t of [...(tasks ?? [])].sort((a, b) => a.order - b.order)) cols[t.status].push(t.id)
    return cols
  }, [tasks])

  const filteredColumns = useMemo(() => {
    const cols: Columns = { backlog: [], todo: [], doing: [], done: [] }
    for (const s of STATUSES) cols[s] = fullColumns[s].filter((id) => passes(taskMap.get(id)!))
    return cols
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullColumns, taskMap, scope, topicFilter, priorityFilter, today])

  const columns = dragColumns ?? filteredColumns

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const findColumn = (id: string, cols: Columns): TaskStatus | undefined => {
    if ((STATUSES as string[]).includes(id)) return id as TaskStatus
    return STATUSES.find((s) => cols[s].includes(id))
  }

  const onDragStart = (e: DragStartEvent) => {
    setActiveId(String(e.active.id))
    setDragColumns(filteredColumns)
  }

  const onDragOver = (e: DragOverEvent) => {
    const { active, over } = e
    if (!over || !dragColumns) return
    const from = findColumn(String(active.id), dragColumns)
    const to = findColumn(String(over.id), dragColumns)
    if (!from || !to || from === to) return
    setDragColumns((cols) => {
      if (!cols) return cols
      const source = cols[from].filter((id) => id !== active.id)
      const target = [...cols[to]]
      const overIndex = target.indexOf(String(over.id))
      target.splice(overIndex >= 0 ? overIndex : target.length, 0, String(active.id))
      return { ...cols, [from]: source, [to]: target }
    })
  }

  const onDragEnd = async (e: DragEndEvent) => {
    const { active, over } = e
    const cols = dragColumns
    setActiveId(null)
    if (!over || !cols) {
      setDragColumns(null)
      return
    }
    const id = String(active.id)
    const to = findColumn(String(over.id), cols)
    if (!to) {
      setDragColumns(null)
      return
    }
    let visibleOrder = cols[to]
    const oldIndex = visibleOrder.indexOf(id)
    const newIndex = visibleOrder.indexOf(String(over.id))
    if (oldIndex >= 0 && newIndex >= 0 && oldIndex !== newIndex) visibleOrder = arrayMove(visibleOrder, oldIndex, newIndex)

    const original = taskMap.get(id)
    const visible = new Set(visibleOrder)
    const base = fullColumns[to].filter((x) => x !== id)
    const fullOrder = mergeOrder(base, visibleOrder, visible)
    await setColumnOrder(to, fullOrder)
    if (original && original.status !== to) {
      // Re-number the column it left so orders stay tidy.
      await setColumnOrder(original.status, fullColumns[original.status].filter((x) => x !== id))
    }
    setDragColumns(null)
  }

  const open = (tasks ?? []).filter((t) => t.status !== 'done').length
  const overdue = (tasks ?? []).filter((t) => isOverdue(t, today)).length
  const activeTask = activeId ? taskMap.get(activeId) : undefined

  return (
    <>
      <PageHeader
        title="Board"
        subtitle={`${open} open ${open === 1 ? 'task' : 'tasks'}${overdue ? ` · ${overdue} overdue` : ''}`}
        actions={
          <Button variant="primary" icon={<Plus size={16} strokeWidth={1.8} />} onClick={() => openTaskEditor({ status: 'todo' })}>
            Add task
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Segmented
          label="Show"
          value={scope}
          onChange={setScope}
          options={[
            { value: 'all', label: 'All tasks' },
            { value: 'today', label: 'Today', count: (tasks ?? []).filter((t) => isDueToday(t, today)).length },
          ]}
        />
        <TextSelect label="Filter by topic" value={topicFilter} onChange={setTopicFilter}>
          <option value="all">All topics</option>
          {topics.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
          <option value="none">No topic</option>
        </TextSelect>
        <TextSelect label="Filter by priority" value={priorityFilter} onChange={(v) => setPriorityFilter(v as 'all' | Priority)}>
          <option value="all">Any priority</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </TextSelect>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={(e) => void onDragEnd(e)} onDragCancel={() => (setActiveId(null), setDragColumns(null))}>
        <div className="-mx-4 flex snap-x snap-mandatory scroll-px-4 items-stretch gap-3 overflow-x-auto px-4 pb-2 scrollbar-none md:mx-0 md:gap-4 md:overflow-visible md:px-0">
          {STATUSES.map((status) => (
            <Column
              key={status}
              status={status}
              ids={columns[status]}
              tasks={taskMap}
              topics={topicMap}
              today={today}
              onAdd={() => openTaskEditor({ status, topicId: topicFilter !== 'all' && topicFilter !== 'none' ? topicFilter : undefined, dueDate: scope === 'today' ? today : undefined })}
              onOpen={(id) => openTaskEditor({ taskId: id })}
            />
          ))}
        </div>
        <DragOverlay dropAnimation={{ duration: 180, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' }}>
          {activeTask && <TaskCardBody task={activeTask} topic={activeTask.topicId ? topicMap.get(activeTask.topicId) : undefined} today={today} dragging />}
        </DragOverlay>
      </DndContext>
    </>
  )
}
