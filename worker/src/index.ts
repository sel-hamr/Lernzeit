import { Hono } from 'hono'
import type { Env } from './env.ts'

export const app = new Hono<{ Bindings: Env; Variables: { ownerId: string } }>()

app.get('/api/health', (c) => c.json({ ok: true }))
app.all('/api/*', (c) => c.json({ error: 'Not found' }, 404))
// Everything else is the web app: the static files built into dist/.
app.all('*', (c) => c.env.ASSETS.fetch(c.req.raw))

export default app
