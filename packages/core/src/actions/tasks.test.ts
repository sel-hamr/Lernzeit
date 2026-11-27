import { beforeEach, describe, expect, it } from 'vitest'
import type { Task } from '../types'
import { expectCode, makeStore, NOW } from './fixture.test-utils'
import { runAction } from './index'

let store: ReturnType<typeof makeStore>

beforeEach(() => {
  store = makeStore()
})

describe('create_task', () => {
  it('adds a task to To do with medium priority by default', async () => {
    const task = await runAction(store, 'create_task', { title: 'Review food words', topic: 'German', dueDate: '2026-10-20' })
    expect(task).toMatchObject({ title: 'Review food words', status: 'todo', priority: 'medium', dueDate: '2026-10-20', topic: 'German' })
    expect(await store.get<Task>('tasks', task.id)).toEqual({
      id: task.id, title: 'Review food words', topicId: 'german', priority: 'medium', status: 'todo', dueDate: '2026-10-20', order: -1, createdAt: NOW,
    })
  })

  it('puts a new task at the top of its column, and stamps a done one', async () => {
    store.put('tasks', { id: 't-1', title: 'Old', priority: 'low', status: 'done', order: -3, createdAt: 1, doneAt: 1 })
    await store.commit()
    const task = await runAction(store, 'create_task', { title: ' Finished ', description: '  ', status: 'done', priority: 'high' })
    expect(await store.get<Task>('tasks', task.id)).toEqual({ id: task.id, title: 'Finished', priority: 'high', status: 'done', order: -4, createdAt: NOW, doneAt: NOW })
  })

  it('rejects a bad due date', async () => {
    await expectCode(runAction(store, 'create_task', { title: 'Later', dueDate: 'next friday' }), 'invalid_input')
  })
})
