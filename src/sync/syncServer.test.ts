import { describe, expect, it } from 'vitest'
import { createTestServer } from '../test/syncServer'

/** The test server refuses what the Worker refuses: data that is not an object naming its own id. */
describe('test server push validation', () => {
  const push = (changes: unknown[]) =>
    createTestServer().fetch('/api/sync/push', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ changes }) })
  const live = (tbl: string, id: string, data: unknown) => ({ tbl, id, data, updatedAt: 1, deleted: false })

  it('refuses data that is an array, a string or another id, and a kv value with another key', async () => {
    for (const data of [[], 'x', { id: 'other' }, { front: 'no id' }]) expect((await push([live('cards', 'a', data)])).status).toBe(400)
    expect((await push([live('kv', 'settings', { key: 'seeded', value: 1 })])).status).toBe(400)
  })

  it('accepts data naming its id, a kv row naming its key, and a tombstone', async () => {
    const changes = [live('cards', 'a', { id: 'a' }), live('kv', 'settings', { key: 'settings', value: {} }), { tbl: 'cards', id: 'b', data: null, updatedAt: 1, deleted: true }]
    expect(await (await push(changes)).json()).toEqual({ applied: 3 })
  })
})
