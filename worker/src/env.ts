import type { OAuthHelpers } from '@cloudflare/workers-oauth-provider'

export interface Env {
  DB: D1Database
  ASSETS: Fetcher
  /** The OAuth provider's store: registered clients, grants and tokens (only their hashes). */
  OAUTH_KV: KVNamespace
  /** Not a binding: the OAuth provider puts its helpers here before it calls the Hono app or /mcp. */
  OAUTH_PROVIDER: OAuthHelpers
}

/** The Worker's Hono environment: its bindings, and the owner that `requireOwner` signed in. */
export type AppEnv = { Bindings: Env; Variables: { ownerId: string } }
