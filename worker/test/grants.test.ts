import { getOAuthApi } from '@cloudflare/workers-oauth-provider'
import { SELF } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { beforeEach, describe, expect, it } from 'vitest'
import { PASSWORD, EMAIL, clearSyncData, login, seedOwner, sessionCookie, deviceToken } from './helpers.ts'
import { oauthOptions } from '../src/index.ts'
import { ORIGIN, connect, mcp } from './oauthHelpers.ts'

beforeEach(async () => {
  await seedOwner()
  await clearSyncData()
  // The OAuth store outlives a test; start each one with nothing connected.
  const oauth = getOAuthApi(oauthOptions(ORIGIN), env)
  for (const grant of (await oauth.listUserGrants('owner')).items) await oauth.revokeGrant(grant.id, 'owner')
})

const GRANTS = `${ORIGIN}/api/mcp/grants`

async function bearer(): Promise<Record<string, string>> {
  return { Authorization: `Bearer ${await deviceToken()}` }
}

interface Grant {
  id: string
  clientName: string
  createdAt: number
}

describe('the connected apps', () => {
  it('need the owner to be signed in', async () => {
    expect((await SELF.fetch(GRANTS)).status).toBe(401)
    expect((await SELF.fetch(`${GRANTS}/anything`, { method: 'DELETE' })).status).toBe(401)
  })

  it('lists a connected client by name and date, without any token', async () => {
    const { tokens } = await connect('Claude Desktop')
    const response = await SELF.fetch(GRANTS, { headers: await bearer() })
    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    const text = await response.text()
    expect(text).not.toContain(tokens.access_token)
    expect(text).not.toContain(tokens.refresh_token)
    const grants = JSON.parse(text) as Grant[]
    expect(grants).toHaveLength(1)
    expect(grants[0]).toEqual({ id: expect.any(String), clientName: 'Claude Desktop', createdAt: expect.any(Number) })
    expect(Math.abs(grants[0].createdAt - Date.now())).toBeLessThan(60_000)
  })

  it('answers with an empty list when nothing is connected, also to a browser session', async () => {
    const session = sessionCookie(await login({ email: EMAIL, password: PASSWORD }))
    const response = await SELF.fetch(GRANTS, { headers: { Cookie: session } })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual([])
  })

  it('Disconnect revokes the grant, so its token is refused', async () => {
    const { tokens } = await connect()
    const headers = await bearer()
    expect((await mcp('tools/list', tokens.access_token)).status).toBe(200)
    const [grant] = await (await SELF.fetch(GRANTS, { headers })).json<Grant[]>()

    const removed = await SELF.fetch(`${GRANTS}/${encodeURIComponent(grant.id)}`, { method: 'DELETE', headers })
    expect(removed.status).toBe(204)
    expect(removed.headers.get('Cache-Control')).toBe('no-store')

    expect((await mcp('tools/list', tokens.access_token)).status).toBe(401)
    expect(await (await SELF.fetch(GRANTS, { headers })).json()).toEqual([])
  })

  it('Disconnect of an unknown grant is a 404', async () => {
    const response = await SELF.fetch(`${GRANTS}/nothing`, { method: 'DELETE', headers: await bearer() })
    expect(response.status).toBe(404)
  })
})
