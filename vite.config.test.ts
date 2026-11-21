import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { NAVIGATE_FALLBACK_DENYLIST } from './vite.config'

/** The paths wrangler.jsonc sends to the Worker before the static files (`assets.run_worker_first`). */
function workerFirstPaths(): string[] {
  const text = readFileSync(new URL('./wrangler.jsonc', import.meta.url), 'utf8')
  // JSON with // comments: drop the comments that start a line or follow a value.
  const json = text.replace(/^\s*\/\/.*$/gm, '').replace(/,\s*\/\/.*$/gm, ',')
  return (JSON.parse(json) as { assets: { run_worker_first: string[] } }).assets.run_worker_first
}

/** How workbox matches a navigation against the denylist: its path and query. */
const denied = (pathAndSearch: string) => NAVIGATE_FALLBACK_DENYLIST.some((pattern) => pattern.test(pathAndSearch))

describe('the service worker', () => {
  it('never answers a path the Worker serves with the cached app page', () => {
    const samples = workerFirstPaths().map((path) => path.replace('*', 'something'))
    expect(samples).toContain('/authorize')
    for (const path of samples) expect(denied(path), path).toBe(true)
    // Claude opens the authorize page with its request in the query.
    expect(denied('/authorize?response_type=code&client_id=abc')).toBe(true)
    expect(denied('/mcp')).toBe(true)
    expect(denied('/.well-known/oauth-authorization-server')).toBe(true)
  })

  it('still answers the app routes with the app page', () => {
    for (const path of ['/', '/flashcards', '/settings?group=claude', '/docs/readme', '/tokenizer', '/mcpx']) expect(denied(path), path).toBe(false)
  })
})
