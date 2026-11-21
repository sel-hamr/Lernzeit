/**
 * An image's bytes, stored in D1 next to its synced `images` record (which holds only its size, fit
 * and type). Ids are never reused for other bytes, so a fetched image may be cached for good.
 */
import { Hono } from 'hono'
import { MAX_ID_LENGTH, MAX_IMAGE_BYTES } from '@lernzeit/core/sync'
import { requireOwner } from './auth.ts'
import type { AppEnv } from './env.ts'
import { mediaType } from './http.ts'

const IMAGE_TYPE = /^image\/[a-z0-9][a-z0-9.+-]*$/

export const images = new Hono<AppEnv>()

images.use('*', requireOwner)

images.put('/:id', async (c) => {
  const id = c.req.param('id')
  if (id.length === 0 || id.length > MAX_ID_LENGTH) return c.json({ error: `An image id has 1 to ${MAX_ID_LENGTH} characters.` }, 400)
  const type = mediaType(c.req.header('Content-Type'))
  if (!IMAGE_TYPE.test(type)) return c.json({ error: 'Send the image with its type, such as Content-Type: image/png.' }, 415)

  const tooLarge = () => c.json({ error: `An image can be at most ${MAX_IMAGE_BYTES} bytes.` }, 413)
  if (Number(c.req.header('Content-Length') ?? 0) > MAX_IMAGE_BYTES) return tooLarge()
  const bytes = await c.req.arrayBuffer()
  if (bytes.byteLength > MAX_IMAGE_BYTES) return tooLarge()
  if (bytes.byteLength === 0) return c.json({ error: 'Send the image bytes.' }, 400)

  await c.env.DB.prepare(
    'INSERT INTO blobs (owner, id, type, bytes) VALUES (?, ?, ?, ?) ON CONFLICT (owner, id) DO UPDATE SET type = excluded.type, bytes = excluded.bytes',
  )
    .bind(c.get('ownerId'), id, type, bytes)
    .run()
  return c.body(null, 204)
})

images.get('/:id', async (c) => {
  const row = await c.env.DB.prepare('SELECT type, bytes FROM blobs WHERE owner = ? AND id = ?')
    .bind(c.get('ownerId'), c.req.param('id'))
    .first<{ type: string; bytes: ArrayBuffer | number[] }>()
  if (!row) return c.json({ error: 'No such image' }, 404)
  return c.body(new Uint8Array(row.bytes), 200, {
    'Content-Type': row.type,
    'Cache-Control': 'private, max-age=31536000, immutable',
    'X-Content-Type-Options': 'nosniff',
    // An SVG opened on its own would otherwise run its scripts on this origin.
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
  })
})
