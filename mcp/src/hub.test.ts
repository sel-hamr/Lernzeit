import assert from 'node:assert/strict'
import { once } from 'node:events'
import { afterEach, describe, it } from 'node:test'
import { WebSocket } from 'ws'
import { BridgeError, CLOSE_REPLACED, PROTOCOL_VERSION, type BridgeErrorCode, type ServerMessage } from '../../src/bridge/protocol.ts'
import { BrowserHub, pickBrowser } from './hub.ts'

const TOKEN = 'test-token'
const ORIGIN = 'http://localhost:5173'

function hasCode(code: BridgeErrorCode) {
  return (error: unknown) => error instanceof BridgeError && error.code === code
}

describe('pickBrowser', () => {
  const chrome = { name: 'Chrome Personal' }
  const edge = { name: 'Edge' }

  it('fails when nothing is connected, even with a name', () => {
    assert.throws(() => pickBrowser([]), hasCode('no_browser'))
    assert.throws(() => pickBrowser([], 'Edge'), hasCode('no_browser'))
  })

  it('uses the only browser when no name is given', () => {
    assert.equal(pickBrowser([edge]), edge)
  })

  it('asks for a name when several are connected', () => {
    assert.throws(() => pickBrowser([chrome, edge]), (error: unknown) => hasCode('pick_browser')(error) && (error as Error).message.includes('Chrome Personal, Edge'))
  })

  it('matches names without caring about case or spaces', () => {
    assert.equal(pickBrowser([chrome, edge], '  chrome personal '), chrome)
  })

  it('lists the connected names when the name is unknown', () => {
    assert.throws(() => pickBrowser([chrome, edge], 'Firefox'), (error: unknown) => hasCode('unknown_browser')(error) && (error as Error).message.includes('Connected: Chrome Personal, Edge'))
  })
})

describe('BrowserHub', () => {
  let hub: BrowserHub
  const clients: WebSocket[] = []

  afterEach(async () => {
    for (const client of clients.splice(0)) client.terminate()
    await hub.close()
  })

  async function startHub(options: { requestTimeoutMs?: number } = {}) {
    hub = new BrowserHub({ token: TOKEN, origins: new Set([ORIGIN]), ...options })
    await hub.start(0)
  }

  /** Opens a client and returns it with a queue of the messages it receives. */
  async function connect(origin = ORIGIN) {
    const client = new WebSocket(`ws://127.0.0.1:${hub.port}`, { origin })
    clients.push(client)
    const inbox: ServerMessage[] = []
    const waiters: ((message: ServerMessage) => void)[] = []
    client.on('message', (data) => {
      const message = JSON.parse(data.toString()) as ServerMessage
      const waiter = waiters.shift()
      if (waiter) waiter(message)
      else inbox.push(message)
    })
    await once(client, 'open')
    const next = () => new Promise<ServerMessage>((resolve) => (inbox.length ? resolve(inbox.shift()!) : waiters.push(resolve)))
    return { client, next }
  }

  async function join(name: string, token = TOKEN) {
    const connection = await connect()
    connection.client.send(JSON.stringify({ type: 'hello', version: PROTOCOL_VERSION, token, name, kind: 'Chrome' }))
    return { ...connection, greeting: await connection.next() }
  }

  it('refuses pages from other origins before the WebSocket opens', async () => {
    await startHub()
    const client = new WebSocket(`ws://127.0.0.1:${hub.port}`, { origin: 'https://evil.example' })
    clients.push(client)
    const [error] = (await once(client, 'error')) as [Error]
    assert.match(error.message, /403/)
  })

  it('rejects a wrong token and closes the connection', async () => {
    await startHub()
    const { client, greeting } = await join('Chrome', 'nope')
    assert.deepEqual(greeting, { type: 'rejected', reason: 'wrong_token' })
    const [code] = (await once(client, 'close')) as [number]
    assert.equal(code, 1008)
    assert.deepEqual(hub.list(), [])
  })

  it('welcomes a browser and lists it', async () => {
    await startHub()
    const { greeting } = await join(' Chrome Personal ')
    assert.deepEqual(greeting, { type: 'welcome' })
    assert.deepEqual(
      hub.list().map(({ name, kind }) => ({ name, kind })),
      [{ name: 'Chrome Personal', kind: 'Chrome' }],
    )
  })

  it('forwards a request and resolves with the answer', async () => {
    await startHub()
    const { client, next } = await join('Chrome')
    const result = hub.request(undefined, 'list_topics', {})
    const request = await next()
    assert.ok(request.type === 'request')
    assert.equal(request.action, 'list_topics')
    client.send(JSON.stringify({ type: 'response', id: request.id, ok: true, result: [{ id: 't1', name: 'German' }] }))
    assert.deepEqual(await result, [{ id: 't1', name: 'German' }])
  })

  it('turns an error answer into a BridgeError with the same code', async () => {
    await startHub()
    const { client, next } = await join('Chrome')
    const result = hub.request('chrome', 'create_cards', { deck: 'Food', cards: [{ english: 'dog', german: 'Hund' }] })
    const request = await next()
    assert.ok(request.type === 'request')
    client.send(JSON.stringify({ type: 'response', id: request.id, ok: false, error: { code: 'deck_not_found', message: 'No deck named "Food".' } }))
    await assert.rejects(result, hasCode('deck_not_found'))
  })

  it('gives up when the browser does not answer in time', async () => {
    await startHub({ requestTimeoutMs: 50 })
    await join('Chrome')
    await assert.rejects(hub.request(undefined, 'list_decks', {}), hasCode('timeout'))
  })

  it('fails pending requests when the browser disconnects', async () => {
    await startHub()
    const { client, next } = await join('Chrome')
    const result = hub.request(undefined, 'list_decks', {})
    await next()
    client.close()
    await assert.rejects(result, hasCode('disconnected'))
    assert.deepEqual(hub.list(), [])
  })

  it('replaces an older connection that uses the same name', async () => {
    await startHub()
    const first = await join('Chrome')
    const closed = once(first.client, 'close')
    await join('chrome')
    const [code] = (await closed) as [number]
    assert.equal(code, CLOSE_REPLACED)
    assert.equal(hub.list().length, 1)
  })

  it('reports a busy port on every request and keeps trying in the background', async () => {
    await startHub()
    const busy = new BrowserHub({ token: TOKEN, origins: new Set([ORIGIN]), retryMs: 60_000 })
    await busy.start(hub.port)
    await assert.rejects(busy.request(undefined, 'list_decks', {}), hasCode('port_in_use'))
    await busy.close()
  })
})
