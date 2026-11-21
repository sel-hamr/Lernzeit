export interface Env {
  DB: D1Database
  ASSETS: Fetcher
}

/** The Worker's Hono environment: its bindings, and the owner that `requireOwner` signed in. */
export type AppEnv = { Bindings: Env; Variables: { ownerId: string } }
