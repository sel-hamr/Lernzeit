import { act, renderHook } from '@testing-library/react-native'
import type { ReactNode } from 'react'
import { ACCOUNT_KEY } from '../../src/account'
import { createLocalLibrary } from '../../src/store/library'
import { LocalLibraryProvider } from '../../src/store/live'
import { LAST_SYNCED_KEY, setSyncStatus, useSyncStatus } from '../../src/sync/status'
import { nodeSqliteAdapter } from '../store/nodeSqlite'

function setup() {
  const library = createLocalLibrary(nodeSqliteAdapter())
  library.setMeta(ACCOUNT_KEY, { email: 'a@b.c' })
  const wrapper = ({ children }: { children: ReactNode }) => <LocalLibraryProvider library={library}>{children}</LocalLibraryProvider>
  return { library, wrapper }
}

describe('useSyncStatus', () => {
  beforeEach(() => setSyncStatus({ state: 'idle' }))

  it('follows the engine’s state, the outbox and the last sync, live', async () => {
    const { library, wrapper } = setup()
    const { result } = await renderHook(() => useSyncStatus(), { wrapper })
    expect(result.current).toEqual({ state: 'idle', pending: 0, stuck: [], lastSyncedAt: undefined })

    await act(() => setSyncStatus({ state: 'syncing' }))
    expect(result.current.state).toBe('syncing')
    await act(() => {
      library.put('decks', { id: 'd1' })
      library.put('decks', { id: 'd2' })
    })
    expect(result.current.pending).toBe(2)

    await act(() => {
      library.park([{ entry: library.outboxEntry('decks', 'd2')!, reason: 'Too large' }])
      library.setMeta(LAST_SYNCED_KEY, 1234)
      setSyncStatus({ state: 'error', error: 'The server answered 500.' })
    })
    expect(result.current).toEqual({
      state: 'error',
      error: 'The server answered 500.',
      pending: 2,
      stuck: [{ tbl: 'decks', id: 'd2', reason: 'Too large' }],
      lastSyncedAt: 1234,
    })
  })

  it('says signed out whenever there is no account', async () => {
    const { library, wrapper } = setup()
    const { result } = await renderHook(() => useSyncStatus(), { wrapper })
    await act(() => library.removeMeta(ACCOUNT_KEY))
    expect(result.current.state).toBe('signedOut')
  })
})
