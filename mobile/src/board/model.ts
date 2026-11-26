/*
 * What the board shows: the four columns in order with the filters applied, and each task's due
 * line, as on the web's BoardPage.
 */
import { addDays, formatDayMonthShort } from '@lernzeit/core/time'
import type { Priority, Task, TaskStatus } from '@lernzeit/core/types'

export const STATUSES: TaskStatus[] = ['backlog', 'todo', 'doing', 'done']
export const STATUS_LABEL: Record<TaskStatus, string> = { backlog: 'Backlog', todo: 'To do', doing: 'Doing', done: 'Done' }
export const PRIORITIES: Priority[] = ['high', 'medium', 'low']
export const PRIORITY_LABEL: Record<Priority, string> = { high: 'High', medium: 'Medium', low: 'Low' }

export const isOverdue = (task: Pick<Task, 'dueDate' | 'status'>, today: string): boolean => !!task.dueDate && task.status !== 'done' && task.dueDate < today
export const isDueToday = (task: Pick<Task, 'dueDate' | 'status'>, today: string): boolean => !!task.dueDate && task.status !== 'done' && task.dueDate <= today

export interface BoardFilter {
  scope: 'all' | 'today'
  /** A topic id, 'none' for tasks without one, or 'all'. */
  topic: string
  priority: 'all' | Priority
}

export const ALL_TASKS: BoardFilter = { scope: 'all', topic: 'all', priority: 'all' }

export function boardColumns(tasks: Task[], filter: BoardFilter, today: string): Record<TaskStatus, Task[]> {
  const cols: Record<TaskStatus, Task[]> = { backlog: [], todo: [], doing: [], done: [] }
  const passes = (t: Task) =>
    (filter.scope === 'all' || isDueToday(t, today)) && (filter.topic === 'all' || (filter.topic === 'none' ? !t.topicId : t.topicId === filter.topic)) && (filter.priority === 'all' || t.priority === filter.priority)
  for (const t of [...tasks].sort((a, b) => a.order - b.order)) if (passes(t)) cols[t.status].push(t)
  return cols
}

/** "Due today", "Tomorrow", "Yesterday", "Overdue · 3 Nov" or a short date. */
export function dueLabel(task: Pick<Task, 'dueDate' | 'status'>, today: string): string {
  if (!task.dueDate) return ''
  const day = task.dueDate === today ? 'Due today' : task.dueDate === addDays(today, 1) ? 'Tomorrow' : task.dueDate === addDays(today, -1) ? 'Yesterday' : formatDayMonthShort(task.dueDate)
  return isOverdue(task, today) ? `Overdue · ${day}` : day
}

/** The due-date choices in the task sheet. */
export const dueChoices = (today: string): { label: string; value: string }[] => [
  { label: 'None', value: '' },
  { label: 'Today', value: today },
  { label: 'Tomorrow', value: addDays(today, 1) },
  { label: 'In a week', value: addDays(today, 7) },
]
