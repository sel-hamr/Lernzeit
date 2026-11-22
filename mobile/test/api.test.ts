import { ApiError, OfflineError, ResyncNeededError, SignedOutError, createApi } from '../src/api'

const reply = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

function setup(respond: (url: string, init: RequestInit) => Promise<Response> | Response, token: string | null = 'tok') {
  const fetch = jest.fn(async (url: string | URL | Request, init?: RequestInit) => respond(String(url), init ?? {}))
  const onSignedOut = jest.fn()
  const api = createApi({ baseUrl: 'https://cloud.test/', getToken: async () => token, onSignedOut, fetch: fetch as unknown as typeof globalThis.fetch })
  return { api, fetch, onSignedOut }
}
const header = (init: RequestInit, name: string) => new Headers(init.headers).get(name)

describe('the API client', () => {
  afterEach(() => jest.useRealTimers())

  it('logs in with the device name and no token, and returns the token', async () => {
    const { api, fetch } = setup(() => reply(200, { email: 'a@b.c', token: 'secret' }), null)
    await expect(api.login('a@b.c', 'pw', 'Android · Pixel')).resolves.toEqual({ email: 'a@b.c', token: 'secret' })
    const [url, init] = fetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://cloud.test/api/auth/login')
    expect(header(init, 'Content-Type')).toBe('application/json')
    expect(header(init, 'Authorization')).toBeNull()
    expect(JSON.parse(init.body as string)).toEqual({ email: 'a@b.c', password: 'pw', device: { name: 'Android · Pixel' } })
  })

  it('shows the server wording of a wrong password or a lockout, without signing out', async () => {
    const wrong = setup(() => reply(401, { error: 'Wrong email or password' }))
    await expect(wrong.api.login('a', 'b', 'd')).rejects.toMatchObject({ name: 'ApiError', status: 401, message: 'Wrong email or password' })
    expect(wrong.onSignedOut).not.toHaveBeenCalled()
    const limited = setup(() => reply(429, { error: 'Too many attempts. Try again in 15 minutes.' }))
    await expect(limited.api.login('a', 'b', 'd')).rejects.toMatchObject({ status: 429, message: 'Too many attempts. Try again in 15 minutes.' })
  })

  it('sends the Bearer token on authenticated calls', async () => {
    const { api, fetch } = setup(() => reply(200, { signedIn: true, email: 'a@b.c' }))
    await expect(api.authStatus()).resolves.toEqual({ signedIn: true, email: 'a@b.c' })
    expect(header((fetch.mock.calls[0] as [string, RequestInit])[1], 'Authorization')).toBe('Bearer tok')
  })

  it('pushes and pulls', async () => {
    const { api, fetch } = setup((url) => (url.includes('/pull') ? reply(200, { changes: [], cursor: 'c2', more: false }) : reply(200, { acknowledged: [] })))
    await api.push([{ tbl: 'decks', id: 'd', data: { id: 'd' }, updatedAt: 1, deleted: false }])
    await expect(api.pull('a b')).resolves.toMatchObject({ cursor: 'c2' })
    const [pushUrl, pushInit] = fetch.mock.calls[0] as [string, RequestInit]
    expect(pushUrl).toBe('https://cloud.test/api/sync/push')
    expect(pushInit.method).toBe('POST')
    expect(header(pushInit, 'Content-Type')).toBe('application/json')
    expect((fetch.mock.calls[1] as [string])[0]).toBe('https://cloud.test/api/sync/pull?cursor=a%20b')
  })

  it('moves images as bytes with their type', async () => {
    const { api, fetch } = setup((_url, init) => (init.method === 'PUT' ? new Response(null, { status: 200 }) : new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'Content-Type': 'image/png' } })))
    await api.putImage('i 1', new Uint8Array([9, 8]), 'image/png')
    const [url, init] = fetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://cloud.test/api/images/i%201')
    expect(header(init, 'Content-Type')).toBe('image/png')
    expect(init.body).toEqual(new Uint8Array([9, 8]))
    const image = await api.getImage('i 1')
    expect(image.type).toBe('image/png')
    expect([...new Uint8Array(image.bytes)]).toEqual([1, 2, 3])
  })

  it('treats 401 on an authenticated call as signed out and tells onSignedOut', async () => {
    const { api, onSignedOut } = setup(() => reply(401, { error: 'Signed out' }))
    await expect(api.pull('')).rejects.toBeInstanceOf(SignedOutError)
    expect(onSignedOut).toHaveBeenCalledTimes(1)
  })

  it('maps 409 with resync to ResyncNeededError and other refusals to ApiError', async () => {
    const resync = setup(() => reply(409, { error: 'Restored', resync: true }))
    await expect(resync.api.pull('x')).rejects.toBeInstanceOf(ResyncNeededError)
    const other = setup(() => reply(500, { error: 'Boom' }))
    await expect(other.api.push([])).rejects.toMatchObject({ status: 500, message: 'Boom' })
    await expect(other.api.push([])).rejects.toBeInstanceOf(ApiError)
  })

  it('maps a network failure to OfflineError', async () => {
    const { api } = setup(() => Promise.reject(new TypeError('Network request failed')))
    await expect(api.authStatus()).rejects.toBeInstanceOf(OfflineError)
  })

  it('gives up after 30 s, aborting the request, and after 120 s for images', async () => {
    jest.useFakeTimers()
    let signal: AbortSignal | undefined
    const { api } = setup((_url, init) => {
      signal = init.signal ?? undefined
      return new Promise<Response>(() => {})
    })
    const pending = api.pull('').catch((e) => e)
    await jest.advanceTimersByTimeAsync(29_999)
    expect(signal?.aborted).toBe(false)
    await jest.advanceTimersByTimeAsync(1)
    expect(await pending).toBeInstanceOf(OfflineError)
    expect(signal?.aborted).toBe(true)

    const image = api.getImage('i').catch((e) => e)
    await jest.advanceTimersByTimeAsync(119_999)
    expect(signal?.aborted).toBe(false)
    await jest.advanceTimersByTimeAsync(1)
    expect(await image).toBeInstanceOf(OfflineError)
  })

  it('logs out with the token', async () => {
    const { api, fetch } = setup(() => new Response(null, { status: 200 }))
    await api.logout()
    const [url, init] = fetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://cloud.test/api/auth/logout')
    expect(init.method).toBe('POST')
    expect(header(init, 'Authorization')).toBe('Bearer tok')
  })
})
