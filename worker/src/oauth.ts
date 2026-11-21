/**
 * OAuth for the MCP endpoint, so Claude (or another MCP client) can use the owner's library.
 * `@cloudflare/workers-oauth-provider` serves discovery, client registration and the token
 * endpoint, and checks the Bearer token on /mcp; this file has the parts that are Lernzeit's:
 *
 * - `/authorize`, the page where the owner types their password to allow a client. The parsed
 *   request stays on the server between the page and its form (the provider's consent helpers keep
 *   it in KV, encrypted, under a one-time handle bound to this browser by a SameSite cookie), so the
 *   form cannot be forged from another site or replayed. The password is checked by the same code,
 *   and under the same rate limit, as `/api/auth/login`.
 * - `mcpApi`, which /mcp reaches with a valid token. A grant remembers when the owner was written
 *   (`ownerCreatedAt`); `npm run cloud:owner` writes it again, so every grant made before a
 *   password change stops working, and is revoked, on its next call.
 */
import { AuthorizationError, CimdFetchError, insufficientScope, type ConsentDescription, type OAuthResourceContext } from '@cloudflare/workers-oauth-provider'
import { Hono } from 'hono'
import { TOO_MANY_ATTEMPTS, checkPassword, clientIp, tooManyFailures } from './auth.ts'
import type { AppEnv, Env } from './env.ts'
import { mcpFetch } from './mcp/handler.ts'
import { authorizePage, errorPage } from './pages/authorize.ts'
import { AUTHORIZE_LIMIT, withinLimit } from './rateLimit.ts'
import { redirectAllowed, redirectHosts } from './redirects.ts'

/** The owner's id in every table, and the OAuth user every grant belongs to. */
export const OWNER_ID = 'owner'
/** The one scope: everything the tools can do. */
export const SCOPE = 'lernzeit'
export const MCP_PATH = '/mcp'

/** What a grant carries to every /mcp call. */
export interface McpProps {
  ownerId: string
  /** The owner row's `created_at` when the grant was made. */
  ownerCreatedAt: number
}

const EXPIRED = 'This page has expired or was already used. Start again from the app you are connecting.'

function newNonce(): string {
  let text = ''
  for (const byte of crypto.getRandomValues(new Uint8Array(16))) text += String.fromCharCode(byte)
  return btoa(text)
}

/**
 * Headers for an HTML page: no script at all, no framing, no caching, no referrer. The form may
 * post only here, and `formTarget` is the client's origin, since the answer to the form redirects
 * there and browsers hold that redirect to `form-action` too.
 */
function pageHeaders(nonce: string, formTarget?: string, base?: Headers): Headers {
  const headers = new Headers(base)
  const formAction = ["'self'", ...(formTarget && formTarget !== 'null' ? [formTarget] : [])].join(' ')
  headers.set('Content-Type', 'text/html; charset=utf-8')
  headers.set('Cache-Control', 'no-store')
  headers.set('X-Frame-Options', 'DENY')
  headers.set('X-Content-Type-Options', 'nosniff')
  headers.set('Referrer-Policy', 'no-referrer')
  headers.set('Content-Security-Policy', `default-src 'none'; style-src 'nonce-${nonce}'; form-action ${formAction}; frame-ancestors 'none'; base-uri 'none'`)
  return headers
}

function showError(message: string, status: number): Response {
  const nonce = newNonce()
  return new Response(errorPage(message, nonce), { status, headers: pageHeaders(nonce) })
}

function showConsent(details: ConsentDescription, handle: string, headers: Headers, error?: string, status = 200): Response {
  const nonce = newNonce()
  const page = authorizePage(
    { clientName: details.clientName, redirectHost: details.redirectHost, redirectIsLoopback: details.redirectIsLoopback, handle, error },
    nonce,
  )
  return new Response(page, { status, headers: pageHeaders(nonce, new URL(details.redirectUri).origin, headers) })
}

export const authorize = new Hono<AppEnv>()

// Without the provider (plain http off loopback, see index.ts) there is nothing to authorize.
authorize.use('/authorize', async (c, next) => {
  if (!c.env.OAUTH_PROVIDER) return showError('Connecting an app needs the https address of Lernzeit.', 404)
  await next()
})

/**
 * Opening the page and sending its form both touch KV (a stored request, a consumed handle), so
 * together they are limited per address, in D1, before any KV call. Null while under the limit.
 */
async function authorizeLimited(db: D1Database, request: Request): Promise<Response | null> {
  if (await withinLimit(db, AUTHORIZE_LIMIT, clientIp(request))) return null
  return tooMany('Too many tries from this address. Try again in 15 minutes.')
}

/** A 429 page with no form, so it hands out no new handle to try again with. */
function tooMany(message: string): Response {
  const refused = showError(message, 429)
  refused.headers.set('Retry-After', '900')
  return refused
}

