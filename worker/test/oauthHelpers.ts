/** The OAuth flow as Claude drives it, for the tests that need a connected client. */
import { SELF } from 'cloudflare:test'
import { expect } from 'vitest'
import { PASSWORD, freshIp } from './helpers.ts'

export const ORIGIN = 'https://x'
export const RESOURCE = `${ORIGIN}/mcp`
export const REDIRECT = 'https://claude.ai/api/mcp/auth_callback'

/** The cookies a browser would keep between the authorize page and its form. */
export class CookieJar {
  private cookies = new Map<string, string>()

  take(response: Response): void {
    for (const header of response.headers.getSetCookie()) {
      const [pair, ...attributes] = header.split(';')
      const separator = pair.indexOf('=')
      const name = pair.slice(0, separator).trim()
      const value = pair.slice(separator + 1).trim()
      if (attributes.some((attribute) => /^\s*max-age=0\s*$/i.test(attribute))) this.cookies.delete(name)
      else this.cookies.set(name, value)
    }
  }

  get header(): string {
    return [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; ')
  }
}

export function base64url(bytes: Uint8Array): string {
  let text = ''
  for (const byte of bytes) text += String.fromCharCode(byte)
  return btoa(text).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

export async function pkce(): Promise<{ verifier: string; challenge: string }> {
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)))
  const challenge = base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))))
  return { verifier, challenge }
}

/** Sends a registration for a public client the way Claude does (RFC 7591). */
export function registerRequest(redirects: string[], ip = freshIp(), name = 'Claude'): Promise<Response> {
  return SELF.fetch(`${ORIGIN}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip },
    body: JSON.stringify({
      client_name: name,
      redirect_uris: redirects,
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    }),
  })
}

/** Registers a public client and returns its id. */
export async function register(name = 'Claude', redirect = REDIRECT): Promise<string> {
  const response = await registerRequest([redirect], freshIp(), name)
  expect(response.status).toBe(201)
  return (await response.json<{ client_id: string }>()).client_id
}

export function authorizeUrl(clientId: string, challenge: string, state = 'state-123', redirect = REDIRECT): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirect,
    scope: 'lernzeit',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    resource: RESOURCE,
  })
  return `${ORIGIN}/authorize?${params}`
}

export function handleIn(html: string): string {
  const match = /name="handle" value="([^"]+)"/.exec(html)
  if (!match) throw new Error(`no handle in the page:\n${html}`)
  return match[1]
}

/** One browser going through the authorize page. */
export class Browser {
  jar = new CookieJar()
  handle = ''
  html = ''
  /** Where the page is opened from, for the authorize page's own limit. */
  ip = freshIp()

  async open(url: string): Promise<Response> {
    const response = await SELF.fetch(url, { headers: { Cookie: this.jar.header, 'CF-Connecting-IP': this.ip }, redirect: 'manual' })
    this.jar.take(response)
    this.html = await response.text()
    if (response.status === 200) this.handle = handleIn(this.html)
    return response
  }

  async submit(fields: Record<string, string>, ip = freshIp()): Promise<Response> {
    const response = await SELF.fetch(`${ORIGIN}/authorize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: this.jar.header, 'CF-Connecting-IP': ip },
      body: new URLSearchParams({ handle: this.handle, ...fields }),
      redirect: 'manual',
    })
    this.jar.take(response)
    this.html = response.headers.get('Content-Type')?.startsWith('text/html') ? await response.text() : ''
    if (/name="handle"/.test(this.html)) this.handle = handleIn(this.html)
    return response
  }

  allow(password: string, ip?: string): Promise<Response> {
    return this.submit({ password, decision: 'allow' }, ip)
  }
}

export async function exchange(fields: Record<string, string>): Promise<Response> {
  return SELF.fetch(`${ORIGIN}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields),
  })
}

export interface Tokens {
  access_token: string
  refresh_token: string
  token_type: string
  scope: string
}

/** Registers a client, allows it with the owner's password and returns its tokens. */
export async function connect(name = 'Claude', redirect = REDIRECT): Promise<{ clientId: string; tokens: Tokens }> {
  const clientId = await register(name, redirect)
  const { verifier, challenge } = await pkce()
  const browser = new Browser()
  await browser.open(authorizeUrl(clientId, challenge, 'state-123', redirect))
  const allowed = await browser.allow(PASSWORD)
  expect(allowed.status).toBe(302)
  const location = new URL(allowed.headers.get('Location')!)
  expect(`${location.origin}${location.pathname}`).toBe(redirect)
  const code = location.searchParams.get('code')!
  const response = await exchange({ grant_type: 'authorization_code', code, redirect_uri: redirect, client_id: clientId, code_verifier: verifier, resource: RESOURCE })
  expect(response.status).toBe(200)
  return { clientId, tokens: await response.json<Tokens>() }
}

export function mcp(method: string, token?: string): Promise<Response> {
  return SELF.fetch(RESOURCE, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params: {} }),
  })
}

export async function toolNames(response: Response): Promise<string[]> {
  const text = await response.text()
  const json = text.startsWith('{') ? text : (/^data: (.*)$/m.exec(text)?.[1] ?? text)
  return (JSON.parse(json) as { result: { tools: { name: string }[] } }).result.tools.map((tool) => tool.name)
}
