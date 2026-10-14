import { db, newId, type LernzeitDB } from '@/db/db'
import type { Session, Topic, TopicColor, WeekGoals } from '@/db/types'
import { withGoalChange } from '@/lib/goals'
import { splitAtMidnight } from '@/lib/sessions'
import { dateKey, MINUTE } from '@/lib/time'

export async function createTopic(input: { name: string; color: TopicColor; goals: WeekGoals }, database: LernzeitDB = db) {
  const now = Date.now()
  const order = ((await database.topics.orderBy('order').last())?.order ?? -1) + 1
  const topic: Topic = {
    id: newId(),
    name: input.name.trim(),
    color: input.color,
    goalMinutes: input.goals,
    goalHistory: [{ since: dateKey(now), goals: input.goals }],
    archived: false,
    order,
    createdAt: now,
  }
  await database.topics.add(topic)
  return topic
}

export async function updateTopic(
  id: string,
  patch: { name?: string; color?: TopicColor; goals?: WeekGoals; archived?: boolean },
  database: LernzeitDB = db,
) {
  await database.transaction('rw', database.topics, async () => {
    const topic = await database.topics.get(id)
    if (!topic) return
    let next: Topic = { ...topic }
    if (patch.name !== undefined) next.name = patch.name.trim() || topic.name
    if (patch.color) next.color = patch.color
    if (patch.archived !== undefined) next.archived = patch.archived
    if (patch.goals) next = withGoalChange(next, patch.goals)
    await database.topics.put(next)
  })
}

/** Deletes a topic and its study history. Tasks and decks just lose the link. */
export async function deleteTopic(id: string, database: LernzeitDB = db) {
  await database.transaction('rw', [database.topics, database.sessions, database.tasks, database.decks, database.kv], async () => {
    await database.topics.delete(id)
    await database.sessions.where('topicId').equals(id).delete()
    await database.tasks.where('topicId').equals(id).modify({ topicId: undefined })
    await database.decks.filter((d) => d.topicId === id).modify({ topicId: undefined })
  })
}

/** Log study time that happened away from the timer. */
export async function logManualSession(
  input: { topicId: string; start: number; minutes: number; note?: string },
  database: LernzeitDB = db,
) {
  const runId = newId()
  const end = input.start + input.minutes * MINUTE
  const parts = splitAtMidnight(input.start, end, input.minutes)
  const sessions: Session[] = parts.map((p, i) => ({
    id: `${runId}:${i}`,
    topicId: input.topicId,
    start: p.start,
    end: p.end,
    minutes: p.minutes,
    date: p.date,
    note: input.note?.trim() || undefined,
    source: 'timer',
    runId,
  }))
  await database.sessions.bulkAdd(sessions)
}
