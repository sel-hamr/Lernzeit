import { createMiddleware } from 'hono/factory'
import type { AppEnv } from './env.ts'

/** A Content-Type's media type without its parameters, lower-cased: `Image/PNG; q=1` → `image/png`. */
export function mediaType(header: string | undefined): string {
  return (header ?? '').split(';')[0].trim().toLowerCase()
}

/**
 * API answers carry sign-in tokens and the owner's data, so no browser or proxy may keep them.
 * A route that wants caching (an image, by its immutable id) sets its own Cache-Control first.
 */
export const noStore = createMiddleware<AppEnv>(async (c, next) => {
  await next()
  if (!c.res.headers.has('Cache-Control')) c.header('Cache-Control', 'no-store')
})

/**
 * Refuses a body that is not JSON. Besides catching mistakes, it means another site cannot send these
 * requests from a plain form: a cross-site JSON request needs a CORS preflight, which is never answered.
 */
export const requireJson = createMiddleware<AppEnv>(async (c, next) => {
  if (mediaType(c.req.header('Content-Type')) !== 'application/json') {
    return c.json({ error: 'Send JSON (Content-Type: application/json).' }, 415)
  }
  await next()
})
