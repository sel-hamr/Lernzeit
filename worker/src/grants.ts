/**
 * The apps connected to /mcp, for the web app's Settings: which clients the owner allowed, and a
 * way to disconnect one. Only names and dates leave here, never a token. The OAuth provider keeps
 * the grants; its helpers are on `env.OAUTH_PROVIDER` (see index.ts), and every grant belongs to
 * the owner (`OWNER_ID`).
 */
import { Hono } from 'hono'
import { requireOwner } from './auth.ts'
import type { AppEnv } from './env.ts'
import { OWNER_ID } from './oauth.ts'

export const grants = new Hono<AppEnv>()

grants.use('*', requireOwner)

// Without the provider (plain http off loopback, see index.ts) nothing can be connected.
grants.use('*', async (c, next) => {
  if (!c.env.OAUTH_PROVIDER) return c.json({ error: 'Connecting an app needs the https address of Lernzeit.' }, 404)
  await next()
})

/** The owner's grants, newest first. A grant stored without a client name shows as "Unknown app". */
grants.get('/', async (c) => {
  const { items } = await c.env.OAUTH_PROVIDER.listUserGrants(OWNER_ID, { limit: 100 })
  const list = items
    .map((grant) => ({
      id: grant.id,
      clientName: typeof grant.metadata?.client === 'string' && grant.metadata.client ? grant.metadata.client : 'Unknown app',
      // Milliseconds, like every other date the API sends.
      createdAt: grant.createdAt * 1000,
    }))
    .sort((a, b) => b.createdAt - a.createdAt)
  return c.json(list)
})

grants.delete('/:id', async (c) => {
  const id = c.req.param('id')
  const { items } = await c.env.OAUTH_PROVIDER.listUserGrants(OWNER_ID, { limit: 1000 })
  if (!items.some((grant) => grant.id === id)) return c.json({ error: 'No such app' }, 404)
  await c.env.OAUTH_PROVIDER.revokeGrant(id, OWNER_ID)
  return c.body(null, 204)
})
