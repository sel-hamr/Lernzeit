/**
 * The whole bridge in one process: the MCP server's hub, this tab's connection
 * and the real actions on a fake database. Node provides navigator.locks; the
 * WebSocket comes from `ws`, which, like a browser, sends the page's origin.
 */
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WebSocket as NodeWebSocket } from 'ws'
import { BrowserHub } from '../../mcp/src/hub.ts'
import { LernzeitDB } from '@/db/db'
import { seedGerman } from '@/test/fixtures'
import { handleRequest } from './actions'
import { connectBridge, type BridgeOptions } from './connection'
import { BridgeError } from './protocol'
import type { BridgeStatus } from './status'

const TOKEN = 'e2e-token'
const ORIGIN = 'http://localhost:5173'

class PageWebSocket extends NodeWebSocket {
  constructor(url: string) {
    super(url, { origin: ORIGIN })
  }
}

let database: LernzeitDB
let hub: BrowserHub
let counter = 0
const stops: (() => void)[] = []

beforeEach(async () => {
  database = new LernzeitDB(`bridge-e2e-${counter++}`)
  await seedGerman(database)
  vi.stubGlobal('WebSocket', PageWebSocket)
  hub = new BrowserHub({ token: TOKEN, origins: new Set([ORIGIN]) })
  await hub.start(0)
})

afterEach(async () => {
  for (const stop of stops.splice(0)) stop()
  await hub.close()
  await database.delete()
  vi.unstubAllGlobals()
})

/** Connects a tab and resolves once its status reaches `until`. */
function connectTab(overrides: Partial<BridgeOptions> = {}, until: BridgeStatus = 'connected') {
  const statuses: BridgeStatus[] = []
  return new Promise<BridgeStatus[]>((resolve) => {
    const stop = connectBridge({
      port: hub.port,
      token: TOKEN,
      name: 'Chrome Personal',
      kind: 'Chrome',
      onRequest: (request) => handleRequest(request, database),
      onStatus: (status) => {
        statuses.push(status)
        if (status === until) resolve(statuses)
      },
      ...overrides,
    })
    stops.push(stop)
  })
}

describe('bridge end to end', () => {
  it('adds cards from a tool call to the database', async () => {
    await connectTab()
    expect(hub.list().map((b) => b.name)).toEqual(['Chrome Personal'])

    const result = await hub.request(undefined, 'create_cards', {
      deck: 'My Words',
      cards: [
        { english: 'spoon', german: 'der Löffel' },
        { english: 'fork', german: 'die Gabel' },
      ],
    })
    expect(result).toEqual({ deck: 'My Words', added: 2, skipped: [] })
    expect(await database.cards.filter((c) => c.tags.includes('ai')).count()).toBe(2)

    const again = await hub.request('chrome personal', 'create_cards', { deck: 'My Words', cards: [{ english: 'spoon', german: 'der Löffel' }] })
    expect(again).toEqual({ deck: 'My Words', added: 0, skipped: ['Löffel'] })
  })

  it('brings errors from the app back as BridgeErrors', async () => {
    await connectTab()
    const error = await hub.request(undefined, 'log_study_time', { topic: 'Spanish', minutes: 20 }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(BridgeError)
    expect((error as BridgeError).code).toBe('topic_not_found')
  })

  it('stops trying after a wrong token', async () => {
    const statuses = await connectTab({ token: 'wrong' }, 'wrong_token')
    expect(statuses.at(-1)).toBe('wrong_token')
    expect(hub.list()).toEqual([])
  })

  it('lets only one tab of a browser connect', async () => {
    await connectTab()
    const second = await connectTab({}, 'standby')
    expect(second).toEqual(['standby'])
    expect(hub.list()).toHaveLength(1)
  })
})
