import { fireEvent, renderRouter, screen, waitFor, within } from 'expo-router/testing-library'
import { Alert, type AlertButton } from 'react-native'
import { createAccountService } from '../src/account'
import { OfflineError } from '../src/api'
import type { Services } from '../src/services'
import { createLocalLibrary } from '../src/store/library'
import type { SyncEngine } from '../src/sync/engine'
import { LAST_SYNCED_KEY, setSyncStatus } from '../src/sync/status'
import { removalWarning } from '../app/sign-in'
import { routes } from './routes'
import { nodeSqliteAdapter } from './store/nodeSqlite'

let mockServices: Services
jest.mock('../src/services', () => ({ createServices: () => mockServices }))

const ACCOUNT = { email: 'a@b.c' }

interface Options {
  hidden?: string[]
  engine?: SyncEngine
  login?: jest.Mock
}

function useServices({ hidden, engine, login }: Options = {}) {
  const library = createLocalLibrary(nodeSqliteAdapter())
  library.setMeta('account', ACCOUNT)
  if (hidden) library.put('kv', { key: 'settings', value: { hiddenFeatures: hidden } })
  // The welcome was done (on another device), so the screens under test are not covered by it.
  library.put('kv', { key: 'starterOffer', value: 'done' })
  // Settings that came from the cloud, not changes waiting to go up.
  library.acknowledge(library.outbox())
  let token: string | null = 'tok'
  const tokens = { get: async () => token, set: async (t: string) => void (token = t), clear: async () => void (token = null) }
  const api = { login: login ?? jest.fn(async () => ({ email: 'a@b.c', token: 't' })), logout: jest.fn(async () => {}) }
  mockServices = { library, account: createAccountService({ library, api, tokens }), engine }
  return { library, api }
}

const open = () => renderRouter(routes, { initialUrl: '/' })
const tabNames = () => screen.queryAllByRole('tab').map((tab) => tab.props.accessibilityLabel)
const openMenu = async () => {
  await fireEvent.press(screen.getByRole('button', { name: /^Menu/ }))
  return screen.findByTestId('menu-sheet')
}
const menuLinks = (sheet: ReturnType<typeof screen.getByTestId>) => within(sheet).queryAllByRole('link').map((link) => link.props.accessibilityLabel as string)

beforeEach(() => setSyncStatus({ state: 'idle' }))

// The app syncs once when it starts (the sync triggers), before any press.
const STARTUP_SYNCS = 1

describe('the bottom bar', () => {
  it('has Today, Cards, Stories and Timer, and opens on Today', async () => {
    useServices()
    await open()
    expect(await screen.findByTestId('page-title')).toBeTruthy()
    expect(tabNames()).toEqual(['Today', 'Cards', 'Stories', 'Timer'])
    expect(screen.getByRole('tab', { name: 'Today' }).props.accessibilityState.selected).toBe(true)
  })

  it('leaves a turned-off tab out without replacing it', async () => {
    useServices({ hidden: ['stories'] })
    await open()
    await screen.findByTestId('page-title')
    expect(tabNames()).toEqual(['Today', 'Cards', 'Timer'])
  })

  it('follows the synced settings live', async () => {
    const { library } = useServices()
    await open()
    await screen.findByTestId('page-title')
    expect(tabNames()).toHaveLength(4)
    library.put('kv', { key: 'settings', value: { hiddenFeatures: ['timer', 'flashcards'] } })
    await waitFor(() => expect(tabNames()).toEqual(['Today', 'Stories']))
  })

  it('switches page and marks the active tab', async () => {
    useServices()
    await open()
    await fireEvent.press(await screen.findByRole('tab', { name: 'Cards' }))
    expect(await screen.findByLabelText('Quick add a card')).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Cards' }).props.accessibilityState.selected).toBe(true)
    expect(screen.getByRole('tab', { name: 'Today' }).props.accessibilityState.selected).toBe(false)
  })
})

