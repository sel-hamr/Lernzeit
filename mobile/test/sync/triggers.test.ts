import type { AppStateStatus } from 'react-native'
import { ACCOUNT_KEY } from '../../src/account'
import { createLocalLibrary } from '../../src/store/library'
import { getSyncStatus, setSyncStatus } from '../../src/sync/status'
import { startSyncTriggers } from '../../src/sync/triggers'
import { nodeSqliteAdapter } from '../store/nodeSqlite'

/** The app's state and the network as the test drives them, and an engine that counts its syncs. */
function setup({ signedIn = true } = {}) {
  const library = createLocalLibrary(nodeSqliteAdapter())
  if (signedIn) library.setMeta(ACCOUNT_KEY, { email: 'a@b.c' })
  const engine = { syncNow: jest.fn(async () => ({ pushed: 0, pulled: 0 })) }
  const appListeners = new Set<(state: AppStateStatus) => void>()
  const appState = {
    currentState: 'active' as AppStateStatus,
    addEventListener: (_type: 'change', listener: (state: AppStateStatus) => void) => {
      appListeners.add(listener)
      return { remove: () => void appListeners.delete(listener) }
    },
  }
  const netListeners = new Set<(state: { isConnected: boolean | null }) => void>()
  const netInfo = {
    addEventListener: (listener: (state: { isConnected: boolean | null }) => void) => {
      netListeners.add(listener)
      listener({ isConnected: true })
      return () => void netListeners.delete(listener)
    },
  }
  const stop = startSyncTriggers({ engine, library, appState, netInfo })
  return {
    library,
    engine,
    stop,
    syncs: () => engine.syncNow.mock.calls.length,
    setAppState(state: AppStateStatus) {
      appState.currentState = state
      for (const listener of appListeners) listener(state)
    },
    setConnected(isConnected: boolean) {
      for (const listener of netListeners) listener({ isConnected })
    },
    listeners: () => appListeners.size + netListeners.size,
  }
}

describe('the sync triggers', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    setSyncStatus({ state: 'idle' })
  })
  afterEach(() => jest.useRealTimers())

  it('sync when the app starts and whenever it comes back to the foreground', () => {
    const app = setup()
    expect(app.syncs()).toBe(1)
    app.setAppState('background')
    expect(app.syncs()).toBe(1)
    app.setAppState('active')
    expect(app.syncs()).toBe(2)
    app.stop()
  })

  it('sync 2 s after the last local write, once for a burst, and not for pulled changes', () => {
    const app = setup()
    app.library.put('decks', { id: 'd1' })
    jest.advanceTimersByTime(1500)
    app.library.put('decks', { id: 'd2' })
    jest.advanceTimersByTime(1999)
    expect(app.syncs()).toBe(1)
    jest.advanceTimersByTime(1)
    expect(app.syncs()).toBe(2)

    app.library.applyRemote((remote) => remote.apply({ tbl: 'decks', id: 'd3', data: { id: 'd3' }, updatedAt: 1, deleted: false }))
    app.library.put('kv', { key: 'deviceOnly', value: 1 })
    jest.advanceTimersByTime(5000)
    expect(app.syncs()).toBe(2)
    app.stop()
  })

  it('sync every 60 s in the foreground while signed in, with no timer left running otherwise', () => {
    const app = setup()
    jest.advanceTimersByTime(60_000)
    expect(app.syncs()).toBe(2)
    app.setAppState('background')
    expect(jest.getTimerCount()).toBe(0)
    jest.advanceTimersByTime(120_000)
    expect(app.syncs()).toBe(2)

    app.setAppState('active')
    expect(app.syncs()).toBe(3)
    jest.advanceTimersByTime(60_000)
    expect(app.syncs()).toBe(4)

    app.library.removeMeta(ACCOUNT_KEY)
    expect(jest.getTimerCount()).toBe(0)
    app.library.setMeta(ACCOUNT_KEY, { email: 'a@b.c' })
    expect(app.syncs()).toBe(5)
    jest.advanceTimersByTime(60_000)
    expect(app.syncs()).toBe(6)
    app.stop()
  })

  it('keep the 2 s sync after a write going in the background', () => {
    const app = setup()
    app.library.put('decks', { id: 'd1' })
    app.setAppState('background')
    jest.advanceTimersByTime(2_000)
    expect(app.syncs()).toBe(2)
    app.stop()
  })

  it('sync when the network comes back, and say offline when it goes', () => {
    const app = setup()
    app.setConnected(true)
    expect(app.syncs()).toBe(1)
    app.setConnected(false)
    expect(getSyncStatus().state).toBe('offline')
    app.setConnected(true)
    expect(app.syncs()).toBe(2)
    app.stop()
  })

  it('do nothing while signed out, and sync as soon as an account signs in', () => {
    const app = setup({ signedIn: false })
    app.setAppState('active')
    app.setConnected(false)
    app.setConnected(true)
    app.library.put('decks', { id: 'd1' })
    jest.advanceTimersByTime(120_000)
    expect(app.syncs()).toBe(0)
    app.library.setMeta(ACCOUNT_KEY, { email: 'a@b.c' })
    expect(app.syncs()).toBe(1)
    app.stop()
  })

  it('stop listening and cancel a pending sync when stopped', () => {
    const app = setup()
    app.library.put('decks', { id: 'd1' })
    app.stop()
    jest.advanceTimersByTime(120_000)
    app.setAppState('active')
    expect(app.syncs()).toBe(1)
    expect(app.listeners()).toBe(0)
  })
})
