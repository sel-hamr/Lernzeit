import { SELF } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { beforeEach, describe, expect, it } from 'vitest'
import { hashPassword } from '../src/password.ts'
import { EMAIL, FIXED_SALT, PASSWORD, freshIp, login, seedOwner, sessionCookie } from './helpers.ts'

// The same constant is asserted in scripts/cloud-owner.test.ts under Node, so both runtimes agree.
const FIXED_HASH = 'ecl4blu17pBoxkrH63Kux00yUmxC0OKrKmdgPsjX0+A='

beforeEach(seedOwner)

describe('password hashing in Workers', () => {
  it('makes the same hash for a fixed salt as Node does', async () => {
    expect(await hashPassword(PASSWORD, FIXED_SALT)).toEqual({ hash: FIXED_HASH, salt: FIXED_SALT, iterations: 100_000 })
  })
})

describe('sign-in', () => {
  it('login with the right password sets an HttpOnly Secure SameSite=Lax cookie and status says signedIn', async () => {
    const response = await login({ email: EMAIL, password: PASSWORD })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ email: EMAIL })

    const header = response.headers.get('Set-Cookie') ?? ''
    expect(header).toMatch(/^lz_session=[A-Za-z0-9_-]{43};/)
    expect(header).toContain('HttpOnly')
    expect(header).toContain('Secure')
    expect(header).toContain('SameSite=Lax')
    expect(header).toContain('Path=/')
    expect(header).toContain('Max-Age=34560000')

    const status = await SELF.fetch('https://x/api/auth/status', { headers: { Cookie: sessionCookie(response) } })
    expect(await status.json()).toEqual({ signedIn: true, email: EMAIL })
  })

  it('status without a session says signed out', async () => {
    const status = await SELF.fetch('https://x/api/auth/status')
    expect(await status.json()).toEqual({ signedIn: false })
  })

  it('takes the email in any case and with spaces around it', async () => {
    const response = await login({ email: '  Owner@Example.COM ', password: PASSWORD })
    expect(response.status).toBe(200)
  })

  it('login with device returns a token and no cookie; the Bearer token passes requireOwner', async () => {
    const response = await login({ email: EMAIL, password: PASSWORD, device: { name: 'Pixel 8' } })
    expect(response.status).toBe(200)
    expect(response.headers.get('Set-Cookie')).toBeNull()
    const body = await response.json<{ email: string; token: string }>()
    expect(body.email).toBe(EMAIL)
    expect(body.token).toMatch(/^[A-Za-z0-9_-]{43}$/)

    const devices = await SELF.fetch('https://x/api/auth/devices', { headers: { Authorization: `Bearer ${body.token}` } })
    expect(devices.status).toBe(200)
    const list = await devices.json<{ id: string; kind: string; name: string; createdAt: number; lastUsedAt: number }[]>()
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ kind: 'device', name: 'Pixel 8' })
    expect(list[0].id).toMatch(/^[0-9a-f]{12}$/)
    expect(list[0].createdAt).toBeTypeOf('number')
    expect(list[0].lastUsedAt).toBeTypeOf('number')

    const status = await SELF.fetch('https://x/api/auth/status', { headers: { Authorization: `Bearer ${body.token}` } })
    expect(await status.json()).toEqual({ signedIn: true, email: EMAIL })
  })

  it('stores only the SHA-256 of a token, never the token', async () => {
    const response = await login({ email: EMAIL, password: PASSWORD, device: { name: 'Pixel 8' } })
    const { token } = await response.json<{ token: string }>()
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)))
    const hex = [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('')
    const rows = await env.DB.prepare('SELECT token_hash FROM auth_tokens').all<{ token_hash: string }>()
    expect(rows.results).toEqual([{ token_hash: hex }])
  })

  it("wrong password → 401 with 'Wrong email or password'", async () => {
    const response = await login({ email: EMAIL, password: 'correct horse 2' })
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'Wrong email or password' })
    expect(response.headers.get('Set-Cookie')).toBeNull()
  })

  it('an unknown email gets the same answer as a wrong password', async () => {
    const response = await login({ email: 'someone@example.com', password: PASSWORD })
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'Wrong email or password' })
  })

  it('a body without an email or password is a 400', async () => {
    const response = await login({ email: EMAIL })
    expect(response.status).toBe(400)
    const broken = await SELF.fetch('https://x/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': freshIp() },
      body: '{nope',
    })
    expect(broken.status).toBe(400)
  })

  it('login without a JSON Content-Type → 415, and with a charset it is fine', async () => {
    const body = JSON.stringify({ email: EMAIL, password: PASSWORD })
    for (const type of [undefined, 'text/plain', 'application/x-www-form-urlencoded']) {
      const headers: Record<string, string> = { 'CF-Connecting-IP': freshIp() }
      if (type) headers['Content-Type'] = type
      const response = await SELF.fetch('https://x/api/auth/login', { method: 'POST', headers, body })
      expect(response.status).toBe(415)
      expect(await response.json()).toEqual({ error: 'Send JSON (Content-Type: application/json).' })
      expect(response.headers.get('Cache-Control')).toBe('no-store')
    }
    const withCharset = await SELF.fetch('https://x/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'Application/JSON; charset=utf-8', 'CF-Connecting-IP': freshIp() },
      body,
    })
    expect(withCharset.status).toBe(200)
  })

  it('logout with both a Bearer token and a cookie signs both out', async () => {
    const cookie = sessionCookie(await login({ email: EMAIL, password: PASSWORD }))
    const { token } = await (await login({ email: EMAIL, password: PASSWORD, device: { name: 'Pixel 8' } })).json<{ token: string }>()
    const logout = await SELF.fetch('https://x/api/auth/logout', { method: 'POST', headers: { Cookie: cookie, Authorization: `Bearer ${token}` } })
    expect(logout.status).toBe(200)
    expect((await SELF.fetch('https://x/api/auth/devices', { headers: { Cookie: cookie } })).status).toBe(401)
    expect((await SELF.fetch('https://x/api/auth/devices', { headers: { Authorization: `Bearer ${token}` } })).status).toBe(401)
    const left = await env.DB.prepare('SELECT COUNT(*) AS n FROM auth_tokens').first<{ n: number }>()
    expect(left?.n).toBe(0)
  })

  it('11th failed attempt from one IP → 429', async () => {
    const ip = freshIp()
    for (let attempt = 1; attempt <= 10; attempt++) {
      const response = await login({ email: EMAIL, password: 'wrong password' }, ip)
      expect(response.status).toBe(401)
    }
    const blocked = await login({ email: EMAIL, password: PASSWORD }, ip)
    expect(blocked.status).toBe(429)
    expect(await blocked.json()).toEqual({ error: 'Too many attempts. Try again in 15 minutes.' })

    // Another address is not blocked.
    expect((await login({ email: EMAIL, password: PASSWORD })).status).toBe(200)
  })

  it('attempts sent in parallel cannot slip past the limit', async () => {
    const ip = freshIp()
    const responses = await Promise.all(Array.from({ length: 15 }, () => login({ email: EMAIL, password: 'wrong password' }, ip)))
    const statuses = responses.map((response) => response.status).sort()
    expect(statuses).toEqual([...Array(10).fill(401), ...Array(5).fill(429)])
    expect((await login({ email: EMAIL, password: PASSWORD }, ip)).status).toBe(429)
  })

  it('successful logins do not count toward the limit', async () => {
    const ip = freshIp()
    for (let attempt = 1; attempt <= 12; attempt++) {
      expect((await login({ email: EMAIL, password: PASSWORD }, ip)).status).toBe(200)
    }
  })

  it('attempts older than 15 minutes are deleted and no longer count', async () => {
    const ip = freshIp()
    const old = Date.now() - 16 * 60 * 1000
    await env.DB.batch(Array.from({ length: 10 }, () => env.DB.prepare('INSERT INTO login_attempts (ip, at) VALUES (?, ?)').bind(ip, old)))
    expect((await login({ email: EMAIL, password: PASSWORD }, ip)).status).toBe(200)
    const left = await env.DB.prepare('SELECT COUNT(*) AS n FROM login_attempts WHERE ip = ?').bind(ip).first<{ n: number }>()
    expect(left?.n).toBe(0)
  })

  it('logout makes the cookie stop working', async () => {
    const cookie = sessionCookie(await login({ email: EMAIL, password: PASSWORD }))
    const logout = await SELF.fetch('https://x/api/auth/logout', { method: 'POST', headers: { Cookie: cookie } })
    expect(logout.status).toBe(200)
    expect(logout.headers.get('Set-Cookie')).toMatch(/^lz_session=;.*Max-Age=0/)

    const status = await SELF.fetch('https://x/api/auth/status', { headers: { Cookie: cookie } })
    expect(await status.json()).toEqual({ signedIn: false })
    const devices = await SELF.fetch('https://x/api/auth/devices', { headers: { Cookie: cookie } })
    expect(devices.status).toBe(401)
    expect(await devices.json()).toEqual({ error: 'Signed out' })
  })

  it('revoking a device makes its token stop working', async () => {
    const cookie = sessionCookie(await login({ email: EMAIL, password: PASSWORD }))
    const { token } = await (await login({ email: EMAIL, password: PASSWORD, device: { name: 'Pixel 8' } })).json<{ token: string }>()

    const list = await (await SELF.fetch('https://x/api/auth/devices', { headers: { Cookie: cookie } })).json<{ id: string; kind: string }[]>()
    expect(list.map((device) => device.kind).sort()).toEqual(['device', 'web'])
    const phone = list.find((device) => device.kind === 'device')!

    const revoke = await SELF.fetch(`https://x/api/auth/devices/${phone.id}`, { method: 'DELETE', headers: { Cookie: cookie } })
    expect(revoke.status).toBe(200)

    const after = await SELF.fetch('https://x/api/auth/devices', { headers: { Authorization: `Bearer ${token}` } })
    expect(after.status).toBe(401)
    // The browser that revoked it is still signed in.
    expect((await SELF.fetch('https://x/api/auth/devices', { headers: { Cookie: cookie } })).status).toBe(200)
  })

  it('revoking an unknown device is a 404', async () => {
    const cookie = sessionCookie(await login({ email: EMAIL, password: PASSWORD }))
    const response = await SELF.fetch('https://x/api/auth/devices/000000000000', { method: 'DELETE', headers: { Cookie: cookie } })
    expect(response.status).toBe(404)
  })

  it('marks a token used at most once an hour', async () => {
    const { token } = await (await login({ email: EMAIL, password: PASSWORD, device: { name: 'Pixel 8' } })).json<{ token: string }>()
    const lastUsed = async () => (await env.DB.prepare('SELECT last_used_at AS at FROM auth_tokens').first<{ at: number }>())!.at
    const use = () => SELF.fetch('https://x/api/auth/devices', { headers: { Authorization: `Bearer ${token}` } })

    const recent = Date.now() - 10 * 60 * 1000
    await env.DB.prepare('UPDATE auth_tokens SET last_used_at = ?').bind(recent).run()
    await use()
    expect(await lastUsed()).toBe(recent)

    const old = Date.now() - 2 * 60 * 60 * 1000
    await env.DB.prepare('UPDATE auth_tokens SET last_used_at = ?').bind(old).run()
    await use()
    expect(await lastUsed()).toBeGreaterThan(Date.now() - 60 * 1000)
  })

  it('a made-up token is signed out', async () => {
    const response = await SELF.fetch('https://x/api/auth/devices', { headers: { Authorization: 'Bearer not-a-real-token' } })
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'Signed out' })
  })

  it('GET /api/sync/pull without a session → 401', async () => {
    const response = await SELF.fetch('https://x/api/sync/pull')
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'Signed out' })
  })
})
