import { SELF } from 'cloudflare:test'
import { MAX_IMAGE_BYTES, type SyncChange } from '@lernzeit/core/sync'
import { beforeEach, describe, expect, it } from 'vitest'
import { clearSyncData, deviceToken, seedOwner } from './helpers.ts'

let token: string

beforeEach(async () => {
  await seedOwner()
  await clearSyncData()
  token = await deviceToken()
})

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 1, 2, 3, 250, 251, 252, 253, 254, 255])

function put(id: string, bytes: Uint8Array, type: string | null = 'image/png'): Promise<Response> {
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` }
  if (type) headers['Content-Type'] = type
  return SELF.fetch(`https://x/api/images/${encodeURIComponent(id)}`, { method: 'PUT', headers, body: bytes })
}

function get(id: string, auth: Record<string, string> = { Authorization: `Bearer ${token}` }): Promise<Response> {
  return SELF.fetch(`https://x/api/images/${encodeURIComponent(id)}`, { headers: auth })
}

async function push(changes: SyncChange[]): Promise<void> {
  const response = await SELF.fetch('https://x/api/sync/push', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ changes }),
  })
  expect(response.status).toBe(200)
}

const meta = (id: string) => ({ id, width: 10, height: 10, fit: 'contain', type: 'image/png' })

describe('images', () => {
  it('put then get returns the same bytes and type', async () => {
    const response = await put('img-1', PNG)
    expect(response.status).toBe(204)
    expect(response.headers.get('Cache-Control')).toBe('no-store')

    const got = await get('img-1')
    expect(got.status).toBe(200)
    expect(got.headers.get('Content-Type')).toBe('image/png')
    expect(got.headers.get('Cache-Control')).toBe('private, max-age=31536000, immutable')
    expect(got.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(new Uint8Array(await got.arrayBuffer())).toEqual(PNG)
  })

  it('putting the same id again replaces the bytes and type', async () => {
    await put('img-1', PNG)
    expect((await put('img-1', new Uint8Array([1, 2, 3]), 'image/webp')).status).toBe(204)
    const got = await get('img-1')
    expect(got.headers.get('Content-Type')).toBe('image/webp')
    expect(new Uint8Array(await got.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]))
  })

  it('non-image type → 415', async () => {
    for (const type of ['text/html', 'application/octet-stream', null]) {
      const response = await put('img-1', PNG, type)
      expect(response.status, String(type)).toBe(415)
      expect(response.headers.get('Cache-Control')).toBe('no-store')
    }
    expect((await get('img-1')).status).toBe(404)
  })

  it('too large → 413', async () => {
    const response = await put('img-1', new Uint8Array(MAX_IMAGE_BYTES + 1))
    expect(response.status).toBe(413)
    expect((await get('img-1')).status).toBe(404)
    // Exactly the limit is fine.
    expect((await put('img-2', new Uint8Array(MAX_IMAGE_BYTES))).status).toBe(204)
  })

  it('an empty body or an over-long id → 400', async () => {
    expect((await put('img-1', new Uint8Array(0))).status).toBe(400)
    expect((await put('x'.repeat(201), PNG)).status).toBe(400)
  })

  it('a missing image → 404, not cached', async () => {
    const response = await get('nope')
    expect(response.status).toBe(404)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(await response.json()).toEqual({ error: 'No such image' })
  })

  it('needs a session', async () => {
    await put('img-1', PNG)
    const response = await get('img-1', {})
    expect(response.status).toBe(401)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    const upload = await SELF.fetch('https://x/api/images/img-2', { method: 'PUT', headers: { 'Content-Type': 'image/png' }, body: PNG })
    expect(upload.status).toBe(401)
  })

  it('tombstoning the images record deletes the blob (get → 404)', async () => {
    await put('img-1', PNG)
    await put('img-2', PNG)
    await push([
      { tbl: 'images', id: 'img-1', data: meta('img-1'), updatedAt: 1000, deleted: false },
      { tbl: 'images', id: 'img-2', data: meta('img-2'), updatedAt: 1000, deleted: false },
    ])
    expect((await get('img-1')).status).toBe(200)

    // An older tombstone loses and leaves the blob alone.
    await push([{ tbl: 'images', id: 'img-1', data: null, updatedAt: 999, deleted: true }])
    expect((await get('img-1')).status).toBe(200)

    await push([{ tbl: 'images', id: 'img-1', data: null, updatedAt: 1001, deleted: true }])
    expect((await get('img-1')).status).toBe(404)
    expect((await get('img-2')).status).toBe(200)
  })

  it('reset deletes blobs', async () => {
    await put('img-1', PNG)
    await put('img-2', PNG)
    const response = await SELF.fetch('https://x/api/sync/reset', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: '{}',
    })
    expect(response.status).toBe(200)
    expect((await get('img-1')).status).toBe(404)
    expect((await get('img-2')).status).toBe(404)
  })
})
