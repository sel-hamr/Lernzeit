import { createHash, randomUUID, timingSafeEqual } from 'node:crypto'
import { createServer, type IncomingMessage } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { Duplex } from 'node:stream'
import { WebSocketServer, type WebSocket } from 'ws'
import {
  BridgeError,
  CLOSE_REPLACED,
  parseAppMessage,
  PROTOCOL_VERSION,
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
  /** How long to wait before trying a busy port again. */
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

function send(socket: WebSocket, message: ServerMessage) {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message))
}

/**
 * The WebSocket side of the server. Lernzeit tabs connect here, and each tool
 * call is forwarded to one of them as a request.
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

  constructor(options: HubOptions) {
    this.#token = options.token
    this.#origins = options.origins
    this.#requestTimeoutMs = options.requestTimeoutMs ?? 15_000
    this.#helloTimeoutMs = options.helloTimeoutMs ?? 5_000
    this.#retryMs = options.retryMs ?? 10_000
    this.#log = options.log ?? (() => {})
    this.#http.on('upgrade', (request, socket, head) => this.#upgrade(request, socket, head))
  }

  /** The port it listens on, or wants to while the port is busy. */
  get port(): number {
    return this.#port
  }

  /** Starts listening. While another process holds the port, it keeps trying in the background. */
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
      this.#log(`Port ${port} is in use. Trying again in ${this.#retryMs / 1000} s.`)
      this.#retry = setTimeout(() => {
        this.start(port, host).catch((e: Error) => this.#log(`Could not listen: ${e.message}`))
      }, this.#retryMs).unref()
      return
    }
    this.#listening = true
    this.#port = (this.#http.address() as AddressInfo).port
    this.#log(`Waiting for Lernzeit on ws://${host}:${this.#port}`)
  }

  async close(): Promise<void> {
    clearTimeout(this.#retry)
    for (const id of [...this.#pending.keys()]) {
      this.#take(id)?.reject(new BridgeError('disconnected', 'The Lernzeit server is shutting down.'))
    }
    for (const client of this.#wss.clients) client.terminate()
    this.#listening = false
    await new Promise<void>((resolve) => this.#wss.close(() => this.#http.close(() => resolve())))
  }

  list(): BrowserInfo[] {
    return [...this.#browsers.values()]
      .map(({ name, kind, connectedAt }) => ({ name, kind, connectedSince: connectedAt.toISOString() }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }

  /** Sends an action to a browser and waits for its answer. Fails with a BridgeError. */
  async request<A extends ActionName>(browserName: string | undefined, action: A, params: ActionParams<A>): Promise<ActionResult<A>> {
    if (!this.#listening) {
      throw new BridgeError(
        'port_in_use',
        `Port ${this.#port} is in use, most likely by the Lernzeit server of another AI app. Close that app, or give this server another LERNZEIT_PORT.`,
      )
    }
    const browser = pickBrowser([...this.#browsers.values()], browserName)
    const id = randomUUID()
    const result = await new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#take(id)
        reject(new BridgeError('timeout', `${browser.name} did not answer within ${this.#requestTimeoutMs / 1000} s. Is the Lernzeit tab still open?`))
      }, this.#requestTimeoutMs)
      this.#pending.set(id, { socket: browser.socket, resolve, reject, timer })
      send(browser.socket, { type: 'request', id, action, params })
    })
    return result as ActionResult<A>
  }

  #upgrade(request: IncomingMessage, socket: Duplex, head: Buffer) {
    // Any website can open a WebSocket to localhost, so only Lernzeit's own pages get in.
    const origin = request.headers.origin
    if (!origin || !this.#origins.has(origin)) {
      this.#log(`Refused a connection from ${origin ?? 'a client with no origin'}. Add it to LERNZEIT_ORIGINS to allow it.`)
      socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n')
      socket.destroy()
      return
    }
    this.#wss.handleUpgrade(request, socket, head, (ws) => this.#accept(ws))
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
