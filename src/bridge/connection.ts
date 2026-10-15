import { CLOSE_REPLACED, parseServerMessage, PROTOCOL_VERSION, type AppMessage, type RequestMessage, type ResponseMessage } from './protocol'
import type { BridgeStatus } from './status'

/** Retries start fast and slow down, since each failed attempt logs an error in the console. */
const RETRY_MS = { first: 5_000, max: 30_000 }
/** Only the tab holding this lock connects, so a request never runs in two tabs. */
const LOCK_NAME = 'lernzeit-bridge'

export interface BridgeOptions {
  port: number
  token: string
  name: string
  kind: string
  onRequest: (request: RequestMessage) => Promise<ResponseMessage>
  onStatus: (status: BridgeStatus) => void
}

/** Keeps this tab connected to the MCP server until the returned function is called. */
export function connectBridge(options: BridgeOptions): () => void {
  const stop = new AbortController()
  if ('locks' in navigator) {
    options.onStatus('standby')
    navigator.locks.request(LOCK_NAME, { signal: stop.signal }, () => stayConnected(options, stop.signal)).catch((error: unknown) => {
      // Stopping while another tab holds the lock aborts the wait; that is expected.
      if (!stop.signal.aborted) console.warn('Lernzeit bridge:', error)
    })
  } else {
    void stayConnected(options, stop.signal)
  }
  return () => stop.abort()
}

/** Connects, reconnects after a drop, and resolves when `signal` aborts, which releases the lock. */
function stayConnected({ port, token, name, kind, onRequest, onStatus }: BridgeOptions, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve()
    let socket: WebSocket | undefined
    let retry: ReturnType<typeof setTimeout> | undefined
    let retryMs = RETRY_MS.first
    // After a refusal, retrying cannot help until the settings change, which starts a new connection.
    let refused = false

    const open = () => {
      onStatus('waiting')
      const ws = new WebSocket(`ws://127.0.0.1:${port}`)
      socket = ws
      // Answers go back on the socket the request came in on, even after a reconnect.
      const send = (message: AppMessage) => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message))
      }

      ws.addEventListener('open', () => send({ type: 'hello', version: PROTOCOL_VERSION, token, name, kind }))
      ws.addEventListener('message', (event) => {
        const message = typeof event.data === 'string' ? parseServerMessage(event.data) : undefined
        if (message?.type === 'welcome') {
          retryMs = RETRY_MS.first
          onStatus('connected')
        } else if (message?.type === 'rejected') {
          refused = true
          onStatus(message.reason === 'wrong_token' ? 'wrong_token' : 'outdated')
        } else if (message?.type === 'request') {
          void onRequest(message).then(send)
        }
      })
      ws.addEventListener('close', (event) => {
        if (signal.aborted) return
        if (event.code === CLOSE_REPLACED) {
          refused = true
          onStatus('name_taken')
        }
        if (refused) return
        onStatus('waiting')
        retry = setTimeout(open, retryMs)
        retryMs = Math.min(retryMs * 2, RETRY_MS.max)
      })
    }

    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(retry)
        socket?.close(1000)
        resolve()
      },
      { once: true },
    )
    open()
  })
}
