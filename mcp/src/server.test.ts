import assert from 'node:assert/strict'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { once } from 'node:events'
import { createInterface } from 'node:readline'
import { after, before, describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

interface Named {
  name: string
}

/** The real server over stdio, the way an AI app starts it. */
describe('MCP server', () => {
  let child: ChildProcessWithoutNullStreams
  const waiting = new Map<number, (message: { result?: Record<string, unknown>; error?: unknown }) => void>()
  let nextId = 1

  const rpc = (method: string, params: Record<string, unknown> = {}) =>
    // Tests read deep into the results, so they are typed loosely.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    new Promise<Record<string, any>>((resolve, reject) => {
      const id = nextId++
      waiting.set(id, (message) => (message.result ? resolve(message.result) : reject(new Error(JSON.stringify(message.error)))))
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`)
    })

  before(async () => {
    const port = String(40_000 + Math.floor(Math.random() * 20_000))
    child = spawn(process.execPath, [fileURLToPath(new URL('./index.ts', import.meta.url))], {
      env: { ...process.env, LERNZEIT_TOKEN: 'test-token', LERNZEIT_PORT: port },
    })
    createInterface({ input: child.stdout }).on('line', (line) => {
      const message = JSON.parse(line) as { id?: number; result?: Record<string, unknown>; error?: unknown }
      if (message.id !== undefined) waiting.get(message.id)?.(message)
    })
    await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } })
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`)
  })

  after(async () => {
    child.stdin.end()
    if (child.exitCode === null) await once(child, 'exit')
  })

  it('offers the eight tools', async () => {
    const { tools } = await rpc('tools/list')
    assert.deepEqual(
      tools.map((t: Named) => t.name),
      ['list_browsers', 'list_topics', 'list_decks', 'create_deck', 'create_cards', 'create_story', 'create_task', 'log_study_time'],
    )
  })

  it('serves a guide that mentions every tool', async () => {
    const { tools } = await rpc('tools/list')
    const { contents } = await rpc('resources/read', { uri: 'lernzeit://guide' })
    const guide: string = contents[0].text
    for (const { name } of tools as Named[]) assert.ok(guide.includes(`\`${name}\``), `the guide does not mention ${name}`)
  })

  it('offers prompts that carry the guide and the request', async () => {
    const { prompts } = await rpc('prompts/list')
    assert.deepEqual(
      prompts.map((p: Named) => p.name),
      ['make_cards', 'write_story', 'plan_tasks', 'help'],
    )
    const { messages } = await rpc('prompts/get', { name: 'make_cards', arguments: { theme: 'kitchen', count: '5' } })
    assert.equal(messages[0].content.resource.uri, 'lernzeit://guide')
    assert.match(messages[1].content.text, /Make 5 German flashcards about "kitchen" at level A2/)
    const story = await rpc('prompts/get', { name: 'write_story', arguments: { theme: 'the market', level: 'A1' } })
    assert.match(story.messages[1].content.text, /about 150 words about "the market" at level A1/)
  })
})
