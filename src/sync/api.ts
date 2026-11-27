/*
 * The Worker's API, on the same origin under /api. The session is an HttpOnly cookie the browser
 * sends by itself. Every call throws OfflineError when the request cannot be made or gets no answer in
 * time, SignedOutError on 401 and ApiError on any other refusal, with the server's message.
 */
import { isResync } from '@lernzeit/core/syncRules'
import type { PullResponse, PushResponse, SyncChange } from '@lernzeit/core/sync'

export class ApiError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

/** The session is gone or never was: sign in again. */
export class SignedOutError extends ApiError {
  constructor(message = 'Signed out') {
    super(401, message)
    this.name = 'SignedOutError'
  }
}

/**
 * The cloud went back in time (a D1 Time Travel restore) past this device's cursor, so pulling on
 * from it would skip changes: this device has to merge its library in again.
 */
export class ResyncNeededError extends ApiError {
  constructor(message = 'Resync needed') {
    super(409, message)
    this.name = 'ResyncNeededError'
  }
}

/** The request did not reach the server. */
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

const defaultFetch: typeof fetch = (input, init) => fetch(input, init)
let fetchImpl: typeof fetch = defaultFetch

/** For tests: answer requests with `f` instead of the network. Call with nothing to go back. */
export function setFetch(f?: typeof fetch): void {
  fetchImpl = f ?? defaultFetch
}

/**
 * How long a call may take, answer and body included. A request that hangs would otherwise hold the
 * sync lock, and with it every tab's sync, restore, reset and merge, for good.
 */
const JSON_TIMEOUT = 30_000
const IMAGE_TIMEOUT = 120_000

type Read<T> = (response: Response) => Promise<T>
const json = <T>(response: Response): Promise<T> => response.json()
const nothing = async () => {}

/**
 * Makes the request and reads its answer with `read`, within `timeout` ms. A request that cannot be
 * made, or does not finish in time (it is aborted then), throws OfflineError.
 */
async function request<T>(path: string, init: RequestInit, read: Read<T>, timeout = JSON_TIMEOUT): Promise<T> {
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
    return await Promise.race([exchange(path, { ...init, signal: controller.signal }, read), timedOut])
  } finally {
    clearTimeout(timer)
  }
}

async function exchange<T>(path: string, init: RequestInit, read: Read<T>): Promise<T> {
  let response: Response
  try {
    response = await fetchImpl(`/api${path}`, { credentials: 'same-origin', ...init })
  } catch (error) {
    throw new OfflineError(error)
  }
  if (response.ok) {
    try {
      return await read(response)
    } catch (error) {
      // The body stopped coming: the connection went, not the answer.
      if (init.signal?.aborted || (error instanceof DOMException && error.name === 'AbortError')) throw new OfflineError(error)
      throw error
    }
  }
  const body = (await response.json().catch(() => undefined)) as { error?: unknown; resync?: unknown } | undefined
  const message = typeof body?.error === 'string' ? body.error : undefined
  if (response.status === 401) throw new SignedOutError(message)
  if (isResync(response.status, body)) throw new ResyncNeededError(message)
  throw new ApiError(response.status, message ?? `The server answered ${response.status}.`)
}

function sendJson<T>(path: string, body: unknown, read: Read<T>): Promise<T> {
  return request(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, read)
}

export function push(changes: SyncChange[]): Promise<PushResponse> {
  return sendJson('/sync/push', { changes }, json<PushResponse>)
}

/** One page of changes after `cursor`; the empty cursor starts from the beginning. */
export function pull(cursor: string): Promise<PullResponse> {
  return request(`/sync/pull?cursor=${encodeURIComponent(cursor)}`, {}, json<PullResponse>)
}

export function putImage(id: string, blob: Blob): Promise<void> {
  return request(`/images/${encodeURIComponent(id)}`, { method: 'PUT', headers: { 'Content-Type': blob.type }, body: blob }, nothing, IMAGE_TIMEOUT)
}

export function getImage(id: string): Promise<Blob> {
  return request(`/images/${encodeURIComponent(id)}`, {}, (response) => response.blob(), IMAGE_TIMEOUT)
}

/** Tombstones every record in the cloud and drops every image. */
export function resetCloud(): Promise<{ at: number }> {
  return sendJson('/sync/reset', {}, json<{ at: number }>)
}

export function authStatus(): Promise<AuthStatus> {
  return request('/auth/status', {}, json<AuthStatus>)
}

/** Signs this browser in. A wrong email or password is an ApiError with status 401, not SignedOutError. */
export async function login(email: string, password: string): Promise<{ email: string }> {
  try {
    return await sendJson('/auth/login', { email, password }, json<{ email: string }>)
  } catch (error) {
    if (error instanceof SignedOutError) throw new ApiError(401, error.message)
    throw error
  }
}

export async function logout(): Promise<void> {
  await request('/auth/logout', { method: 'POST' }, nothing)
}

/** A browser or device signed in to the account. `current` is this browser. */
export interface SignedInDevice {
  id: string
  kind: 'web' | 'device'
  name: string
  createdAt: number
  lastUsedAt: number
  current: boolean
}

export async function listDevices(): Promise<SignedInDevice[]> {
  return request('/auth/devices', {}, json<SignedInDevice[]>)
}

/** Signs that browser or device out. */
export async function removeDevice(id: string): Promise<void> {
  await request(`/auth/devices/${encodeURIComponent(id)}`, { method: 'DELETE' }, nothing)
}

/** An AI app (Claude, say) the owner allowed to use the library through /mcp. */
export interface ConnectedApp {
  id: string
  clientName: string
  /** When it was connected, in ms. */
  createdAt: number
}

/** Where an AI app connects: the cloud's own address plus /mcp (this page may run elsewhere, such as on localhost). */
export function mcpInfo(): Promise<{ url: string }> {
  return request('/mcp/info', {}, json<{ url: string }>)
}

export function listConnectedApps(): Promise<ConnectedApp[]> {
  return request('/mcp/grants', {}, json<ConnectedApp[]>)
}

/** Disconnects the app: its tokens stop working. */
export async function disconnectApp(id: string): Promise<void> {
  await request(`/mcp/grants/${encodeURIComponent(id)}`, { method: 'DELETE' }, nothing)
}
