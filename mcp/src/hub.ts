import { createHash, randomUUID, timingSafeEqual } from 'node:crypto'
import { createServer, type IncomingMessage } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { Duplex } from 'node:stream'
import { WebSocket, WebSocketServer } from 'ws'
import {
  BridgeError,
  CLOSE_REPLACED,
  parseAppMessage,
  parseServerMessage,
  PROTOCOL_VERSION,
  toErrorBody,
  type ActionName,
  type ActionParams,
  type ActionResult,
  type HelloMessage,
  type RejectReason,
  type ResponseMessage,
  type ServerMessage,
} from '../../src/bridge/protocol.ts'

export interface BrowserInfo {
  name: string
  kind: string
  /** ISO timestamp. */
  connectedSince: string
}

export interface HubOptions {
  token: string
  /** Page origins allowed to connect. */
  origins: ReadonlySet<string>
  requestTimeoutMs?: number
  helloTimeoutMs?: number
  /** How long to wait before trying again when the port is held by something this server cannot share it with. */
  retryMs?: number
  log?: (message: string) => void
}

interface Browser {
  name: string
  kind: string
  connectedAt: Date
  socket: WebSocket
}

interface Pending {
  socket: WebSocket
  resolve: (result: unknown) => void
  reject: (error: BridgeError) => void
  timer: NodeJS.Timeout
}

const CLOSE_POLICY = 1008

/**
 * Where the other copies of this server connect. Each AI session starts its own
 * copy, only one can hold the port, and the rest send their calls through it.
 */
const PEER_PATH = '/peer'

/** Sent by a copy to the one that holds the port. It answers with `welcome` or `rejected`, then with a `response` per call. */
type PeerMessage =
  | { type: 'peer_hello'; version: number; token: string }
  | { type: 'peer_request'; id: string; browser?: string; action: ActionName; params: ActionParams<ActionName> }
  | { type: 'peer_list'; id: string }

type Outgoing = ServerMessage | PeerMessage | ResponseMessage

function parsePeerMessage(text: string): PeerMessage | undefined {
  let m: Record<string, unknown> | null
  try {
    m = JSON.parse(text) as Record<string, unknown> | null
  } catch {
    return undefined
  }
  if (typeof m !== 'object' || m === null) return undefined
  switch (m.type) {
    case 'peer_hello':
      return typeof m.version === 'number' && typeof m.token === 'string' ? { type: 'peer_hello', version: m.version, token: m.token } : undefined
    case 'peer_list':
      return typeof m.id === 'string' ? { type: 'peer_list', id: m.id } : undefined
    case 'peer_request': {
      const { id, browser, action, params } = m
      if (typeof id !== 'string' || typeof action !== 'string' || typeof params !== 'object' || params === null) return undefined
      if (browser !== undefined && typeof browser !== 'string') return undefined
      return { type: 'peer_request', id, browser, action: action as ActionName, params: params as ActionParams<ActionName> }
    }
    default:
      return undefined
  }
}

const NO_BROWSER =
  'No Lernzeit browser is connected. Ask the user to open Lernzeit and turn on Settings → AI connection → Connect to AI.'

/** Picks the browser a request goes to: the one named, or the only one connected. */
export function pickBrowser<T extends { name: string }>(browsers: readonly T[], wanted?: string): T {
  if (!browsers.length) throw new BridgeError('no_browser', NO_BROWSER)
  const names = browsers.map((b) => b.name).join(', ')
  const name = wanted?.trim()
  if (name) {
    const match = browsers.find((b) => b.name.toLowerCase() === name.toLowerCase())
    if (!match) throw new BridgeError('unknown_browser', `No browser named "${name}" is connected. Connected: ${names}.`)
    return match
  }
  if (browsers.length > 1) {
    throw new BridgeError('pick_browser', `Several browsers are connected: ${names}. Ask the user which one, then pass its name as "browser".`)
  }
  return browsers[0]
}

/** Compares secrets in constant time, whatever their lengths. */
function sameSecret(a: string, b: string): boolean {
  const digest = (s: string) => createHash('sha256').update(s).digest()
  return timingSafeEqual(digest(a), digest(b))
}

function send(socket: WebSocket, message: Outgoing) {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message))
}

