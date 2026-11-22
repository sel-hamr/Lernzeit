/*
 * The Worker's API from the phone, as the web's src/sync/api.ts but over an absolute URL and with
 * the device token as `Authorization: Bearer` instead of a cookie. Every call throws OfflineError
 * when the request cannot be made or gets no answer in time, SignedOutError on 401 (after telling
 * `onSignedOut`), ResyncNeededError on a 409 that asks for a resync, and ApiError on any other
 * refusal, with the server's message. Images go as bytes; reading and writing files is the caller's.
 */
import type { PullResponse, PushResponse, SyncChange } from '@lernzeit/core/sync'
import { isResync } from '@lernzeit/core/syncRules'

export class ApiError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

/** The token is gone or never was: sign in again. */
export class SignedOutError extends ApiError {
  constructor(message = 'Signed out') {
    super(401, message)
    this.name = 'SignedOutError'
  }
}

/** The cloud went back in time past this device's cursor: this device has to merge its library in again. */
export class ResyncNeededError extends ApiError {
  constructor(message = 'Resync needed') {
    super(409, message)
    this.name = 'ResyncNeededError'
  }
}

/** The request did not reach the server, or got no answer in time. */
export class OfflineError extends Error {
  constructor(cause?: unknown) {
    super('Offline', { cause })
    this.name = 'OfflineError'
  }
}

export interface AuthStatus {
  signedIn: boolean
  email?: string
}

export interface ApiImage {
  bytes: ArrayBuffer
  /** The MIME type the server stored it with. */
  type: string
}

export interface ApiOptions {
  /** The cloud's address, e.g. https://lernzeit.selhamr9.workers.dev. */
  baseUrl: string
  /** The device token (from secure storage), null when signed out. */
  getToken: () => Promise<string | null> | string | null
  /** Called when an authenticated call is answered 401. The app deletes the account and token there. */
  onSignedOut?: () => void
  fetch?: typeof fetch
}

/** How long a call may take, answer and body included. */
const JSON_TIMEOUT = 30_000
const IMAGE_TIMEOUT = 120_000

export interface Api {
  /** A wrong email or password is an ApiError with status 401, not SignedOutError. */
  login(email: string, password: string, deviceName: string): Promise<{ email: string; token: string }>
  logout(): Promise<void>
  authStatus(): Promise<AuthStatus>
  push(changes: SyncChange[]): Promise<PushResponse>
  /** One page of changes after `cursor`; the empty cursor starts from the beginning. */
  pull(cursor: string): Promise<PullResponse>
  putImage(id: string, bytes: Uint8Array | ArrayBuffer, type: string): Promise<void>
  getImage(id: string): Promise<ApiImage>
}

type Read<T> = (response: Response) => Promise<T>
const json = <T>(response: Response): Promise<T> => response.json()
const nothing = async () => {}

export function createApi({ baseUrl, getToken, onSignedOut, fetch: fetchImpl }: ApiOptions): Api {
  const root = baseUrl.replace(/\/+$/, '')

  async function exchange<T>(path: string, init: RequestInit, read: Read<T>, authenticated: boolean): Promise<T> {
    const headers = new Headers(init.headers)
    if (authenticated) {
      const token = await getToken()
      if (token) headers.set('Authorization', `Bearer ${token}`)
    }
    let response: Response
    try {
      response = await (fetchImpl ?? fetch)(`${root}/api${path}`, { ...init, headers })
    } catch (error) {
      throw new OfflineError(error)
    }
    if (response.ok) {
      try {
        return await read(response)
      } catch (error) {
        // The body stopped coming: the connection went, not the answer.
        if (init.signal?.aborted) throw new OfflineError(error)
        throw error
      }
    }
    const body = (await response.json().catch(() => undefined)) as { error?: unknown; resync?: unknown } | undefined
    const message = typeof body?.error === 'string' ? body.error : undefined
    if (response.status === 401 && authenticated) {
      onSignedOut?.()
      throw new SignedOutError(message)
    }
    if (isResync(response.status, body)) throw new ResyncNeededError(message)
    throw new ApiError(response.status, message ?? `The server answered ${response.status}.`)
  }

  async function request<T>(path: string, init: RequestInit, read: Read<T>, { timeout = JSON_TIMEOUT, authenticated = true } = {}): Promise<T> {
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    // Raced as well as aborted: the fetch in use may not watch its signal.
    const timedOut = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        const error = new OfflineError(new Error(`No answer within ${timeout / 1000} s`))
        controller.abort(error)
        reject(error)
      }, timeout)
    })
    try {
      return await Promise.race([exchange(path, { ...init, signal: controller.signal }, read, authenticated), timedOut])
    } finally {
      clearTimeout(timer)
    }
  }

  const post = <T>(path: string, body: unknown, read: Read<T>, authenticated = true) =>
    request(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, read, { authenticated })

  return {
    login: (email, password, deviceName) => post('/auth/login', { email, password, device: { name: deviceName } }, json<{ email: string; token: string }>, false),
    async logout() {
      await request('/auth/logout', { method: 'POST' }, nothing)
    },
    authStatus: () => request('/auth/status', {}, json<AuthStatus>),
    push: (changes) => post('/sync/push', { changes }, json<PushResponse>),
    pull: (cursor) => request(`/sync/pull?cursor=${encodeURIComponent(cursor)}`, {}, json<PullResponse>),
    putImage: (id, bytes, type) =>
      request(`/images/${encodeURIComponent(id)}`, { method: 'PUT', headers: { 'Content-Type': type }, body: bytes as BodyInit }, nothing, { timeout: IMAGE_TIMEOUT }),
    getImage: (id) =>
      request(
        `/images/${encodeURIComponent(id)}`,
        {},
        async (response) => ({ bytes: await response.arrayBuffer(), type: response.headers.get('Content-Type') ?? 'application/octet-stream' }),
        { timeout: IMAGE_TIMEOUT },
      ),
  }
}
