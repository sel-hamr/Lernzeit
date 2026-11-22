import { renderHook, act } from '@testing-library/react-native'
import type { ReactNode } from 'react'
import { createAccountService, deviceName, OtherAccountError, useAccount } from '../src/account'
import { createApi, OfflineError } from '../src/api'
import { createLocalLibrary, DEVICE_ID_KEY } from '../src/store/library'
import { LocalLibraryProvider } from '../src/store/live'
import type { TokenStore } from '../src/token'
import { nodeSqliteAdapter } from './store/nodeSqlite'

jest.mock('expo-device', () => ({ modelName: 'Pixel 8' }))

const reply = (status: number, body?: unknown) => new Response(JSON.stringify(body ?? {}), { status, headers: { 'Content-Type': 'application/json' } })

/** The whole stack over a fake cloud: real API client and library, mocked fetch and token store. */
function setup(respond: (url: string, init: RequestInit) => Promise<Response> | Response) {
  const library = createLocalLibrary(nodeSqliteAdapter())
  let stored: string | null = null
  const tokens: TokenStore = { get: async () => stored, set: async (t) => void (stored = t), clear: async () => void (stored = null) }
  const fetch = jest.fn(async (url: string | URL | Request, init?: RequestInit) => respond(String(url), init ?? {}))
  // The API's 401 handler reaches the service made after it.
  const real = createApi({ baseUrl: 'https://cloud.test', getToken: () => tokens.get(), onSignedOut: (sent) => void account.signedOut(sent), fetch: fetch as unknown as typeof globalThis.fetch })
  const account = createAccountService({ library, tokens, api: real })
  return { library, tokens, fetch, api: real, account, token: () => stored }
}

describe('signing in', () => {
  it('names the device after its model', () => {
    expect(deviceName()).toBe('Android · Pixel 8')
  })

  it('stores the token in secure storage and the email in the store, and later calls send the token', async () => {
    const t = setup((url) => (url.endsWith('/auth/login') ? reply(200, { email: 'a@b.c', token: 'tok-1' }) : reply(200, { signedIn: true })))
    await t.account.signIn(' a@b.c ', 'pw')
    const [, loginInit] = t.fetch.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(loginInit.body as string)).toEqual({ email: 'a@b.c', password: 'pw', device: { name: 'Android · Pixel 8' } })
    expect(t.token()).toBe('tok-1')
    expect(t.library.getMeta('account')).toEqual({ email: 'a@b.c' })
    // The password is not kept anywhere in the store.
    expect(JSON.stringify(t.library.getMeta('account'))).not.toContain('pw')

    await t.api.authStatus()
    expect(new Headers((t.fetch.mock.calls[1] as [string, RequestInit])[1].headers).get('Authorization')).toBe('Bearer tok-1')
  })

  it('stores nothing when the server refuses', async () => {
    const t = setup(() => reply(401, { error: 'Wrong email or password' }))
    await expect(t.account.signIn('a@b.c', 'bad')).rejects.toThrow('Wrong email or password')
    expect(t.token()).toBeNull()
    expect(t.library.getMeta('account')).toBeUndefined()
  })
})

describe('a failed sign-in write', () => {
  it('leaves no orphan token when the account cannot be stored', async () => {
    const t = setup(() => reply(200, { email: 'a@b.c', token: 'tok' }))
    jest.spyOn(t.library, 'setMeta').mockImplementation(() => {
      throw new Error('disk full')
    })
    await expect(t.account.signIn('a@b.c', 'pw')).rejects.toThrow('disk full')
    expect(t.token()).toBeNull()
  })
})

describe('a 401 on any call', () => {
  it('removes the account and token but keeps the data and the outbox', async () => {
    const t = setup(() => reply(401, { error: 'Signed out' }))
    await t.tokens.set('old')
    t.library.setMeta('account', { email: 'a@b.c' })
    t.library.put('decks', { id: 'd1', name: 'One' })
    await expect(t.api.pull('')).rejects.toMatchObject({ name: 'SignedOutError' })
    await new Promise((r) => setTimeout(r, 0))
    expect(t.token()).toBeNull()
    expect(t.library.getMeta('account')).toBeUndefined()
    expect(t.library.get('decks', 'd1')).toBeDefined()
    expect(t.library.outboxSize()).toBe(1)
  })
})

describe('a stale 401', () => {
  it('leaves a newer sign-in intact', async () => {
    let release!: () => void
    const t = setup((url) => (url.endsWith('/auth/login') ? reply(200, { email: 'a@b.c', token: 'new' }) : new Promise<Response>((r) => (release = () => r(reply(401, { error: 'Signed out' }))))))
    await t.tokens.set('old')
    const pending = t.api.pull('').catch((e) => e)
    await new Promise((r) => setTimeout(r, 0))
    await t.account.signIn('a@b.c', 'pw')
    release()
    expect(await pending).toMatchObject({ name: 'SignedOutError' })
    await new Promise((r) => setTimeout(r, 0))
    expect(t.token()).toBe('new')
    expect(t.library.getMeta('account')).toEqual({ email: 'a@b.c' })
  })
})

