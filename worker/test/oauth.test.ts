import { getOAuthApi } from '@cloudflare/workers-oauth-provider'
import { SELF } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { beforeEach, describe, expect, it } from 'vitest'
import { oauthOptions } from '../src/index.ts'
import { EMAIL, PASSWORD, clearSyncData, deviceToken, freshIp, login, seedOwner, sessionCookie } from './helpers.ts'

const ORIGIN = 'https://x'
const RESOURCE = `${ORIGIN}/mcp`
const REDIRECT = 'https://claude.ai/api/mcp/auth_callback'

beforeEach(async () => {
  await seedOwner()
  await clearSyncData()
})

/** The cookies a browser would keep between the authorize page and its form. */
class CookieJar {
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

function base64url(bytes: Uint8Array): string {
  let text = ''
  for (const byte of bytes) text += String.fromCharCode(byte)
  return btoa(text).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

async function pkce(): Promise<{ verifier: string; challenge: string }> {
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)))
  const challenge = base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))))
  return { verifier, challenge }
}

/** Registers a public client the way Claude does (RFC 7591) and returns its id. */
async function register(name = 'Claude'): Promise<string> {
  const response = await SELF.fetch(`${ORIGIN}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_name: name,
      redirect_uris: [REDIRECT],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    }),
  })
  expect(response.status).toBe(201)
  return (await response.json<{ client_id: string }>()).client_id
}

function authorizeUrl(clientId: string, challenge: string, state = 'state-123'): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: REDIRECT,
    scope: 'lernzeit',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    resource: RESOURCE,
  })
  return `${ORIGIN}/authorize?${params}`
}

function handleIn(html: string): string {
  const match = /name="handle" value="([^"]+)"/.exec(html)
  if (!match) throw new Error(`no handle in the page:\n${html}`)
  return match[1]
}

/** One browser going through the authorize page. */
class Browser {
  jar = new CookieJar()
  handle = ''
  html = ''

  async open(url: string): Promise<Response> {
    const response = await SELF.fetch(url, { headers: { Cookie: this.jar.header }, redirect: 'manual' })
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

async function exchange(fields: Record<string, string>): Promise<Response> {
  return SELF.fetch(`${ORIGIN}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields),
  })
}

interface Tokens {
  access_token: string
  refresh_token: string
  token_type: string
  scope: string
}

/** Registers a client, allows it with the owner's password and returns its tokens. */
async function connect(name = 'Claude'): Promise<{ clientId: string; tokens: Tokens }> {
  const clientId = await register(name)
  const { verifier, challenge } = await pkce()
  const browser = new Browser()
  await browser.open(authorizeUrl(clientId, challenge))
  const allowed = await browser.allow(PASSWORD)
  expect(allowed.status).toBe(302)
  const code = new URL(allowed.headers.get('Location')!).searchParams.get('code')!
  const response = await exchange({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT, client_id: clientId, code_verifier: verifier, resource: RESOURCE })
  expect(response.status).toBe(200)
  return { clientId, tokens: await response.json<Tokens>() }
}

function mcp(method: string, token?: string): Promise<Response> {
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

async function toolNames(response: Response): Promise<string[]> {
  const text = await response.text()
  const json = text.startsWith('{') ? text : (/^data: (.*)$/m.exec(text)?.[1] ?? text)
  return (JSON.parse(json) as { result: { tools: { name: string }[] } }).result.tools.map((tool) => tool.name)
}

describe('OAuth discovery', () => {
  it('publishes the authorization server metadata', async () => {
    const response = await SELF.fetch(`${ORIGIN}/.well-known/oauth-authorization-server`)
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      issuer: ORIGIN,
      authorization_endpoint: `${ORIGIN}/authorize`,
      token_endpoint: `${ORIGIN}/token`,
      registration_endpoint: `${ORIGIN}/register`,
      code_challenge_methods_supported: ['S256'],
      scopes_supported: ['lernzeit'],
    })
  })

  it('publishes the protected resource metadata for /mcp', async () => {
    const response = await SELF.fetch(`${ORIGIN}/.well-known/oauth-protected-resource/mcp`)
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ resource: RESOURCE, authorization_servers: [ORIGIN], scopes_supported: ['lernzeit'] })
  })

  it('answers other discovery paths with a 404, not the web app', async () => {
    const response = await SELF.fetch(`${ORIGIN}/.well-known/openid-configuration`)
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'Not found' })
  })

  it('/mcp without a token is a 401 that points at the metadata', async () => {
    const response = await mcp('tools/list')
    expect(response.status).toBe(401)
    expect(response.headers.get('WWW-Authenticate')).toContain(`resource_metadata="${ORIGIN}/.well-known/oauth-protected-resource/mcp"`)
  })

  it('/mcp does not take a device token from /api/auth/login', async () => {
    const response = await mcp('tools/list', await deviceToken())
    expect(response.status).toBe(401)
  })
})

