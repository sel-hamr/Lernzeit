import { env } from 'cloudflare:workers'
import { beforeEach, describe, expect, it } from 'vitest'
import { mcpFetch } from '../src/mcp/handler.ts'
import { clearSyncData, seedOwner } from './helpers.ts'

const OWNER = 'owner'

interface Rpc {
  // The tests read deep into the results, so they are typed loosely.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (method: string, params?: Record<string, unknown>): Promise<any>
}

/** One JSON-RPC call over the Worker's MCP endpoint, as a 2025-era client sends it. */
const rpc: Rpc = async (method, params = {}) => {
  const response = await mcpFetch(
    new Request('https://x/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    }),
    env,
    OWNER,
  )
  expect(response.status).toBe(200)
  const text = await response.text()
  // A reply is one JSON body or one SSE event.
  const json = text.startsWith('{') ? text : (/^data: (.*)$/m.exec(text)?.[1] ?? text)
  const message = JSON.parse(json) as { result?: unknown; error?: unknown }
  if (message.error) throw new Error(JSON.stringify(message.error))
  return message.result
}

const call = (name: string, args: Record<string, unknown>) => rpc('tools/call', { name, arguments: args })
const textOf = (result: { content: { text: string }[] }) => result.content.map((c) => c.text).join('\n')

beforeEach(async () => {
  await seedOwner()
  await clearSyncData()
})

describe('the MCP endpoint', () => {
  it('introduces the server without any word about a browser', async () => {
    const result = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } })
    expect(result.serverInfo).toMatchObject({ name: 'lernzeit', version: '1.0.0' })
    expect(result.instructions).toMatch(/cloud library/)
    expect(result.instructions).not.toMatch(/browser|AI connection/i)
  })

  it('offers the seventeen tools, none with a browser field', async () => {
    const { tools } = await rpc('tools/list')
    expect(tools.map((t: { name: string }) => t.name)).toEqual([
      'list_topics',
      'list_decks',
      'list_cards',
      'create_deck',
      'create_cards',
      'move_cards',
      'delete_cards',
      'delete_deck',
      'create_story',
      'create_questions',
      'list_grammar_topics',
      'add_grammar',
      'list_docs',
      'read_doc',
      'create_doc',
      'create_task',
      'log_study_time',
    ])
    expect(JSON.stringify(tools)).not.toMatch(/browser/i)
    const destructive = tools.filter((t: { annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean } }) => !t.annotations?.readOnlyHint && t.annotations?.destructiveHint !== false)
    expect(destructive.map((t: { name: string }) => t.name)).toEqual(['delete_cards', 'delete_deck'])
    const deleteDeck = tools.find((t: { name: string }) => t.name === 'delete_deck')
    expect(deleteDeck.description).toMatch(/more than 500 cards.*delete_cards first/)
  })

  it('serves a guide that mentions every tool and no browser', async () => {
    const { tools } = await rpc('tools/list')
    const { contents } = await rpc('resources/read', { uri: 'lernzeit://guide' })
    const guide: string = contents[0].text
    for (const { name } of tools as { name: string }[]) expect(guide, name).toContain(`\`${name}\``)
    expect(guide).not.toMatch(/browser|AI connection|list_browsers/i)
  })

  it('offers the six prompts, which carry the guide and the request', async () => {
    const { prompts } = await rpc('prompts/list')
    expect(prompts.map((p: { name: string }) => p.name)).toEqual(['make_cards', 'write_story', 'make_questions', 'make_grammar', 'plan_tasks', 'help'])
    const { messages } = await rpc('prompts/get', { name: 'make_cards', arguments: { theme: 'kitchen', count: '5' } })
    expect(messages[0].content.resource.uri).toBe('lernzeit://guide')
    expect(messages[1].content.text).toMatch(/Make 5 German flashcards about "kitchen" at level A2/)
    const help = await rpc('prompts/get', { name: 'help' })
    expect(JSON.stringify(help)).not.toMatch(/list_browsers/)
  })

  it('creates a deck and lists it, in the owner\'s library', async () => {
    const created = await call('create_deck', { name: 'Küche' })
    expect(created.isError).toBeUndefined()
    expect(JSON.parse(textOf(created))).toMatchObject({ created: true })
    const listed = JSON.parse(textOf(await call('list_decks', {})))
    expect(JSON.stringify(listed)).toContain('Küche')
    const row = await env.DB.prepare("SELECT owner FROM records WHERE tbl = 'decks'").first<{ owner: string }>()
    expect(row?.owner).toBe(OWNER)
  })

  it('answers a bad input and an unknown deck as tool errors', async () => {
    const bad = await call('create_deck', { name: '' })
    expect(bad.isError).toBe(true)
    const missing = await call('create_cards', { deck: 'Nowhere', cards: [{ german: 'Hund', english: 'dog' }] })
    expect(missing.isError).toBe(true)
    expect(textOf(missing)).toMatch(/Nowhere.*\[deck_not_found\]/s)
  })

  it('answers a commit that is too large as a tool error that says to split the request', async () => {
    await call('create_deck', { name: 'Big' })
    const filler = 'x'.repeat(7_500)
    const cards = Array.from({ length: 100 }, (_, i) => ({ german: `Wort${i}`, english: 'word', exampleDe: filler, exampleEn: filler, tags: [filler] }))
    const result = await call('create_cards', { deck: 'Big', cards })
    expect(result.isError).toBe(true)
    expect(textOf(result)).toMatch(/too large.*Split the request/s)
  })
})