describe('signing out', () => {
  it('answers unsynced and changes nothing while the outbox has entries', async () => {
    const t = setup(() => reply(200))
    await t.tokens.set('tok')
    t.library.setMeta('account', { email: 'a@b.c' })
    t.library.put('decks', { id: 'd1', name: 'One' })
    await expect(t.account.signOut()).resolves.toBe('unsynced')
    expect(t.fetch).not.toHaveBeenCalled()
    expect(t.token()).toBe('tok')
    expect(t.library.getMeta('account')).toBeDefined()
    expect(t.library.count('decks')).toBe(1)
  })

  it('signs out an empty outbox, ending the session first', async () => {
    const t = setup(() => reply(200))
    await t.tokens.set('tok')
    t.library.setMeta('account', { email: 'a@b.c' })
    await expect(t.account.signOut()).resolves.toBe('done')
    const [url, init] = t.fetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://cloud.test/api/auth/logout')
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer tok')
    expect(t.token()).toBeNull()
    expect(t.library.getMeta('account')).toBeUndefined()
  })

  it('forced, clears synced data, outbox and meta even offline, keeping the device id', async () => {
    const t = setup(() => Promise.reject(new TypeError('offline')))
    const deleted: string[] = []
    const account = createAccountService({ library: t.library, tokens: t.tokens, api: t.api, deleteImageFiles: (files) => void deleted.push(...files.map((f) => f.path)) })
    await t.tokens.set('tok')
    t.library.setMeta('account', { email: 'a@b.c' })
    t.library.setMeta(DEVICE_ID_KEY, 'dev-1')
    t.library.put('decks', { id: 'd1', name: 'One' })
    t.library.putImageFile({ id: 'i1', path: 'file:///i1.png', type: 'image/png', width: 1, height: 1, fit: 'cover' })
    await expect(account.signOut({ force: true })).resolves.toBe('done')
    expect(t.token()).toBeNull()
    expect(t.library.count('decks')).toBe(0)
    expect(t.library.outboxSize()).toBe(0)
    expect(t.library.getMeta('account')).toBeUndefined()
    expect(t.library.getMeta(DEVICE_ID_KEY)).toBe('dev-1')
    expect(deleted).toEqual(['file:///i1.png'])
    await expect(t.api.authStatus()).rejects.toBeInstanceOf(OfflineError)
  })
})

describe('useAccount', () => {
  it('reads the account from the store, live', async () => {
    const library = createLocalLibrary(nodeSqliteAdapter())
    const wrapper = ({ children }: { children: ReactNode }) => <LocalLibraryProvider library={library}>{children}</LocalLibraryProvider>
    const { result } = await renderHook(() => useAccount(), { wrapper })
    expect(result.current).toBeNull()
    await act(async () => library.setMeta('account', { email: 'a@b.c' }))
    expect(result.current).toEqual({ email: 'a@b.c' })
    await act(async () => library.removeMeta('account'))
    expect(result.current).toBeNull()
  })
})

describe('signing in as another account', () => {
  const login = (email: string) => (url: string) => (url.endsWith('/auth/login') ? reply(200, { email, token: 'tok-' + email }) : reply(200))
  const loginCalls = (t: ReturnType<typeof setup>) => t.fetch.mock.calls.filter(([url]) => String(url).endsWith('/auth/login')).length

  it('remembers who signed in, also after a 401 sign-out', async () => {
    const t = setup(login('a@b.c'))
    await t.account.signIn('a@b.c', 'pw')
    expect(t.library.getMeta('lastAccount')).toBe('a@b.c')
    await t.account.signedOut()
    expect(t.library.getMeta('account')).toBeUndefined()
    expect(t.library.getMeta('lastAccount')).toBe('a@b.c')
  })

  it('refuses a different email while this phone has data, before asking the cloud', async () => {
    const t = setup(login('x@y.z'))
    t.library.setMeta('lastAccount', 'a@b.c')
    t.library.put('decks', { id: 'd1', name: 'One' })
    await expect(t.account.signIn('x@y.z', 'pw')).rejects.toThrow(
      'This phone has data from a@b.c. Sign out of it first (Settings → Sign out) to use another account.',
    )
    await expect(t.account.signIn('x@y.z', 'pw')).rejects.toBeInstanceOf(OtherAccountError)
    expect(loginCalls(t)).toBe(0)
    expect(t.token()).toBeNull()
    expect(t.library.getMeta('account')).toBeUndefined()
  })

  it('lets the same account back in, however its email is written', async () => {
    const t = setup(login('a@b.c'))
    t.library.setMeta('lastAccount', 'a@b.c')
    t.library.put('decks', { id: 'd1', name: 'One' })
    await t.account.signIn(' A@B.C ', 'pw')
    expect(t.library.getMeta('account')).toEqual({ email: 'a@b.c' })
  })

  it('lets another account in when the phone holds no data', async () => {
    const t = setup(login('x@y.z'))
    t.library.setMeta('lastAccount', 'a@b.c')
    await t.account.signIn('x@y.z', 'pw')
    expect(t.library.getMeta('lastAccount')).toBe('x@y.z')
  })

  it('lets another account in after a forced sign-out cleared the data', async () => {
    const t = setup(login('x@y.z'))
    await t.tokens.set('tok')
    t.library.setMeta('account', { email: 'a@b.c' })
    t.library.setMeta('lastAccount', 'a@b.c')
    t.library.put('decks', { id: 'd1', name: 'One' })
    await t.account.signOut({ force: true })
    expect(t.library.getMeta('lastAccount')).toBeUndefined()
    await t.account.signIn('x@y.z', 'pw')
    expect(t.library.getMeta('account')).toEqual({ email: 'x@y.z' })
  })
})
