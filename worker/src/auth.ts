/**
 * Sign-in for the one owner account. The web app gets an HttpOnly session cookie; a device such as
 * the phone app gets the same kind of token in the response and sends it as `Authorization: Bearer`.
 * Tokens are 32 random bytes; only their SHA-256 is stored, so a leaked database signs nobody in.
 * There is no sign-up: `npm run cloud:owner` writes the owner straight into D1.
 */
import { Hono, type Context } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { createMiddleware } from 'hono/factory'
import type { AppEnv } from './env.ts'
import { requireJson } from './http.ts'
import { PBKDF2_ITERATIONS, verifyPassword, type StoredPassword } from './password.ts'

export const SESSION_COOKIE = 'lz_session'
const COOKIE_OPTIONS = { httpOnly: true, secure: true, sameSite: 'Lax', path: '/' } as const
/** 400 days, the longest a browser keeps a cookie. */
const SESSION_MAX_AGE = 34_560_000

const HOUR = 60 * 60 * 1000
const ATTEMPT_WINDOW = 15 * 60 * 1000
const MAX_FAILED_ATTEMPTS = 10
const MAX_PASSWORD_LENGTH = 1024
const MAX_DEVICE_NAME_LENGTH = 100
/** Real tokens are 43 characters; anything much longer is not worth hashing. */
const MAX_TOKEN_LENGTH = 128

/**
 * Checked against when the email is unknown, so a wrong email costs the same PBKDF2 as a wrong
 * password and the response time does not tell which one was wrong. No password matches it.
 */
const NO_OWNER: StoredPassword = { hash: 'A'.repeat(43) + '=', salt: 'A'.repeat(22) + '==', iterations: PBKDF2_ITERATIONS }

const WRONG = { error: 'Wrong email or password' }
const SIGNED_OUT = { error: 'Signed out' }
const TOO_MANY = { error: 'Too many attempts. Try again in 15 minutes.' }

interface Session {
  ownerId: string
  email: string
}

/** The token the request carries: a Bearer header (devices) or the session cookie (the web app). */
function presentedToken(c: Context<AppEnv>): string | undefined {
  const token = bearerToken(c) ?? getCookie(c, SESSION_COOKIE)
  return token && token.length <= MAX_TOKEN_LENGTH ? token : undefined
}

function bearerToken(c: Context<AppEnv>): string | undefined {
  return /^Bearer\s+(\S+)$/i.exec(c.req.header('Authorization') ?? '')?.[1]
}

/** The owner the request's token belongs to, or null. Marks the token used, at most once an hour. */
async function findSession(c: Context<AppEnv>): Promise<Session | null> {
  const token = presentedToken(c)
  if (!token) return null
  const tokenHash = await sha256Hex(token)
  // The join drops tokens whose owner was replaced, as `cloud:owner` does.
  const row = await c.env.DB.prepare(
    'SELECT t.owner_id AS ownerId, t.last_used_at AS lastUsedAt, o.email AS email FROM auth_tokens t JOIN owner o ON o.id = t.owner_id WHERE t.token_hash = ?',
  )
    .bind(tokenHash)
    .first<{ ownerId: string; lastUsedAt: number; email: string }>()
  if (!row) return null
  const now = Date.now()
  if (now - row.lastUsedAt >= HOUR) {
    await c.env.DB.prepare('UPDATE auth_tokens SET last_used_at = ? WHERE token_hash = ?').bind(now, tokenHash).run()
  }
  return { ownerId: row.ownerId, email: row.email }
}

/** Lets the request through only with a valid session cookie or Bearer token, and sets `ownerId`. */
export const requireOwner = createMiddleware<AppEnv>(async (c, next) => {
  const session = await findSession(c)
  if (!session) return c.json(SIGNED_OUT, 401)
  c.set('ownerId', session.ownerId)
  await next()
})

interface LoginRequest {
  email: string
  password: string
  device?: { name: string }
}

function parseLogin(body: unknown): LoginRequest | null {
  if (typeof body !== 'object' || body === null) return null
  const { email, password, device } = body as Record<string, unknown>
  if (typeof email !== 'string' || typeof password !== 'string' || password.length > MAX_PASSWORD_LENGTH) return null
  if (device === undefined) return { email, password }
  if (typeof device !== 'object' || device === null) return null
  const name = (device as Record<string, unknown>).name
  if (typeof name !== 'string' || !name.trim()) return null
  return { email, password, device: { name: name.trim().slice(0, MAX_DEVICE_NAME_LENGTH) } }
}

export const auth = new Hono<AppEnv>()

auth.get('/status', async (c) => {
  const session = await findSession(c)
  return c.json(session ? { signedIn: true, email: session.email } : { signedIn: false })
})