describe('the menu', () => {
  it('lists the other pages and Settings, with the sync row', async () => {
    useServices()
    await open()
    await screen.findByTestId('page-title')
    expect(menuLinks(await openMenu())).toEqual(['Grammar', 'Questions', 'Docs', 'History', 'Board', 'Settings', 'Sync: Synced'])
  })

  it('leaves out a turned-off page and never lists a tab', async () => {
    useServices({ hidden: ['stories', 'grammar', 'board'] })
    await open()
    await screen.findByTestId('page-title')
    expect(menuLinks(await openMenu())).toEqual(['Questions', 'Docs', 'History', 'Settings', 'Sync: Synced'])
  })

  it('closes on the back button and on the backdrop', async () => {
    useServices()
    await open()
    await screen.findByTestId('page-title')
    let sheet = await openMenu()
    await fireEvent(sheet, 'requestClose')
    await waitFor(() => expect(screen.queryByTestId('menu-sheet')).toBeNull())

    sheet = await openMenu()
    await fireEvent.press(within(sheet).getByRole('button', { name: 'Close menu' }))
    await waitFor(() => expect(screen.queryByTestId('menu-sheet')).toBeNull())
  })

  it('opens a page, closes itself and comes back with the back button', async () => {
    useServices()
    await open()
    await screen.findByTestId('page-title')
    await fireEvent.press(within(await openMenu()).getByRole('link', { name: 'Grammar' }))
    expect(await screen.findByText('Coming in the next update')).toBeTruthy()
    expect(screen.getAllByRole('header').map((h) => h.props.children)).toContain('Grammar')
    expect(screen.queryByTestId('menu-sheet')).toBeNull()
    await fireEvent.press(screen.getByRole('button', { name: 'Back' }))
    expect(await screen.findByRole('tab', { name: 'Today' })).toBeTruthy()
  })

  it('marks the sync state on the Menu button while it needs a look', async () => {
    const { library } = useServices()
    await open()
    await screen.findByTestId('page-title')
    setSyncStatus({ state: 'offline' })
    library.put('decks', { id: 'd1', name: 'One' })
    expect(await screen.findByRole('button', { name: 'Menu, Sync: Offline · 1 change waiting' })).toBeTruthy()
  })
})

describe('search', () => {
  it('opens the placeholder search page', async () => {
    useServices()
    await open()
    await fireEvent.press(await screen.findByRole('button', { name: 'Search' }))
    expect(await screen.findByText('Search comes in the next update')).toBeTruthy()
  })
})

describe('Settings → Account', () => {
  const engineWith = (syncNow: () => Promise<{ pushed: number; pulled: number }>): SyncEngine => ({ syncNow: jest.fn(syncNow) })
  const goToSettings = async () => {
    await screen.findByTestId('page-title')
    await fireEvent.press(within(await openMenu()).getByRole('link', { name: 'Settings' }))
    return screen.findByText('Your library syncs with your Lernzeit cloud. This phone keeps a copy, so it works offline too.')
  }
  /** Answers the confirmation like a tap on the button with this text. */
  const answerAlert = (text: string) =>
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => void (buttons as AlertButton[]).find((b) => b.text === text)?.onPress?.())

  afterEach(() => jest.restoreAllMocks())

  it('shows the email, the last sync and the sync state', async () => {
    const { library } = useServices({ engine: engineWith(async () => ({ pushed: 0, pulled: 0 })) })
    library.setMeta(LAST_SYNCED_KEY, Date.now() - 5 * 60_000)
    await open()
    await goToSettings()
    expect(screen.getByText('a@b.c')).toBeTruthy()
    expect(screen.getByText('Last synced 5 min ago')).toBeTruthy()
    expect(screen.getByLabelText('Sync: Synced')).toBeTruthy()
  })

  it('lists the changes the cloud refused, with their reasons', async () => {
    const { library } = useServices({ engine: engineWith(async () => ({ pushed: 0, pulled: 0 })) })
    library.put('cards', { id: 'c1' })
    library.park([{ entry: library.outboxEntry('cards', 'c1')!, reason: 'The card is too large.' }])
    await open()
    await goToSettings()
    expect(screen.getByText('A card can’t be uploaded. The card is too large.')).toBeTruthy()
  })

  it('Sync now syncs, shows that it is syncing, then says so', async () => {
    const waiting: (() => void)[] = []
    let engineCalls = 0
    // The first call is the app's own sync at start; only Sync now's is held back.
    const engine = engineWith(() => (engineCalls++ === 0 ? Promise.resolve({ pushed: 0, pulled: 0 }) : new Promise((resolve) => waiting.push(() => resolve({ pushed: 0, pulled: 0 })))))
    useServices({ engine })
    await open()
    await goToSettings()
    await fireEvent.press(screen.getByRole('button', { name: 'Sync now' }))
    expect(engine.syncNow).toHaveBeenCalledTimes(1 + STARTUP_SYNCS)
    expect(screen.getByRole('button', { name: 'Sync now' }).props.accessibilityState).toMatchObject({ disabled: true, busy: true })
    waiting.forEach((finish) => finish())
    expect(await screen.findByText('Synced', { exact: true })).toBeTruthy()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Sync now' }).props.accessibilityState.disabled).toBe(false))
  })

  it('Sync now says when the cloud cannot be reached', async () => {
    useServices({ engine: engineWith(async () => Promise.reject(new OfflineError())) })
    await open()
    await goToSettings()
    await fireEvent.press(screen.getByRole('button', { name: 'Sync now' }))
    expect(await screen.findByText('Can’t reach your Lernzeit cloud. Check the connection and try again.')).toBeTruthy()
  })

  it('Sign out syncs first and signs out when nothing is left to upload', async () => {
    const alert = jest.spyOn(Alert, 'alert')
    const engine = engineWith(async () => {
      // The sync uploads what waited.
      mockServices.library.removeOutboxEntry('decks', 'd1')
      return { pushed: 1, pulled: 0 }
    })
    const services = useServices({ engine })
    const { library } = services
    library.put('decks', { id: 'd1', name: 'One' })
    await open()
    await goToSettings()
    await fireEvent.press(screen.getByRole('button', { name: 'Sign out' }))
    expect(await screen.findByText('Welcome back')).toBeTruthy()
    expect(engine.syncNow).toHaveBeenCalledTimes(1 + STARTUP_SYNCS)
    expect(alert).not.toHaveBeenCalled()
    expect(library.getMeta('account')).toBeUndefined()
    expect(library.count('decks')).toBe(0)
  })

  it('asks before signing out with changes not uploaded, and keeps everything on Cancel', async () => {
    const engine = engineWith(async () => Promise.reject(new OfflineError()))
    const { library } = useServices({ engine })
    library.put('decks', { id: 'd1', name: 'One' })
    library.put('decks', { id: 'd2', name: 'Two' })
    await open()
    await goToSettings()
    const alert = answerAlert('Cancel')
    await fireEvent.press(screen.getByRole('button', { name: 'Sign out' }))
    await waitFor(() => expect(alert).toHaveBeenCalled())
    expect(alert.mock.calls[0]?.slice(0, 2)).toEqual(['Sign out anyway?', '2 changes are not uploaded yet.'])
    await waitFor(() => expect(screen.getByRole('button', { name: 'Sign out' }).props.accessibilityState.disabled).toBe(false))
    expect(engine.syncNow).toHaveBeenCalledTimes(1 + STARTUP_SYNCS)
    expect(library.getMeta('account')).toEqual(ACCOUNT)
    expect(library.count('decks')).toBe(2)
    expect(screen.queryByText('Welcome back')).toBeNull()
  })

  it('signs out anyway after the confirmation, removing the data', async () => {
    const { library, api } = useServices({ engine: engineWith(async () => Promise.reject(new OfflineError())) })
    library.put('decks', { id: 'd1', name: 'One' })
    await open()
    await goToSettings()
    const alert = answerAlert('Sign out anyway')
    await fireEvent.press(screen.getByRole('button', { name: 'Sign out' }))
    expect(await screen.findByText('Welcome back')).toBeTruthy()
    expect(alert.mock.calls[0]?.slice(0, 2)).toEqual(['Sign out anyway?', '1 change is not uploaded yet.'])
    expect(api.logout).toHaveBeenCalled()
    expect(library.count('decks')).toBe(0)
    expect(library.outboxSize()).toBe(0)
  })
})

