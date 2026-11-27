import { SELF } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'

describe('worker skeleton', () => {
  it('answers /api/health', async () => {
    const response = await SELF.fetch('https://x/api/health')
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true })
  })

  it('answers an unknown /api path with a JSON 404', async () => {
    const response = await SELF.fetch('https://x/api/nope')
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'Not found' })
  })
})