/**
 * The WebSocket side of the server. Lernzeit tabs connect here, and each tool
 * call is forwarded to one of them as a request. When another copy already
 * holds the port, this one sends its calls through that copy, and takes over
 * the port if that copy goes away.
 */
export class BrowserHub {
  readonly #token: string
  readonly #origins: ReadonlySet<string>
  readonly #requestTimeoutMs: number
  readonly #helloTimeoutMs: number
  readonly #retryMs: number
  readonly #log: (message: string) => void

  readonly #http = createServer((_request, response) => {
    response.writeHead(426, { 'content-type': 'text/plain' }).end('Lernzeit bridge: connect with a WebSocket.\n')
  })
  readonly #wss = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 })
  /** Keyed by lower-case name. */
  readonly #browsers = new Map<string, Browser>()
  readonly #pending = new Map<string, Pending>()

  #listening = false
  #port = 0
  #retry: NodeJS.Timeout | undefined
  /** The connection to the copy that holds the port. */
  #upstream: WebSocket | undefined
  /** That copy has welcomed this one, so calls can go through it. */
  #joined = false
  #closing = false

  constructor(options: HubOptions) {
    this.#token = options.token
    this.#origins = options.origins
    this.#requestTimeoutMs = options.requestTimeoutMs ?? 15_000
    this.#helloTimeoutMs = options.helloTimeoutMs ?? 5_000
    this.#retryMs = options.retryMs ?? 10_000
    this.#log = options.log ?? (() => {})
    this.#http.on('upgrade', (request, socket, head) => this.#upgrade(request, socket, head))
  }

  /** The port it listens on or shares. */
  get port(): number {
    return this.#port
  }

  /** Starts listening, or joins the copy that already holds the port. Failing that, it keeps trying in the background. */
  async start(port: number, host = '127.0.0.1'): Promise<void> {
    this.#port = port
    try {
      await new Promise<void>((resolve, reject) => {
        this.#http.once('error', reject)
        this.#http.listen(port, host, () => {
          this.#http.off('error', reject)
          resolve()
        })
      })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EADDRINUSE') throw error
      await this.#join(port, host)
      return
    }
    this.#listening = true
    this.#port = (this.#http.address() as AddressInfo).port
    this.#log(`Waiting for Lernzeit on ws://${host}:${this.#port}`)
  }

  async close(): Promise<void> {
    this.#closing = true
    clearTimeout(this.#retry)
    this.#upstream?.terminate()
    for (const id of [...this.#pending.keys()]) {
      this.#take(id)?.reject(new BridgeError('disconnected', 'The Lernzeit server is shutting down.'))
    }
    for (const client of this.#wss.clients) client.terminate()
    this.#listening = false
    await new Promise<void>((resolve) => this.#wss.close(() => this.#http.close(() => resolve())))
  }

  async list(): Promise<BrowserInfo[]> {
    const upstream = this.#route()
    if (upstream) return (await this.#askUpstream(upstream, (id) => ({ type: 'peer_list', id }))) as BrowserInfo[]
    return [...this.#browsers.values()]
      .map(({ name, kind, connectedAt }) => ({ name, kind, connectedSince: connectedAt.toISOString() }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }

  /** Sends an action to a browser and waits for its answer. Fails with a BridgeError. */
  async request<A extends ActionName>(browserName: string | undefined, action: A, params: ActionParams<A>): Promise<ActionResult<A>> {
    const upstream = this.#route()
    if (upstream) {
      const result = await this.#askUpstream(upstream, (id) => ({ type: 'peer_request', id, browser: browserName, action, params }))
      return result as ActionResult<A>
    }
    const browser = pickBrowser([...this.#browsers.values()], browserName)
    const timeout = `${browser.name} did not answer within ${this.#requestTimeoutMs / 1000} s. Is the Lernzeit tab still open?`
    const result = await this.#ask(browser.socket, this.#requestTimeoutMs, timeout, (id) => ({ type: 'request', id, action, params }))
    return result as ActionResult<A>
  }

  /** The copy to go through, or nothing when this one holds the port. */
  #route(): WebSocket | undefined {
    if (this.#listening) return undefined
    if (this.#joined) return this.#upstream
    throw new BridgeError(
      'port_in_use',
      `Port ${this.#port} is held by something this server cannot share it with: a Lernzeit server with another token or an older version, or another program. Restart your AI apps. If that does not help, give this server another LERNZEIT_PORT.`,
    )
  }

  /** The copy holding the port times out first, so its clearer message wins. */
  #askUpstream(upstream: WebSocket, message: (id: string) => Outgoing): Promise<unknown> {
    return this.#ask(upstream, this.#requestTimeoutMs + 1_000, `The Lernzeit server on port ${this.#port} did not answer.`, message)
  }

  #ask(socket: WebSocket, timeoutMs: number, timeoutMessage: string, message: (id: string) => Outgoing): Promise<unknown> {
    const id = randomUUID()
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#take(id)
        reject(new BridgeError('timeout', timeoutMessage))
      }, timeoutMs)
      this.#pending.set(id, { socket, resolve, reject, timer })
      send(socket, message(id))
    })
  }

  /** Connects to the copy holding the port. Resolves once that has worked or failed. */
  #join(port: number, host: string): Promise<void> {
    return new Promise<void>((resolve) => {
      const socket = new WebSocket(`ws://${host}:${port}${PEER_PATH}`, { handshakeTimeout: this.#helloTimeoutMs })
      this.#upstream = socket
      const helloTimer = setTimeout(() => socket.terminate(), this.#helloTimeoutMs)

      socket.on('open', () => send(socket, { type: 'peer_hello', version: PROTOCOL_VERSION, token: this.#token }))
      socket.on('message', (data) => {
        const text = data.toString()
        const message = parseServerMessage(text)
        if (message?.type === 'welcome') {
          clearTimeout(helloTimer)
          this.#joined = true
          this.#log(`Sharing port ${port} with another Lernzeit server.`)
          resolve()
        } else if (message?.type === 'rejected') {
          this.#log(`The server on port ${port} refused this one: ${message.reason.replaceAll('_', ' ')}.`)
        } else {
          const response = parseAppMessage(text)
          if (response?.type === 'response') this.#settle(socket, response)
        }
      })
      socket.on('error', (error) => this.#log(`Could not share port ${port}: ${error.message}`))
      socket.on('close', () => {
        clearTimeout(helloTimer)
        const wasJoined = this.#joined
        this.#joined = false
        this.#upstream = undefined
        for (const [id, pending] of this.#pending) {
          if (pending.socket === socket) {
            this.#take(id)?.reject(new BridgeError('disconnected', 'The Lernzeit server went away before it answered. Try again.'))
          }
        }
        if (!this.#closing) this.#retryStart(port, host, wasJoined ? 0 : this.#retryMs)
        resolve()
      })
    })
  }

  #retryStart(port: number, host: string, delayMs: number) {
    if (delayMs) this.#log(`Trying port ${port} again in ${delayMs / 1000} s.`)
    this.#retry = setTimeout(() => {
      this.start(port, host).catch((e: Error) => this.#log(`Could not listen: ${e.message}`))
    }, delayMs).unref()
  }

  #upgrade(request: IncomingMessage, socket: Duplex, head: Buffer) {
    const origin = request.headers.origin
    if (request.url === PEER_PATH) {
      // Browsers always send an origin, so no website gets here. The peer still needs the token.
      if (origin) {
        this.#log(`Refused a server connection from ${origin}.`)
        socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n')
        socket.destroy()
        return
      }
      this.#wss.handleUpgrade(request, socket, head, (ws) => this.#acceptPeer(ws))
      return
    }
    // Any website can open a WebSocket to localhost, so only Lernzeit's own pages get in.
    if (!origin || !this.#origins.has(origin)) {
      this.#log(`Refused a connection from ${origin ?? 'a client with no origin'}. Add it to LERNZEIT_ORIGINS to allow it.`)
      socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n')
      socket.destroy()
      return
    }
    this.#wss.handleUpgrade(request, socket, head, (ws) => this.#accept(ws))
  }

  #acceptPeer(socket: WebSocket) {
    let trusted = false
    const helloTimer = setTimeout(() => socket.close(CLOSE_POLICY, 'No hello'), this.#helloTimeoutMs)

    socket.on('message', (data, isBinary) => {
      const message = isBinary ? undefined : parsePeerMessage(data.toString())
      if (message?.type === 'peer_hello') {
        if (trusted) return
        clearTimeout(helloTimer)
        const reason: RejectReason | undefined =
          message.version !== PROTOCOL_VERSION ? 'unsupported_version' : !sameSecret(message.token, this.#token) ? 'wrong_token' : undefined
        if (reason) {
          this.#log(`Refused another server: ${reason.replaceAll('_', ' ')}.`)
          send(socket, { type: 'rejected', reason })
          socket.close(CLOSE_POLICY, reason)
          return
        }
        trusted = true
        send(socket, { type: 'welcome' })
      } else if (message && trusted) {
        void this.#serve(socket, message)
      }
    })
    socket.on('close', () => clearTimeout(helloTimer))
    socket.on('error', (error) => this.#log(`Connection error: ${error.message}`))
  }

  /** Runs a call from another copy and sends back the result or the error. */
  async #serve(socket: WebSocket, message: Exclude<PeerMessage, { type: 'peer_hello' }>) {
    try {
      const result = message.type === 'peer_list' ? await this.list() : await this.request(message.browser, message.action, message.params)
      send(socket, { type: 'response', id: message.id, ok: true, result })
    } catch (error) {
      send(socket, { type: 'response', id: message.id, ok: false, error: toErrorBody(error) })
    }
  }

  #accept(socket: WebSocket) {
    let browser: Browser | undefined
    const helloTimer = setTimeout(() => socket.close(CLOSE_POLICY, 'No hello'), this.#helloTimeoutMs)

    socket.on('message', (data, isBinary) => {
      const message = isBinary ? undefined : parseAppMessage(data.toString())
      if (message?.type === 'hello' && !browser) {
        clearTimeout(helloTimer)
        browser = this.#greet(socket, message)
      } else if (message?.type === 'response' && browser) {
        this.#settle(socket, message)
      }
    })
    socket.on('close', () => {
      clearTimeout(helloTimer)
      if (browser) this.#drop(browser)
    })
    socket.on('error', (error) => this.#log(`Connection error: ${error.message}`))
  }

  #greet(socket: WebSocket, hello: HelloMessage): Browser | undefined {
    const name = hello.name.trim()
    const reason: RejectReason | undefined =
      hello.version !== PROTOCOL_VERSION
        ? 'unsupported_version'
        : !sameSecret(hello.token, this.#token)
          ? 'wrong_token'
          : !name
            ? 'invalid_hello'
            : undefined
    if (reason) {
      this.#log(`Refused ${name || 'a browser'}: ${reason.replaceAll('_', ' ')}.`)
      send(socket, { type: 'rejected', reason })
      socket.close(CLOSE_POLICY, reason)
      return undefined
    }

    const key = name.toLowerCase()
    this.#browsers.get(key)?.socket.close(CLOSE_REPLACED, 'Another browser connected with this name')
    const browser: Browser = { name, kind: hello.kind.trim() || 'Browser', connectedAt: new Date(), socket }
    this.#browsers.set(key, browser)
    send(socket, { type: 'welcome' })
    this.#log(`${name} connected.`)
    return browser
  }

  #settle(socket: WebSocket, response: ResponseMessage) {
    const pending = this.#pending.get(response.id)
    if (pending?.socket !== socket) return
    this.#take(response.id)
    if (response.ok) pending.resolve(response.result)
    else pending.reject(new BridgeError(response.error.code, response.error.message))
  }

  #drop(browser: Browser) {
    const key = browser.name.toLowerCase()
    if (this.#browsers.get(key) === browser) this.#browsers.delete(key)
    for (const [id, pending] of this.#pending) {
      if (pending.socket === browser.socket) {
        this.#take(id)?.reject(new BridgeError('disconnected', `${browser.name} disconnected before it answered.`))
      }
    }
    this.#log(`${browser.name} disconnected.`)
  }

  /** Removes a pending request and stops its timer. */
  #take(id: string): Pending | undefined {
    const pending = this.#pending.get(id)
    if (!pending) return undefined
    clearTimeout(pending.timer)
    this.#pending.delete(id)
    return pending
  }
}
