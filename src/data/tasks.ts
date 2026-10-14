import { db, newId, type LernzeitDB } from '@/db/db'
import type { Task, TaskStatus } from '@/db/types'

export const STATUSES: TaskStatus[] = ['backlog', 'todo', 'doing', 'done']
export const STATUS_LABEL: Record<TaskStatus, string> = {
  backlog: 'Backlog',
  todo: 'To do',
  doing: 'Doing',
  done: 'Done',
}

export type TaskInput = Pick<Task, 'title' | 'description' | 'topicId' | 'priority' | 'status' | 'dueDate'>

async function topOrder(database: LernzeitDB, status: TaskStatus): Promise<number> {
  const tasks = await database.tasks.where('status').equals(status).toArray()
  return tasks.reduce((min, t) => Math.min(min, t.order), 0) - 1
}

export async function createTask(input: TaskInput, database: LernzeitDB = db): Promise<Task> {
  const now = Date.now()
  const task: Task = {
    ...input,
    title: input.title.trim(),
    description: input.description?.trim() || undefined,
    id: newId(),
    order: await topOrder(database, input.status),
    createdAt: now,
    doneAt: input.status === 'done' ? now : undefined,
  }
  await database.tasks.add(task)
  return task
}

export async function updateTask(id: string, patch: Partial<TaskInput>, database: LernzeitDB = db) {
  await database.transaction('rw', database.tasks, async () => {
    const task = await database.tasks.get(id)
    if (!task) return
    const next: Task = { ...task, ...patch }
    if (patch.title !== undefined) next.title = patch.title.trim() || task.title
    if (patch.description !== undefined) next.description = patch.description.trim() || undefined
    if (patch.status && patch.status !== task.status) {
      next.order = await topOrder(database, patch.status)
      next.doneAt = patch.status === 'done' ? Date.now() : undefined
    }
    await database.tasks.put(next)
  })
}

/** Ticking a task on the Today page moves it to Done (and back to To do). */
export async function toggleTaskDone(id: string, database: LernzeitDB = db) {
  const task = await database.tasks.get(id)
  if (!task) return
  await updateTask(id, { status: task.status === 'done' ? 'todo' : 'done' }, database)
}

/**
 * Persists a column's order after a drag. `ids` is the full new order of the
 * destination column; tasks that changed column get their new status.
 */
export async function setColumnOrder(status: TaskStatus, ids: string[], database: LernzeitDB = db) {
  await database.transaction('rw', database.tasks, async () => {
    const now = Date.now()
    const tasks = await database.tasks.bulkGet(ids)
    await database.tasks.bulkPut(
      tasks
        .filter((t): t is Task => !!t)
        .map((t) => ({
          ...t,
          order: ids.indexOf(t.id),
          status,
          doneAt: status === 'done' ? (t.status === 'done' ? t.doneAt : now) : undefined,
        })),
    )
  })
}

export async function deleteTask(id: string, database: LernzeitDB = db) {
  await database.tasks.delete(id)
}

export async function restoreTask(task: Task, database: LernzeitDB = db) {
  await database.tasks.put(task)
}

export function isOverdue(task: Pick<Task, 'dueDate' | 'status'>, today: string): boolean {
  return !!task.dueDate && task.status !== 'done' && task.dueDate < today
}

export function isDueToday(task: Pick<Task, 'dueDate' | 'status'>, today: string): boolean {
  return !!task.dueDate && task.status !== 'done' && task.dueDate <= today
}
