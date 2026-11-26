/*
 * The board's tasks over the local library, with the web's rules (src/data/tasks.ts): a new or
 * moved task goes to the top of its column, Done stamps when it was done, and a task can move up
 * or down within its column.
 */
import type { Task, TaskStatus } from '@lernzeit/core/types'
import { newId } from '../data/ids'
import type { LocalLibrary } from '../store/library'
import { useLiveQuery } from '../store/live'

export type TaskInput = Pick<Task, 'title' | 'description' | 'topicId' | 'priority' | 'status' | 'dueDate'>

export const useTasks = (): Task[] => useLiveQuery(['tasks'], (l) => l.list<Task>('tasks'), [])

const topOrder = (library: LocalLibrary, status: TaskStatus) => library.list<Task>('tasks', { status }).reduce((min, t) => Math.min(min, t.order), 0) - 1

export function createTask(library: LocalLibrary, input: TaskInput, now = Date.now()): Task {
  const title = input.title.trim()
  if (!title) throw new Error('A task needs a title')
  return library.write(() => {
    const task: Task = { ...input, title, description: input.description?.trim() || undefined, dueDate: input.dueDate || undefined, topicId: input.topicId || undefined, id: newId(), order: topOrder(library, input.status), createdAt: now, doneAt: input.status === 'done' ? now : undefined }
    library.put('tasks', task)
    return task
  })
}

export function updateTask(library: LocalLibrary, id: string, patch: Partial<TaskInput>, now = Date.now()): void {
  library.write(() => {
    const task = library.get<Task>('tasks', id)
    if (!task) return
    const next: Task = { ...task, ...patch }
    if (patch.title !== undefined) next.title = patch.title.trim() || task.title
    if (patch.description !== undefined) next.description = patch.description.trim() || undefined
    if (patch.topicId !== undefined) next.topicId = patch.topicId || undefined
    if (patch.dueDate !== undefined) next.dueDate = patch.dueDate || undefined
    if (patch.status && patch.status !== task.status) {
      next.order = topOrder(library, patch.status)
      next.doneAt = patch.status === 'done' ? now : undefined
    }
    library.put('tasks', next)
  })
}

export const deleteTask = (library: LocalLibrary, id: string) => library.remove('tasks', id)

/** Swaps a task with its neighbour above (-1) or below (+1) in its column; the column is renumbered. */
export function shiftTask(library: LocalLibrary, id: string, by: -1 | 1): void {
  library.write(() => {
    const task = library.get<Task>('tasks', id)
    if (!task) return
    const column = library.list<Task>('tasks', { status: task.status }).sort((a, b) => a.order - b.order)
    const at = column.findIndex((t) => t.id === id)
    const to = at + by
    if (to < 0 || to >= column.length) return
    ;[column[at], column[to]] = [column[to], column[at]]
    column.forEach((t, i) => {
      if (t.order !== i) library.put('tasks', { ...t, order: i })
    })
  })
}
