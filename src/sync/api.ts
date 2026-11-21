/*
 * The Worker's API, on the same origin under /api. The session is an HttpOnly cookie the browser
 * sends by itself. Every call throws OfflineError when the request cannot be made, SignedOutError on
 * 401 and ApiError on any other refusal, with the server's message.
 */
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

async function request(path: string, init: RequestInit = {}): Promise<Response> {
  let response: Response
  try {
    response = await fetchImpl(`/api${path}`, { credentials: 'same-origin', ...init })
  } catch (error) {
    throw new OfflineError(error)
  }
  if (response.ok) return response
  const body = (await response.json().catch(() => undefined)) as { error?: unknown; resync?: unknown } | undefined
  const message = typeof body?.error === 'string' ? body.error : undefined
  if (response.status === 401) throw new SignedOutError(message)
  if (response.status === 409 && body?.resync === true) throw new ResyncNeededError(message)
  throw new ApiError(response.status, message ?? `The server answered ${response.status}.`)
}

function sendJson(path: string, body: unknown): Promise<Response> {
  return request(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
}

export async function push(changes: SyncChange[]): Promise<PushResponse> {
  return (await sendJson('/sync/push', { changes })).json()
}

/** One page of changes after `cursor`; the empty cursor starts from the beginning. */
export async function pull(cursor: string): Promise<PullResponse> {
  return (await request(`/sync/pull?cursor=${encodeURIComponent(cursor)}`)).json()
}

export async function putImage(id: string, blob: Blob): Promise<void> {
  await request(`/images/${encodeURIComponent(id)}`, { method: 'PUT', headers: { 'Content-Type': blob.type }, body: blob })
}

export async function getImage(id: string): Promise<Blob> {
  return (await request(`/images/${encodeURIComponent(id)}`)).blob()
}

/** Tombstones every record in the cloud and drops every image. */
export async function resetCloud(): Promise<{ at: number }> {
  return (await sendJson('/sync/reset', {})).json()
}

export async function authStatus(): Promise<AuthStatus> {
  return (await request('/auth/status')).json()
}

/** Signs this browser in. A wrong email or password is an ApiError with status 401, not SignedOutError. */
export async function login(email: string, password: string): Promise<{ email: string }> {
  try {
    return await (await sendJson('/auth/login', { email, password })).json()
  } catch (error) {
    if (error instanceof SignedOutError) throw new ApiError(401, error.message)
    throw error
  }
}

export async function logout(): Promise<void> {
  await request('/auth/logout', { method: 'POST' })
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
  return (await request('/auth/devices')).json()
}

/** Signs that browser or device out. */
export async function removeDevice(id: string): Promise<void> {
  await request(`/auth/devices/${encodeURIComponent(id)}`, { method: 'DELETE' })
}
