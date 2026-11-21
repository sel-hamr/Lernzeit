import { getOAuthApi } from '@cloudflare/workers-oauth-provider'
import { SELF } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { beforeEach, describe, expect, it } from 'vitest'
import { oauthOptions } from '../src/index.ts'
import { DEFAULT_REDIRECT_HOSTS, redirectAllowed, redirectHosts } from '../src/redirects.ts'
import { EMAIL, PASSWORD, clearSyncData, deviceToken, freshIp, login, seedOwner, sessionCookie } from './helpers.ts'
import {
  Browser,
  ORIGIN,
  REDIRECT,
  RESOURCE,
  authorizeUrl,
  connect,
  exchange,
  mcp,
  pkce,
  register,
  registerRequest,
  toolNames,
  type Tokens,
} from './oauthHelpers.ts'

beforeEach(async () => {
  await seedOwner()
  await clearSyncData()
})

/**
 * Counts the Worker's calls to its OAuth KV namespace (the test's `env` is the Worker's): writes are
 * put and delete, the calls a free plan's daily limit counts.
 */
function watchKv(): { writes: () => number; calls: () => number; stop: () => void } {
  const kv = env.OAUTH_KV as unknown as Record<string, (...args: unknown[]) => unknown>
  const names = ['put', 'delete', 'get', 'list', 'getWithMetadata']
  const originals = Object.fromEntries(names.map((name) => [name, kv[name]]))
  let writes = 0
  let calls = 0
  for (const name of names) {
    kv[name] = (...args: unknown[]) => {
      calls++
      if (name === 'put' || name === 'delete') writes++
      return originals[name].apply(env.OAUTH_KV, args)
    }
  }
  return { writes: () => writes, calls: () => calls, stop: () => names.forEach((name) => delete kv[name]) }
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
    const response = await SELF.fetch(authorizeUrl('no-such-client', (await pkce()).challenge), { headers: { 'CF-Connecting-IP': freshIp() }, redirect: 'manual' })
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

describe('redirect hosts', () => {
  it.each([
    'https://claude.ai/api/mcp/auth_callback',
    'https://claude.com/api/mcp/auth_callback',
    'http://localhost:33418/callback',
    'http://127.0.0.1:5173/cb',
    'http://[::1]:8000/cb',
    'https://localhost/cb',
  ])('registers and connects a client that calls back to %s', async (redirect) => {
    const { tokens } = await connect('Claude', redirect)
    expect((await mcp('tools/list', tokens.access_token)).status).toBe(200)
  })

  it.each([
    'https://claude.ai.evil.com/cb',
    'https://evilclaude.ai/cb',
    'https://evil.com/cb',
    'http://claude.ai/cb',
    'https://claude.ai@evil.com/cb',
    'https://sub.claude.ai/cb',
    'http://localhost.evil.com/cb',
    'http://127.0.0.2/cb',
  ])('refuses to register a client that calls back to %s', async (redirect) => {
    const response = await registerRequest([redirect])
    expect(response.status).toBe(400)
    const body = await response.json<{ error: string; error_description: string }>()
    // Remote http and userinfo are already refused by the provider's own rules, before Lernzeit's list.
    if (body.error === 'invalid_client_metadata') expect(body.error_description).toMatch(/redirect/i)
    else {
      expect(body.error).toBe('invalid_redirect_uri')
      expect(body.error_description).toMatch(/does not send access to .*Allowed: https on claude\.ai, claude\.com/)
    }
  })

  it('refuses a registration when any one of its redirect URIs is not allowed', async () => {
    expect((await registerRequest([REDIRECT, 'https://evil.com/cb'])).status).toBe(400)
  })

  it('the authorize page refuses a client stored with another redirect host, and does not redirect there', async () => {
    // A client made outside /register, as one from before the allowlist would be.
    const client = await getOAuthApi(oauthOptions(ORIGIN), env).createClient({ clientName: 'Old', redirectUris: ['https://evil.com/cb'], tokenEndpointAuthMethod: 'none' })
    const before = (await env.OAUTH_KV.list({ prefix: 'transaction:' })).keys.length
    const response = await SELF.fetch(authorizeUrl(client.clientId, (await pkce()).challenge, 's', 'https://evil.com/cb'), {
      headers: { 'CF-Connecting-IP': freshIp() },
      redirect: 'manual',
    })
    expect(response.status).toBe(400)
    expect(response.headers.get('Location')).toBeNull()
    const html = await response.text()
    expect(html).toContain('evil.com')
    expect(html).not.toMatch(/name="password"/)
    expect((await env.OAUTH_KV.list({ prefix: 'transaction:' })).keys.length).toBe(before)
  })

  it('reads the allowlist from OAUTH_REDIRECT_HOSTS', () => {
    const hosts = redirectHosts(' Example.org , localhost ')
    expect(hosts).toEqual(['example.org', 'localhost'])
    expect(redirectAllowed('https://example.org/cb', hosts)).toBe(true)
    expect(redirectAllowed('https://claude.ai/cb', hosts)).toBe(false)
    expect(redirectAllowed('http://example.org/cb', hosts)).toBe(false)
    expect(redirectAllowed('http://localhost:9/cb', hosts)).toBe(true)
    expect(redirectHosts(undefined)).toEqual(redirectHosts(DEFAULT_REDIRECT_HOSTS))
    expect(redirectHosts(' , ')).toEqual(redirectHosts(DEFAULT_REDIRECT_HOSTS))
  })
})

describe('OAuth rate limits', () => {
  it('the 11th registration from one address in an hour is a 429, before anything is stored', async () => {
    const ip = freshIp()
    for (let n = 1; n <= 10; n++) expect((await registerRequest([REDIRECT], ip)).status).toBe(201)
    const before = (await env.OAUTH_KV.list()).keys.length
    const refused = await registerRequest([REDIRECT], ip)
    expect(refused.status).toBe(429)
    expect((await refused.json<{ error_description: string }>()).error_description).toMatch(/Try again in an hour/)
    expect((await env.OAUTH_KV.list()).keys.length).toBe(before)
    // Another address is not affected.
    expect((await registerRequest([REDIRECT])).status).toBe(201)
  })

  it('the 31st opening of the authorize page from one address in 15 minutes is a 429, before anything is stored', async () => {
    const clientId = await register()
    const { challenge } = await pkce()
    const browser = new Browser()
    for (let n = 1; n <= 30; n++) expect((await browser.open(authorizeUrl(clientId, challenge))).status).toBe(200)
    const before = (await env.OAUTH_KV.list()).keys.length
    const refused = await browser.open(authorizeUrl(clientId, challenge))
    expect(refused.status).toBe(429)
    expect(browser.html).toContain('Too many tries from this address. Try again in 15 minutes.')
    expect(refused.headers.get('X-Frame-Options')).toBe('DENY')
    expect((await env.OAUTH_KV.list()).keys.length).toBe(before)
    // Another browser on another address still gets the page.
    expect((await new Browser().open(authorizeUrl(clientId, challenge))).status).toBe(200)
  })
})

describe('the authorize form under attack', () => {
  it('KV calls are what this test watches', async () => {
    const kv = watchKv()
    try {
      await new Browser().open(authorizeUrl(await register(), (await pkce()).challenge))
      expect(kv.writes()).toBeGreaterThan(0)
    } finally {
      kv.stop()
    }
  })

  it('after the 10th wrong password the form is gone: no new handle, and no KV call at all', async () => {
    const clientId = await register()
    const browser = new Browser()
    await browser.open(authorizeUrl(clientId, (await pkce()).challenge))
    const ip = freshIp()
    for (let attempt = 1; attempt <= 10; attempt++) expect((await browser.allow('not the password', ip)).status).toBe(401)

    const kv = watchKv()
    try {
      for (let attempt = 11; attempt <= 15; attempt++) {
        const refused = await browser.allow(PASSWORD, ip)
        expect(refused.status).toBe(429)
        expect(browser.html).toContain('Too many attempts. Try again in 15 minutes.')
        expect(browser.html).not.toMatch(/<form|name="handle"/)
        expect(refused.headers.getSetCookie().filter((cookie) => !/Max-Age=0/i.test(cookie))).toEqual([])
      }
      expect(kv.calls()).toBe(0)
    } finally {
      kv.stop()
    }
  })

  it('sending the form counts against the authorize limit, which refuses before any KV call', async () => {
    const clientId = await register()
    const browser = new Browser()
    await browser.open(authorizeUrl(clientId, (await pkce()).challenge))
    const ip = freshIp()
    for (let n = 1; n <= 30; n++) {
      const bogus = await SELF.fetch(`${ORIGIN}/authorize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'CF-Connecting-IP': ip },
        body: new URLSearchParams({ handle: 'made-up', password: 'x', decision: 'allow' }),
        redirect: 'manual',
      })
      expect(bogus.status).toBe(400)
    }

    const kv = watchKv()
    try {
      const refused = await browser.allow(PASSWORD, ip)
      expect(refused.status).toBe(429)
      expect(browser.html).toContain('Too many tries from this address. Try again in 15 minutes.')
      expect(browser.html).not.toMatch(/<form|name="handle"/)
      expect(kv.calls()).toBe(0)
    } finally {
      kv.stop()
    }
    // The handle was not touched, so the owner on another address can still allow.
    expect((await browser.allow(PASSWORD)).status).toBe(302)
  })

  it('an error in the request redirects to an allowed client, with the error', async () => {
    const clientId = await register()
    const url = new URL(authorizeUrl(clientId, (await pkce()).challenge, 'st'))
    url.searchParams.delete('code_challenge')
    url.searchParams.delete('code_challenge_method')
    const response = await SELF.fetch(url, { headers: { 'CF-Connecting-IP': freshIp() }, redirect: 'manual' })
    expect(response.status).toBe(302)
    const location = new URL(response.headers.get('Location')!)
    expect(`${location.origin}${location.pathname}`).toBe(REDIRECT)
    expect(location.searchParams.get('error')).toBeTruthy()
    expect(location.searchParams.get('state')).toBe('st')
  })

  it('an error in the request of a client with a host off the allowlist shows the page, never a redirect', async () => {
    // Made outside /register, as one from before the allowlist would be.
    const client = await getOAuthApi(oauthOptions(ORIGIN), env).createClient({ clientName: 'Old', redirectUris: ['https://evil.com/cb'], tokenEndpointAuthMethod: 'none' })
    const url = new URL(authorizeUrl(client.clientId, (await pkce()).challenge, 'st', 'https://evil.com/cb'))
    url.searchParams.delete('code_challenge')
    url.searchParams.delete('code_challenge_method')
    const response = await SELF.fetch(url, { headers: { 'CF-Connecting-IP': freshIp() }, redirect: 'manual' })
    expect(response.status).toBe(400)
    expect(response.headers.get('Location')).toBeNull()
    expect(response.headers.get('X-Frame-Options')).toBe('DENY')
  })

  it('a registration expires after 30 days unless it is used', async () => {
    const response = await registerRequest([REDIRECT])
    const body = await response.json<{ client_id_issued_at: number; client_secret_expires_at?: number }>()
    const [key] = (await env.OAUTH_KV.list({ prefix: `client:${(body as unknown as { client_id: string }).client_id}` })).keys
    expect(key.expiration).toBeGreaterThan(Date.now() / 1000 + 29 * 24 * 3600)
    expect(key.expiration).toBeLessThanOrEqual(Date.now() / 1000 + 30 * 24 * 3600 + 5)
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