authorize.get('/authorize', async (c) => {
  const limited = await authorizeLimited(c.env.DB, c.req.raw)
  if (limited) return limited
  const oauth = c.env.OAUTH_PROVIDER
  const hosts = redirectHosts(c.env.OAUTH_REDIRECT_HOSTS)
  try {
    const request = await oauth.parseAuthRequest(c.req.raw)
    // A client stored before the allowlist, or under another one, may still name another host.
    if (!redirectAllowed(request.redirectUri, hosts)) {
      const host = new URL(request.redirectUri).host
      return showError(`This app wants access sent to ${host}, which Lernzeit does not allow.`, 400)
    }
    const details = await oauth.describeConsent(request)
    const consent = await oauth.beginConsent(request)
    return showConsent(details, consent.handle, consent.headers)
  } catch (error) {
    // Redirecting is safe only once the provider has checked the client and its redirect URI, and
    // only to a host Lernzeit sends anything to.
    if (error instanceof AuthorizationError && error.redirectTo && error.redirectUri && redirectAllowed(error.redirectUri, hosts)) {
      return Response.redirect(error.redirectTo, 302)
    }
    if (error instanceof AuthorizationError) return showError(error.description, 400)
    if (error instanceof CimdFetchError) return showError('This app could not be checked.', 400)
    throw error
  }
})

authorize.post('/authorize', async (c) => {
  const form = await c.req.formData().catch(() => null)
  const handle = form?.get('handle')
  const decision = form?.get('decision')
  const password = form?.get('password')
  if (typeof handle !== 'string' || (decision !== 'allow' && decision !== 'cancel')) return showError(EXPIRED, 400)
  const limited = await authorizeLimited(c.env.DB, c.req.raw)
  if (limited) return limited

  const oauth = c.env.OAUTH_PROVIDER
  try {
    if (decision === 'cancel') {
      const denied = await oauth.denyConsent(c.req.raw, handle)
      return new Response(null, { status: 302, headers: denied.headers })
    }

    // Locked out: refuse before touching the handle, so the page costs no KV call and gives no new handle.
    if (await tooManyFailures(c.env.DB, clientIp(c.req.raw))) return tooMany(TOO_MANY_ATTEMPTS)

    // Takes the request out of storage, so the handle works once whatever the password.
    const approved = await oauth.approveConsent(c.req.raw, handle, { scope: [SCOPE] })
    const check = await checkPassword(c.env.DB, clientIp(c.req.raw), { id: OWNER_ID }, typeof password === 'string' ? password : '')
    if (!check.ok && check.reason === 'too_many') {
      // No form and no new handle: trying again means opening the page again, which is limited too.
      const refused = tooMany(TOO_MANY_ATTEMPTS)
      for (const cookie of approved.headers.getSetCookie()) refused.headers.append('Set-Cookie', cookie)
      return refused
    }
    if (!check.ok) {
      // The page again, with a new handle for the next try.
      const details = await oauth.describeConsent(approved.request)
      const next = await oauth.beginConsent(approved.request)
      const headers = new Headers(approved.headers)
      for (const cookie of next.headers.getSetCookie()) headers.append('Set-Cookie', cookie)
      return showConsent(details, next.handle, headers, 'Wrong password', 401)
    }

    await check.forgetAttempt.run()
    const client = await oauth.lookupClient(approved.request.clientId)
    const props: McpProps = { ownerId: check.owner.id, ownerCreatedAt: check.owner.createdAt }
    const { redirectTo } = await oauth.completeAuthorization({
      request: approved.request, // from storage, never from the form
      userId: OWNER_ID,
      scope: [SCOPE],
      props,
      metadata: { client: client?.clientName ?? approved.request.clientId },
    })
    approved.headers.set('Location', redirectTo)
    return new Response(null, { status: 302, headers: approved.headers })
  } catch (error) {
    // A missing, used, expired or foreign handle: never redirect, since nothing here is checked.
    if (error instanceof AuthorizationError || error instanceof CimdFetchError) return showError(EXPIRED, 400)
    throw error
  }
})

/** The 401 for a token whose grant no longer counts, pointing the client at signing in again. */
function signInAgain(request: Request): Response {
  const metadata = `${new URL(request.url).origin}/.well-known/oauth-protected-resource${MCP_PATH}`
  const description = 'The Lernzeit password changed. Connect again.'
  return Response.json(
    { error: 'invalid_token', error_description: description },
    {
      status: 401,
      headers: { 'WWW-Authenticate': `Bearer realm="OAuth", error="invalid_token", error_description="${description}", resource_metadata="${metadata}", scope="${SCOPE}"` },
    },
  )
}

/** /mcp, reached only with a valid access token: the provider has checked it and decrypted its props. */
export const mcpApi = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const { props, auth } = ctx as unknown as OAuthResourceContext<Partial<McpProps> | undefined>
    if (!auth.scope.includes(SCOPE)) return insufficientScope(auth, [SCOPE])

    const ownerId = props?.ownerId
    const owner =
      typeof ownerId === 'string'
        ? await env.DB.prepare('SELECT created_at AS createdAt FROM owner WHERE id = ?').bind(ownerId).first<{ createdAt: number }>()
        : null
    if (!owner || typeof ownerId !== 'string' || owner.createdAt !== props?.ownerCreatedAt) {
      // Revoke the grant too, so its refresh token cannot mint new access tokens that fail the same way.
      const token = await env.OAUTH_PROVIDER.unwrapToken(auth.token)
      if (token) await env.OAUTH_PROVIDER.revokeGrant(token.grantId, token.userId)
      return signInAgain(request)
    }
    return mcpFetch(request, env, ownerId)
  },
}