describe('the authorize page', () => {
  it('names the client and where access goes, and cannot be framed, cached or scripted', async () => {
    const clientId = await register()
    const browser = new Browser()
    const response = await browser.open(authorizeUrl(clientId, (await pkce()).challenge))
    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toMatch(/^text\/html/)
    expect(browser.html).toContain('Allow Claude to use your Lernzeit?')
    expect(browser.html).toContain('claude.ai')
    expect(browser.html).toMatch(/type="password"/)
    expect(browser.html).not.toContain(EMAIL)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(response.headers.get('X-Frame-Options')).toBe('DENY')
    const csp = response.headers.get('Content-Security-Policy') ?? ''
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).toContain("default-src 'none'")
    expect(csp).not.toMatch(/script-src/)
    expect(browser.html).not.toMatch(/<script/i)
  })

  it('escapes a client name with HTML in it', async () => {
    const clientId = await register('<script>alert(1)</script>"><img src=x onerror=alert(2)>')
    const browser = new Browser()
    await browser.open(authorizeUrl(clientId, (await pkce()).challenge))
    expect(browser.html).not.toContain('<script>')
    expect(browser.html).not.toContain('<img')
    expect(browser.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
  })

  it('shows an error, and does not redirect, for an unknown client', async () => {
    const response = await SELF.fetch(authorizeUrl('no-such-client', (await pkce()).challenge), { redirect: 'manual' })
    expect(response.status).toBe(400)
    expect(response.headers.get('Location')).toBeNull()
    expect(response.headers.get('X-Frame-Options')).toBe('DENY')
    expect(await response.text()).not.toMatch(/name="password"/)
  })

  it('Cancel sends the client access_denied with its state', async () => {
    const clientId = await register()
    const browser = new Browser()
    await browser.open(authorizeUrl(clientId, (await pkce()).challenge, 'my-state'))
    const response = await browser.submit({ decision: 'cancel' })
    expect(response.status).toBe(302)
    const location = new URL(response.headers.get('Location')!)
    expect(`${location.origin}${location.pathname}`).toBe(REDIRECT)
    expect(location.searchParams.get('error')).toBe('access_denied')
    expect(location.searchParams.get('state')).toBe('my-state')
    expect(location.searchParams.get('code')).toBeNull()
  })

  it('refuses a form whose handle was already used', async () => {
    const clientId = await register()
    const browser = new Browser()
    await browser.open(authorizeUrl(clientId, (await pkce()).challenge))
    const used = browser.handle
    const cookies = browser.jar.header
    expect((await browser.allow(PASSWORD)).status).toBe(302)

    const replay = await SELF.fetch(`${ORIGIN}/authorize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookies, 'CF-Connecting-IP': freshIp() },
      body: new URLSearchParams({ handle: used, password: PASSWORD, decision: 'allow' }),
      redirect: 'manual',
    })
    expect(replay.status).toBe(400)
    expect(replay.headers.get('Location')).toBeNull()
    expect(await replay.text()).toMatch(/start again/i)
  })

  it('refuses an unknown handle, and a handle sent without the cookie of the browser that opened the page', async () => {
    const clientId = await register()
    const browser = new Browser()
    await browser.open(authorizeUrl(clientId, (await pkce()).challenge))

    const unknown = await SELF.fetch(`${ORIGIN}/authorize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: browser.jar.header, 'CF-Connecting-IP': freshIp() },
      body: new URLSearchParams({ handle: 'made-up', password: PASSWORD, decision: 'allow' }),
      redirect: 'manual',
    })
    expect(unknown.status).toBe(400)
    expect(unknown.headers.get('Location')).toBeNull()

    const otherBrowser = await SELF.fetch(`${ORIGIN}/authorize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'CF-Connecting-IP': freshIp() },
      body: new URLSearchParams({ handle: browser.handle, password: PASSWORD, decision: 'allow' }),
      redirect: 'manual',
    })
    expect(otherBrowser.status).toBe(400)
    expect(otherBrowser.headers.get('Location')).toBeNull()

    // The real browser can still allow it.
    expect((await browser.allow(PASSWORD)).status).toBe(302)
  })
})

describe('connecting Claude', () => {
  it('register → authorize → wrong password → rate limit → right password → token with PKCE → tools/list', async () => {
    const clientId = await register()
    const { verifier, challenge } = await pkce()
    const browser = new Browser()
    await browser.open(authorizeUrl(clientId, challenge))

    const ip = freshIp()
    for (let attempt = 1; attempt <= 10; attempt++) {
      const wrong = await browser.allow('not the password', ip)
      expect(wrong.status).toBe(401)
      expect(browser.html).toContain('Wrong password')
      expect(browser.html).toContain('Allow Claude to use your Lernzeit?')
    }
    const limited = await browser.allow(PASSWORD, ip)
    expect(limited.status).toBe(429)
    expect(browser.html).toContain('Too many attempts. Try again in 15 minutes.')
    // The limit is the same one /api/auth/login keeps.
    expect((await login({ email: EMAIL, password: PASSWORD }, ip)).status).toBe(429)

    const allowed = await browser.allow(PASSWORD)
    expect(allowed.status).toBe(302)
    const location = new URL(allowed.headers.get('Location')!)
    expect(`${location.origin}${location.pathname}`).toBe(REDIRECT)
    expect(location.searchParams.get('state')).toBe('state-123')
    expect(location.searchParams.get('iss')).toBe(ORIGIN)
    const code = location.searchParams.get('code')!
    expect(code).toBeTruthy()

    const wrongVerifier = await exchange({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT, client_id: clientId, code_verifier: (await pkce()).verifier })
    expect(wrongVerifier.status).toBe(400)

    // A failed verifier spends the code, so the flow runs again for the real exchange.
    await browser.open(authorizeUrl(clientId, challenge))
    const again = await browser.allow(PASSWORD)
    const secondCode = new URL(again.headers.get('Location')!).searchParams.get('code')!
    const response = await exchange({ grant_type: 'authorization_code', code: secondCode, redirect_uri: REDIRECT, client_id: clientId, code_verifier: verifier, resource: RESOURCE })
    expect(response.status).toBe(200)
    const tokens = await response.json<Tokens>()
    expect(tokens.token_type.toLowerCase()).toBe('bearer')
    expect(tokens.scope).toBe('lernzeit')
    expect(tokens.refresh_token).toBeTruthy()

    const listed = await mcp('tools/list', tokens.access_token)
    expect(listed.status).toBe(200)
    expect(await toolNames(listed)).toContain('create_cards')
  })

  it('stores the client name with the grant', async () => {
    const { clientId } = await connect('Claude Desktop')
    const grants = (await getOAuthApi(oauthOptions(ORIGIN), env).listUserGrants('owner')).items.filter((grant) => grant.clientId === clientId)
    expect(grants).toHaveLength(1)
    expect(grants[0]).toMatchObject({ userId: 'owner', scope: ['lernzeit'], metadata: { client: 'Claude Desktop' } })
  })

  it('a token stops working when the owner is set again (npm run cloud:owner), and so does its refresh token', async () => {
    const { clientId, tokens } = await connect()
    expect((await mcp('tools/list', tokens.access_token)).status).toBe(200)

    await env.DB.prepare('UPDATE owner SET created_at = created_at + 1').run()

    const refused = await mcp('tools/list', tokens.access_token)
    expect(refused.status).toBe(401)
    expect(refused.headers.get('WWW-Authenticate')).toContain('error="invalid_token"')
    expect(refused.headers.get('WWW-Authenticate')).toContain(`resource_metadata="${ORIGIN}/.well-known/oauth-protected-resource/mcp"`)

    const refreshed = await exchange({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token, client_id: clientId })
    expect(refreshed.status).toBe(400)
  })

  it('a token whose owner row is gone is refused', async () => {
    const { tokens } = await connect()
    await env.DB.prepare('DELETE FROM owner').run()
    expect((await mcp('tools/list', tokens.access_token)).status).toBe(401)
  })

  it('a revoked grant is refused', async () => {
    const { clientId, tokens } = await connect()
    const oauth = getOAuthApi(oauthOptions(ORIGIN), env)
    const grant = (await oauth.listUserGrants('owner')).items.find((item) => item.clientId === clientId)!
    await oauth.revokeGrant(grant.id, 'owner')
    expect((await mcp('tools/list', tokens.access_token)).status).toBe(401)
  })

  it('a new authorization after the owner changed works again', async () => {
    await connect()
    await env.DB.prepare('UPDATE owner SET created_at = created_at + 1').run()
    const { tokens } = await connect()
    expect((await mcp('tools/list', tokens.access_token)).status).toBe(200)
  })
})

describe('the API next to OAuth', () => {
  it('/api/* still works with the session cookie and with a device token', async () => {
    expect(await (await SELF.fetch(`${ORIGIN}/api/health`)).json()).toEqual({ ok: true })

    const signedIn = await login({ email: EMAIL, password: PASSWORD })
    const status = await SELF.fetch(`${ORIGIN}/api/auth/status`, { headers: { Cookie: sessionCookie(signedIn) } })
    expect(await status.json()).toEqual({ signedIn: true, email: EMAIL })

    const devices = await SELF.fetch(`${ORIGIN}/api/auth/devices`, { headers: { Authorization: `Bearer ${await deviceToken()}` } })
    expect(devices.status).toBe(200)

    const pull = await SELF.fetch(`${ORIGIN}/api/sync/pull`, { headers: { Authorization: `Bearer ${await deviceToken()}` } })
    expect(pull.status).toBe(200)

    const missing = await SELF.fetch(`${ORIGIN}/api/nope`)
    expect(missing.status).toBe(404)
    expect(await missing.json()).toEqual({ error: 'Not found' })
  })

  it('on plain http off loopback (a phone on the LAN) the API works and /authorize says it needs https', async () => {
    expect((await SELF.fetch('http://192.168.1.20:8787/api/health')).status).toBe(200)
    const page = await SELF.fetch('http://192.168.1.20:8787/authorize')
    expect(page.status).toBe(404)
    expect(await page.text()).toContain('needs the https address')
  })

  it('an OAuth token does not open /api/*', async () => {
    const { tokens } = await connect()
    const response = await SELF.fetch(`${ORIGIN}/api/auth/devices`, { headers: { Authorization: `Bearer ${tokens.access_token}` } })
    expect(response.status).toBe(401)
  })
})
