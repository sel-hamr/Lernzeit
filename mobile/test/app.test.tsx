import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library'
import { useColorScheme } from 'react-native'
import RootLayout from '../app/_layout'
import Home from '../app/index'
import SignIn from '../app/sign-in'
import appConfig, { DEFAULT_API_URL, versionCode } from '../app.config'
import pkg from '../package.json'
import { createAccountService } from '../src/account'
import { ApiError, OfflineError } from '../src/api'
import type { Services } from '../src/services'
import { createLocalLibrary } from '../src/store/library'
import { palettes, themes } from '../src/theme'
import { nodeSqliteAdapter } from './store/nodeSqlite'

// The app opens its services (SQLite, secure store, cloud) once; the tests hand it fake ones.
let mockServices: Services
jest.mock('../src/services', () => ({ createServices: () => mockServices }))

function useServices(options: { account?: { email: string }; login?: jest.Mock } = {}) {
  const library = createLocalLibrary(nodeSqliteAdapter())
  if (options.account) library.setMeta('account', options.account)
  const login = options.login ?? jest.fn(async () => ({ email: 'a@b.c', token: 't' }))
  let token: string | null = null
  const tokens = { get: async () => token, set: async (t: string) => void (token = t), clear: async () => void (token = null) }
  const api = { login, logout: jest.fn(async () => {}) }
  mockServices = { library, account: createAccountService({ library, api, tokens }) }
  return mockServices
}

const routes = { _layout: RootLayout, index: Home, 'sign-in': SignIn }

describe('the app shell', () => {
  it('opens on the home screen through the root layout', async () => {
    useServices({ account: { email: 'a@b.c' } })
    await renderRouter(routes, { initialUrl: '/' })
    expect(await screen.findByText('Lernzeit')).toHaveStyle({ color: palettes.light.ink })
  })
})

describe('signing in', () => {
  it('shows the sign-in screen without an account, then the app after signing in', async () => {
    const services = useServices()
    await renderRouter(routes, { initialUrl: '/' })
    expect(await screen.findByText('Sign in')).toBeTruthy()
    expect(screen.queryByText('Lernzeit', { exact: true })).toBeNull()
    expect(screen.getByPlaceholderText('Password').props.secureTextEntry).toBe(true)

    await fireEvent.changeText(screen.getByPlaceholderText('Email'), 'a@b.c')
    await fireEvent.changeText(screen.getByPlaceholderText('Password'), 'pw')
    await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByText('Lernzeit')).toBeTruthy()
    expect(services.library.getMeta('account')).toEqual({ email: 'a@b.c' })
  })

  it('opens the app offline when an account is stored, without asking the cloud', async () => {
    const login = jest.fn(async () => { throw new OfflineError() })
    useServices({ account: { email: 'a@b.c' }, login })
    await renderRouter(routes, { initialUrl: '/' })
    expect(await screen.findByText('Lernzeit')).toBeTruthy()
    expect(screen.queryByText('Sign in')).toBeNull()
    expect(login).not.toHaveBeenCalled()
  })

  it('goes back to sign-in when the account is removed (a 401)', async () => {
    const services = useServices({ account: { email: 'a@b.c' } })
    await renderRouter(routes, { initialUrl: '/' })
    expect(await screen.findByText('Lernzeit')).toBeTruthy()
    await services.account.signedOut()
    expect(await screen.findByText('Sign in')).toBeTruthy()
  })

  it('shows the server message under the form, and the offline wording', async () => {
    const login = jest.fn().mockRejectedValueOnce(new ApiError(401, 'Wrong email or password')).mockRejectedValueOnce(new OfflineError())
    useServices({ login })
    await renderRouter(routes, { initialUrl: '/sign-in' })
    await fireEvent.changeText(await screen.findByPlaceholderText('Email'), 'a@b.c')
    await fireEvent.changeText(screen.getByPlaceholderText('Password'), 'nope')
    await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByText('Wrong email or password')).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByText('Can’t reach your Lernzeit cloud. Check the connection and try again.')).toBeTruthy()
    await waitFor(() => expect(screen.queryByText('Wrong email or password')).toBeNull())
  })
})

describe('theme', () => {
  it('has the SPEC §11 tokens in light and dark', () => {
    expect(palettes.light).toMatchObject({ sidebar: '#F7F7F4', main: '#FFFFFF', ink: '#1C211E', buttonDark: '#22302A', sage: '#E3ECDA' })
    expect(palettes.dark).toMatchObject({ sidebar: '#141816', main: '#1A1F1C', ink: '#E6E9E4', buttonDark: '#DFE9D5' })
    expect(Object.keys(palettes.dark).sort()).toEqual(Object.keys(palettes.light).sort())
    expect(themes.dark.type.stat.fontVariant).toEqual(['tabular-nums'])
  })

  it('follows the system colour scheme', async () => {
    // The React Native Jest preset mocks useColorScheme, answering 'light'.
    jest.mocked(useColorScheme).mockReturnValue('dark')
    try {
      useServices({ account: { email: 'a@b.c' } })
      await renderRouter(routes, { initialUrl: '/' })
      expect(await screen.findByText('Lernzeit')).toHaveStyle({ color: palettes.dark.ink })
    } finally {
      jest.mocked(useColorScheme).mockReturnValue('light')
    }
  })
})

describe('app config', () => {
  const config = appConfig({ config: {} } as Parameters<typeof appConfig>[0])

  it('names the Android app and takes its version from package.json', () => {
    expect(config).toMatchObject({ name: 'Lernzeit', slug: 'lernzeit', scheme: 'lernzeit', version: pkg.version })
    expect(config.android).toMatchObject({ package: 'com.selhamr.lernzeit', versionCode: versionCode(pkg.version) })
    expect(config.extra?.apiUrl).toBe(process.env.LERNZEIT_API_URL || DEFAULT_API_URL)
  })

  it('turns the version into a growing version code', () => {
    expect(versionCode('1.0.0')).toBe(10000)
    expect(versionCode('1.2.3')).toBe(10203)
    expect(versionCode('2.0.0')).toBeGreaterThan(versionCode('1.99.99'))
    expect(() => versionCode('1.2')).toThrow()
    expect(() => versionCode('1.100.0')).toThrow()
  })
})
