import { OAuthProvider, type OAuthProviderOptions } from '@cloudflare/workers-oauth-provider'
import { Hono } from 'hono'
import { auth } from './auth.ts'
import type { AppEnv, Env } from './env.ts'
import { noStore } from './http.ts'
import { images } from './images.ts'
import { MCP_PATH, SCOPE, authorize, mcpApi } from './oauth.ts'
import { sync } from './sync.ts'

export const app = new Hono<AppEnv>()

app.use('/api/*', noStore)
app.get('/api/health', (c) => c.json({ ok: true }))
app.route('/api/auth', auth)
app.route('/api/sync', sync)
app.route('/api/images', images)
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
export function oauthOptions(origin: string): OAuthProviderOptions<Env> {
  return {
    apiRoute: MCP_PATH,
    apiHandler: mcpApi,
    defaultHandler: app,
    authorizeEndpoint: '/authorize',
    tokenEndpoint: '/token',
    clientRegistrationEndpoint: '/register',
    scopesSupported: [SCOPE],
    requiredScopes: [SCOPE],
    resourceMetadata: { resource: `${origin}${MCP_PATH}`, authorization_servers: [origin], resource_name: 'Lernzeit' },
  }
}

/**
 * One provider per origin the Worker is reached at (its workers.dev host, `wrangler dev` on
 * localhost, a test's host), since the canonical resource is an absolute URL. `null` for an origin
 * OAuth cannot use: plain http off loopback, such as a phone on the LAN trying `wrangler dev`.
 */
const providers = new Map<string, OAuthProvider<Env> | null>()

function providerFor(origin: string): OAuthProvider<Env> | null {
  if (!providers.has(origin)) {
    if (providers.size >= 8) providers.clear()
    let provider: OAuthProvider<Env> | null = null
    try {
      provider = new OAuthProvider<Env>(oauthOptions(origin))
    } catch (error) {
      if (!(error instanceof TypeError)) throw error
    }
    providers.set(origin, provider)
  }
  return providers.get(origin) ?? null
}

export default {
  fetch(request, env, ctx) {
    const provider = providerFor(new URL(request.url).origin)
    // The provider puts its helpers on `env`, which workerd shares between requests; a copy (the
    // bindings are enumerable) keeps them to this request's provider. A child object does not:
    // the write lands on the shared env.
    if (provider) return provider.fetch(request, { ...env }, ctx)
    return app.fetch(request, env, ctx)
  },
} satisfies ExportedHandler<Env>
