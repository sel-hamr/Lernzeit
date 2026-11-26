import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library'
import { useColorScheme } from 'react-native'
import appConfig, { DEFAULT_API_URL, versionCode } from '../app.config'
import pkg from '../package.json'
import { createAccountService } from '../src/account'
import { ApiError, OfflineError } from '../src/api'
import type { Services } from '../src/services'
import { createLocalLibrary } from '../src/store/library'
import { palettes, themes } from '../src/theme'
import { routes } from './routes'
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


describe('the app shell', () => {
  it('opens on the home screen through the root layout', async () => {
    useServices({ account: { email: 'a@b.c' } })
    await renderRouter(routes, { initialUrl: '/' })
    expect(await screen.findByTestId('page-title')).toHaveStyle({ color: palettes.light.ink })
  })
})

describe('signing in', () => {
  it('shows the sign-in screen without an account, then the app after signing in', async () => {
    const services = useServices()
    await renderRouter(routes, { initialUrl: '/' })
    expect(await screen.findByText('Sign in')).toBeTruthy()
    expect(screen.queryByTestId('page-title')).toBeNull()
    expect(screen.getByPlaceholderText('Password').props.secureTextEntry).toBe(true)

    await fireEvent.changeText(screen.getByPlaceholderText('Email'), 'a@b.c')
    await fireEvent.changeText(screen.getByPlaceholderText('Password'), 'pw')
    await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByTestId('page-title')).toBeTruthy()
    expect(services.library.getMeta('account')).toEqual({ email: 'a@b.c' })
  })

  it('opens the app offline when an account is stored, without asking the cloud', async () => {
    const login = jest.fn(async () => { throw new OfflineError() })
    useServices({ account: { email: 'a@b.c' }, login })
    await renderRouter(routes, { initialUrl: '/' })
    expect(await screen.findByTestId('page-title')).toBeTruthy()
    expect(screen.queryByText('Sign in')).toBeNull()
    expect(login).not.toHaveBeenCalled()
  })

  it('goes back to sign-in when the account is removed (a 401)', async () => {
    const services = useServices({ account: { email: 'a@b.c' } })
    await renderRouter(routes, { initialUrl: '/' })
    expect(await screen.findByTestId('page-title')).toBeTruthy()
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
  it('has the Lime tokens in light and dark, with the older names mapped onto them', () => {
    expect(palettes.light).toMatchObject({ canvas: '#F2F2F4', card: '#FFFFFF', ink: '#16181A', accent: '#D4F24A', accentSoft: '#EEF8C8', primary: '#16181A', onPrimary: '#FFFFFF', danger: '#E5484D' })
    expect(palettes.dark).toMatchObject({ canvas: '#0E0F11', card: '#1A1C1F', ink: '#F2F3F5', accent: '#D4F24A', primary: '#D4F24A', onPrimary: '#16181A' })
    expect(palettes.light).toMatchObject({ sidebar: '#F2F2F4', main: '#FFFFFF', buttonDark: '#16181A', sage: '#EEF8C8' })
    expect(themes.light.radius.card).toBe(28)
    expect(themes.dark.shadow.card).toEqual({})
    expect(Object.keys(palettes.dark).sort()).toEqual(Object.keys(palettes.light).sort())
    expect(themes.dark.type.stat.fontVariant).toEqual(['tabular-nums'])
  })

  it('follows the system colour scheme', async () => {
    // The React Native Jest preset mocks useColorScheme, answering 'light'.
    jest.mocked(useColorScheme).mockReturnValue('dark')
    try {
      useServices({ account: { email: 'a@b.c' } })
      await renderRouter(routes, { initialUrl: '/' })
      expect(await screen.findByTestId('page-title')).toHaveStyle({ color: palettes.dark.ink })
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