describe('signing in as another account', () => {
  it('refuses while the phone has data from one, and removes that data on request', async () => {
    const login = jest.fn(async () => ({ email: 'x@y.z', token: 't' }))
    const { library } = useServices({ login })
    await open()
    await screen.findByTestId('page-title')
    // A 401 signed the phone out but kept its data and who it belonged to.
    library.setMeta('lastAccount', 'a@b.c')
    library.put('decks', { id: 'd1', name: 'One' })
    await mockServices.account.signedOut()
    await fireEvent.changeText(await screen.findByPlaceholderText('Email'), 'x@y.z')
    await fireEvent.changeText(screen.getByPlaceholderText('Password'), 'pw')
    await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByText('This phone has data from a@b.c. Use “Remove this phone’s data” below to sign in with another account.')).toBeTruthy()
    expect(login).not.toHaveBeenCalled()

    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => void (buttons as AlertButton[]).find((b) => b.text === 'Remove data')?.onPress?.())
    await fireEvent.press(screen.getByRole('button', { name: 'Remove this phone’s data' }))
    expect(alert.mock.calls[0]?.[1]).toBe('1 change is not uploaded and will be lost for good. This can’t be undone. Your data in the cloud stays.')
    await waitFor(() => expect(library.count('decks')).toBe(0))
    await waitFor(() => expect(screen.queryByText(/This phone has data from/)).toBeNull())
    await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByTestId('page-title')).toBeTruthy()
    expect(login).toHaveBeenCalledTimes(1)
  })
})

describe('the removal confirmation', () => {
  it('says what is lost, or that nothing unsynced is', () => {
    expect(removalWarning(3)).toBe('3 changes are not uploaded and will be lost for good. This can’t be undone. Your data in the cloud stays.')
    expect(removalWarning(0)).toBe('Nothing is waiting to be uploaded, so nothing unsynced is lost. This can’t be undone. Your data in the cloud stays.')
  })

  it('hides the remove link when the email changes', async () => {
    const { library } = useServices()
    await open()
    await screen.findByTestId('page-title')
    library.setMeta('lastAccount', 'a@b.c')
    library.put('decks', { id: 'd1', name: 'One' })
    await mockServices.account.signedOut()
    await fireEvent.changeText(await screen.findByPlaceholderText('Email'), 'x@y.z')
    await fireEvent.changeText(screen.getByPlaceholderText('Password'), 'pw')
    await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('button', { name: 'Remove this phone’s data' })).toBeTruthy()
    await fireEvent.changeText(screen.getByPlaceholderText('Email'), 'a@b.c')
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Remove this phone’s data' })).toBeNull())
  })
})
