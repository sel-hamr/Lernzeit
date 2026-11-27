import type { CreateTaskParams, TaskSummary } from '../protocol'
import type { Task } from '../types'
import { findTopic, invalid, type ActionContext } from './shared'

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/

export async function createTask(
  { title, description, priority = 'medium', status = 'todo', dueDate, topic }: CreateTaskParams,
  ctx: ActionContext,
): Promise<TaskSummary> {
  if (!title.trim()) throw invalid('A task needs a title.')
  if (dueDate && (!DATE_KEY_RE.test(dueDate) || Number.isNaN(Date.parse(dueDate)))) throw invalid('dueDate must be a date like 2026-10-20.')
  const linked = topic ? await findTopic(ctx, topic) : undefined
  // A new task goes on top of its column, as on the task board.
  const column = await ctx.store.list<Task>('tasks', { status })
  const task: Task = {
    title: title.trim(),
    description: description?.trim() || undefined,
    topicId: linked?.id,
    priority,
    status,
    dueDate,
    id: ctx.newId(),
    order: column.reduce((min, t) => Math.min(min, t.order), 0) - 1,
    createdAt: ctx.now,
    doneAt: status === 'done' ? ctx.now : undefined,
  }
  ctx.store.put('tasks', task)
  return { id: task.id, title: task.title, status: task.status, priority: task.priority, dueDate: task.dueDate, topic: linked?.name }
}
