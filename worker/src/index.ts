import { Hono } from 'hono'
import { auth } from './auth.ts'
import type { AppEnv } from './env.ts'
import { noStore } from './http.ts'
import { images } from './images.ts'
import { sync } from './sync.ts'

export const app = new Hono<AppEnv>()

app.use('/api/*', noStore)
app.get('/api/health', (c) => c.json({ ok: true }))
app.route('/api/auth', auth)
app.route('/api/sync', sync)
app.route('/api/images', images)
app.all('/api/*', (c) => c.json({ error: 'Not found' }, 404))
// Everything else is the web app: the static files built into dist/.
app.all('*', (c) => c.env.ASSETS.fetch(c.req.raw))

export default app
