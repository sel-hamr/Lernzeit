import { OAuthProvider, type OAuthProviderOptions } from '@cloudflare/workers-oauth-provider'
import { Hono } from 'hono'
import { auth, clientIp } from './auth.ts'
import type { AppEnv, Env } from './env.ts'
import { noStore } from './http.ts'
import { grants } from './grants.ts'
import { images } from './images.ts'
import { MCP_PATH, SCOPE, authorize, mcpApi } from './oauth.ts'
import { REGISTER_LIMIT, withinLimit } from './rateLimit.ts'
import { describeRedirectHosts, redirectAllowed, redirectHosts } from './redirects.ts'
import { sync } from './sync.ts'

export const app = new Hono<AppEnv>()

app.use('/api/*', noStore)
app.get('/api/health', (c) => c.json({ ok: true }))
app.route('/api/auth', auth)
app.route('/api/sync', sync)
app.route('/api/images', images)
app.route('/api/mcp/grants', grants)
app.all('/api/*', (c) => c.json({ error: 'Not found' }, 404))
app.route('/', authorize)
// The provider answers its own discovery documents; any other (openid-configuration, say) is not
// here, rather than the web app's index.html.
app.all('/.well-known/*', (c) => c.json({ error: 'Not found' }, 404))
// Everything else is the web app: the static files built into dist/.
app.all('*', (c) => c.env.ASSETS.fetch(c.req.raw))

/**
 * The OAuth provider for the Worker at `origin`. It serves the discovery documents, /register and
 * /token, lets /mcp through only with a valid access token, and hands every other request to the
 * Hono app, /api/* and /authorize included. Tokens are bound to `<origin>/mcp`.
 */
export function oauthOptions(origin: string, hosts = redirectHosts(undefined)): OAuthProviderOptions<Env> {
  return {
    // Every redirect URI a client registers must go to an allowed host (the authorize page checks
    // the one a request uses as well, in oauth.ts).
    clientRegistrationCallback: ({ clientMetadata }) => {
      const uris = clientMetadata.redirect_uris
      const refused = Array.isArray(uris) ? uris.find((uri) => typeof uri !== 'string' || !redirectAllowed(uri, hosts)) : 'none'
      if (refused === undefined) return
      return {
        code: 'invalid_redirect_uri',
        description: `Lernzeit does not send access to ${String(refused).slice(0, 200)}. Allowed: ${describeRedirectHosts(hosts)}.`,
      }
    },
    apiRoute: MCP_PATH,
    apiHandler: mcpApi,
    defaultHandler: app,
    authorizeEndpoint: '/authorize',
    tokenEndpoint: '/token',
    clientRegistrationEndpoint: '/register',
    // A registration nobody uses for 30 days expires; one in use is renewed by its token requests.
    clientRegistrationTTL: 30 * 24 * 60 * 60,
    scopesSupported: [SCOPE],
    requiredScopes: [SCOPE],
    resourceMetadata: { resource: `${origin}${MCP_PATH}`, authorization_servers: [origin], resource_name: 'Lernzeit' },
  }
}

/**
 * One provider per origin the Worker is reached at (its workers.dev host, `wrangler dev` on
 * localhost, a test's host), since the canonical resource is an absolute URL, and per redirect
 * allowlist. `null` for an origin OAuth cannot use: plain http off loopback, such as a phone on
 * the LAN trying `wrangler dev`.
 */
const providers = new Map<string, OAuthProvider<Env> | null>()

function providerFor(origin: string, hostsSetting: string | undefined): OAuthProvider<Env> | null {
  const key = `${origin} ${hostsSetting ?? ''}`
  if (!providers.has(key)) {
    if (providers.size >= 8) providers.clear()
    let provider: OAuthProvider<Env> | null = null
    try {
      provider = new OAuthProvider<Env>(oauthOptions(origin, redirectHosts(hostsSetting)))
    } catch (error) {
      if (!(error instanceof TypeError)) throw error
    }
    providers.set(key, provider)
  }
  return providers.get(key) ?? null
}

/** Registration is open to anyone, so it is limited per address before the provider stores anything. */
async function registrationLimited(request: Request, env: Env): Promise<Response | null> {
  if (request.method !== 'POST' || new URL(request.url).pathname !== '/register') return null
  if (await withinLimit(env.DB, REGISTER_LIMIT, clientIp(request))) return null
  return Response.json(
    { error: 'too_many_requests', error_description: 'Too many registrations from this address. Try again in an hour.' },
    { status: 429, headers: { 'Retry-After': '3600', 'Cache-Control': 'no-store' } },
  )
}

export default {
  async fetch(request, env, ctx) {
    const limited = await registrationLimited(request, env)
    if (limited) return limited
    const provider = providerFor(new URL(request.url).origin, env.OAUTH_REDIRECT_HOSTS)
    // The provider puts its helpers on `env`, which workerd shares between requests; a copy (the
    // bindings are enumerable) keeps them to this request's provider. A child object does not:
    // the write lands on the shared env.
    if (provider) return provider.fetch(request, { ...env }, ctx)
    return app.fetch(request, env, ctx)
  },
} satisfies ExportedHandler<Env>
