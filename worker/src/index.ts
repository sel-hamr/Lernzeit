import { Hono } from 'hono'
import { auth, requireOwner } from './auth.ts'
import type { AppEnv } from './env.ts'

export const app = new Hono<AppEnv>()

app.get('/api/health', (c) => c.json({ ok: true }))
app.route('/api/auth', auth)
// Stub so sync is behind sign-in from the start; Task 5 replaces it with the real sync routes.
app.get('/api/sync/pull', requireOwner, (c) => c.json({ error: 'Not implemented yet' }, 501))
app.all('/api/*', (c) => c.json({ error: 'Not found' }, 404))
// Everything else is the web app: the static files built into dist/.
app.all('*', (c) => c.env.ASSETS.fetch(c.req.raw))

export default app