auth.post('/login', requireJson, async (c) => {
  const login = parseLogin(await c.req.json().catch(() => null))
  if (!login) return c.json({ error: 'Send an email and a password.' }, 400)

  const db = c.env.DB
  const ip = c.req.header('CF-Connecting-IP') ?? 'unknown'
  const now = Date.now()
  // Every attempt is written down before the password is checked, and counted in the same
  // transaction, so attempts sent in parallel cannot all slip under the limit. A successful or
  // refused attempt is taken off again; only failed ones stay for the 15 minutes.
  const [, inserted, counted] = await db.batch<{ id: number } | { n: number }>([
    db.prepare('DELETE FROM login_attempts WHERE at <= ?').bind(now - ATTEMPT_WINDOW),
    db.prepare('INSERT INTO login_attempts (ip, at) VALUES (?, ?) RETURNING rowid AS id').bind(ip, now),
    db.prepare('SELECT COUNT(*) AS n FROM login_attempts WHERE ip = ?').bind(ip),
  ])
  const attempt = (inserted.results[0] as { id: number }).id
  const forgetAttempt = db.prepare('DELETE FROM login_attempts WHERE rowid = ?').bind(attempt)
  if ((counted.results[0] as { n: number }).n > MAX_FAILED_ATTEMPTS) {
    await forgetAttempt.run()
    return c.json(TOO_MANY, 429)
  }

  const owner = await db
    .prepare('SELECT id, email, pass_hash AS hash, pass_salt AS salt, iterations FROM owner WHERE email = ?')
    .bind(login.email.trim().toLowerCase())
    .first<{ id: string; email: string } & StoredPassword>()
  const matches = await verifyPassword(login.password, owner ?? NO_OWNER)
  if (!owner || !matches) return c.json(WRONG, 401)

  const token = newToken()
  const tokenHash = await sha256Hex(token)
  const kind = login.device ? 'device' : 'web'
  const name = login.device ? login.device.name : 'Web browser'
  const statements = [
    forgetAttempt,
    db
      .prepare('INSERT INTO auth_tokens (token_hash, owner_id, kind, name, created_at, last_used_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(tokenHash, owner.id, kind, name, now, now),
  ]
  // Signing in again in the same browser replaces its session instead of piling up another one.
  const previous = kind === 'web' ? getCookie(c, SESSION_COOKIE) : undefined
  if (previous && previous.length <= MAX_TOKEN_LENGTH) {
    statements.push(db.prepare("DELETE FROM auth_tokens WHERE token_hash = ? AND kind = 'web'").bind(await sha256Hex(previous)))
  }
  await db.batch(statements)

  if (login.device) return c.json({ email: owner.email, token })
  setCookie(c, SESSION_COOKIE, token, { ...COOKIE_OPTIONS, maxAge: SESSION_MAX_AGE })
  return c.json({ email: owner.email })
})

// Signs out both the Bearer token and the cookie when a request carries both.
auth.post('/logout', async (c) => {
  const tokens = new Set<string>()
  for (const token of [bearerToken(c), getCookie(c, SESSION_COOKIE)]) {
    if (token && token.length <= MAX_TOKEN_LENGTH) tokens.add(token)
  }
  if (tokens.size > 0) {
    const hashes = await Promise.all([...tokens].map(sha256Hex))
    await c.env.DB.batch(hashes.map((hash) => c.env.DB.prepare('DELETE FROM auth_tokens WHERE token_hash = ?').bind(hash)))
  }
  deleteCookie(c, SESSION_COOKIE, COOKIE_OPTIONS)
  return c.json({ ok: true })
})

/** The browsers and devices signed in. A device's id is the start of its token's hash. */
auth.get('/devices', requireOwner, async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT substr(token_hash, 1, 12) AS id, kind, name, created_at AS createdAt, last_used_at AS lastUsedAt FROM auth_tokens WHERE owner_id = ? ORDER BY last_used_at DESC',
  )
    .bind(c.get('ownerId'))
    .all<{ id: string; kind: 'web' | 'device'; name: string; createdAt: number; lastUsedAt: number }>()
  return c.json(results)
})

auth.delete('/devices/:id', requireOwner, async (c) => {
  const id = c.req.param('id')
  if (!/^[0-9a-f]{12}$/.test(id)) return c.json({ error: 'No such device' }, 404)
  const result = await c.env.DB.prepare('DELETE FROM auth_tokens WHERE owner_id = ? AND substr(token_hash, 1, 12) = ?')
    .bind(c.get('ownerId'), id)
    .run()
  if (result.meta.changes === 0) return c.json({ error: 'No such device' }, 404)
  return c.json({ ok: true })
})

/** 32 random bytes as base64url, without padding (43 characters). */
function newToken(): string {
  let text = ''
  for (const byte of crypto.getRandomValues(new Uint8Array(32))) text += String.fromCharCode(byte)
  return btoa(text).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

async function sha256Hex(text: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('')
}
