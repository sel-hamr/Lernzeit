/**
 * Tool calls that run at the same time, as Claude may send them: each call's store commits only if
 * nothing was written since it opened, and the tool runner runs a refused call again.
 */
import { env } from 'cloudflare:workers'
import type { GrammarTopic } from '@lernzeit/core/types'
import type { CallToolResult } from '@modelcontextprotocol/server'
import { beforeEach, describe, expect, it } from 'vitest'
import { applyChanges } from '../src/changes.ts'
import { MAX_TOOL_ATTEMPTS, runTool } from '../src/mcp/tools.ts'
import { createD1Store } from '../src/store.ts'
import { clearSyncData } from './helpers.ts'

const OWNER = 'owner'

beforeEach(async () => {
  await clearSyncData()
})

/**
 * env.DB, but before each batch that commits a call (the one that writes records) it awaits
 * `beforeCommit` with the number of that commit, 1 for the first.
 */
function watchedDb(beforeCommit: (commit: number) => Promise<void>): { db: D1Database; commits: () => number } {
  const sqlOf = new WeakMap<D1PreparedStatement, string>()
  let commits = 0
  const tag = (statement: D1PreparedStatement, sql: string): D1PreparedStatement => {
    sqlOf.set(statement, sql)
    const bind = statement.bind.bind(statement)
    statement.bind = (...values) => tag(bind(...values), sql)
    return statement
  }
  const db = {
    prepare: (sql: string) => tag(env.DB.prepare(sql), sql),
    batch: async (statements: D1PreparedStatement[]) => {
      if (statements.some((statement) => sqlOf.get(statement)?.includes('INSERT INTO records'))) await beforeCommit(++commits)
      return env.DB.batch(statements)
    },
  }
  return { db: db as unknown as D1Database, commits: () => commits }
}

/** Lets `count` callers on once all of them have arrived. */
function meeting(count: number): () => Promise<void> {
  let arrived = 0
  let open!: () => void
  const everyone = new Promise<void>((resolve) => (open = resolve))
  return () => {
    if (++arrived === count) open()
    return everyone
  }
}

/** Two calls whose first commits wait until both have read: one commits, the other must be refused. */
function interleaved() {
  const meet = meeting(2)
  return [0, 1].map(() => watchedDb((commit) => (commit === 1 ? meet() : Promise.resolve())))
}

/** A tool's answer, read as JSON; fails the test on a tool error. */
function json<T>(result: CallToolResult): T {
  expect(result.isError, JSON.stringify(result.content)).toBeFalsy()
  return JSON.parse((result.content[0] as { text: string }).text) as T
}

const pushTask = (id: string) =>
  applyChanges(env.DB, OWNER, [{ tbl: 'tasks', id, data: { id, title: 'From the phone' }, updatedAt: 1, deleted: false }])

const taskTitles = async () => (await (await createD1Store(env.DB, OWNER)).list<{ title: string }>('tasks')).map((task) => task.title).sort()

describe('tool calls at the same time', () => {
  it('two add_grammar calls on one topic keep both sets of exercises', async () => {
    json(await runTool(env.DB, OWNER, 'add_grammar', { topic: 'Dativ', rule: 'Some verbs take the dative.' }))
    const [a, b] = interleaved()
    const results = await Promise.all([
      runTool(a.db, OWNER, 'add_grammar', { topic: 'Dativ', exercises: [{ text: 'Ich helfe {{dem|den}} Mann.' }, { text: 'Er dankt {{der|die}} Frau.' }] }),
      runTool(b.db, OWNER, 'add_grammar', { topic: 'Dativ', exercises: [{ text: 'Wir folgen {{dem|den}} Weg.' }] }),
    ])
    expect(results.map((result) => json<{ added: number }>(result).added)).toEqual([2, 1])
    // One of them was refused once and ran again.
    expect(a.commits() + b.commits()).toBe(3)

    const [topic] = await (await createD1Store(env.DB, OWNER)).list<GrammarTopic>('grammarTopics')
    expect(topic.exercises.map((exercise) => exercise.text).sort()).toEqual(
      ['Er dankt {{der|die}} Frau.', 'Ich helfe {{dem|den}} Mann.', 'Wir folgen {{dem|den}} Weg.'].sort(),
    )
  })

  it('two create_deck calls with one name make one deck', async () => {
    const [a, b] = interleaved()
    const results = await Promise.all([runTool(a.db, OWNER, 'create_deck', { name: 'Küche' }), runTool(b.db, OWNER, 'create_deck', { name: 'Küche' })])
    const created = results.map((result) => json<{ created: boolean; deck: { id: string } }>(result))
    expect(created.map((result) => result.created).sort()).toEqual([false, true])
    expect(created[0].deck.id).toBe(created[1].deck.id)
    const decks = await (await createD1Store(env.DB, OWNER)).list<{ name: string }>('decks')
    expect(decks.filter((deck) => deck.name === 'Küche')).toHaveLength(1)
  })

  it('a device push between a call’s reads and its commit makes the call run again, and it succeeds', async () => {
    const { db, commits } = watchedDb(async (commit) => {
      if (commit === 1) await pushTask('t-pushed')
    })
    json(await runTool(db, OWNER, 'create_task', { title: 'Lernen' }))
    expect(commits()).toBe(2)
    expect(await taskTitles()).toEqual(['From the phone', 'Lernen'])
  })

  it('gives up after a few tries with an error the AI can pass on, having written nothing', async () => {
    const { db, commits } = watchedDb((commit) => pushTask(`t-${commit}`).then(() => {}))
    const result = await runTool(db, OWNER, 'create_task', { title: 'Lernen' })
    expect(result).toEqual({ content: [{ type: 'text', text: 'Lernzeit was busy; try again. [busy]' }], isError: true })
    expect(commits()).toBe(MAX_TOOL_ATTEMPTS)
    expect(await taskTitles()).not.toContain('Lernen')
  })
})
