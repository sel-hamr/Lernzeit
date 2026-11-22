import { act, render, renderHook, screen } from '@testing-library/react-native'
import { useLayoutEffect, type ReactNode } from 'react'
import { Text } from 'react-native'
import { createLocalLibrary, type LocalLibrary } from '../../src/store/library'
import { LocalLibraryProvider, useLiveQuery } from '../../src/store/live'
import { nodeSqliteAdapter } from './nodeSqlite'

function setup() {
  const library = createLocalLibrary(nodeSqliteAdapter())
  const wrapper = ({ children }: { children: ReactNode }) => <LocalLibraryProvider library={library}>{children}</LocalLibraryProvider>
  return { library, wrapper }
}

/** A query that counts its runs. */
function counted<T>(fn: (library: LocalLibrary) => T) {
  const counter = { runs: 0, fn: (library: LocalLibrary) => (counter.runs++, fn(library)) }
  return counter
}

describe('useLiveQuery', () => {
  it('answers on the first render, from the local database', async () => {
    const { library, wrapper } = setup()
    library.put('decks', { id: 'd1', name: 'One' })
    const { result } = await renderHook(() => useLiveQuery(['decks'], (lib) => lib.count('decks'), []), { wrapper })
    expect(result.current).toBe(1)
  })

  it('runs again after a committed write to one of its tables', async () => {
    const { library, wrapper } = setup()
    const query = counted((lib) => lib.list<{ id: string }>('cards', { deckId: 'd1' }).map((c) => c.id))
    const { result } = await renderHook(() => useLiveQuery(['cards', 'decks'], query.fn, []), { wrapper })
    expect(result.current).toEqual([])
    const before = query.runs

    await act(() => library.put('cards', { id: 'c1', deckId: 'd1' }))
    expect(result.current).toEqual(['c1'])
    await act(() => library.remove('decks', 'd9'))
    expect(query.runs).toBe(before + 2)

    // A transaction of many writes runs it once.
    await act(() =>
      library.write(() => {
        library.put('cards', { id: 'c2', deckId: 'd1' })
        library.put('cards', { id: 'c3', deckId: 'd1' })
      }),
    )
    expect(result.current.sort()).toEqual(['c1', 'c2', 'c3'])
    expect(query.runs).toBe(before + 3)
  })

  it('does not run again for a write to another table', async () => {
    const { library, wrapper } = setup()
    const query = counted((lib) => lib.count('cards'))
    await renderHook(() => useLiveQuery(['cards'], query.fn, []), { wrapper })
    const before = query.runs
    await act(() => {
      library.put('decks', { id: 'd1' })
      library.setMeta('cursor', 'x')
      library.applyRemote((remote) => remote.apply({ tbl: 'tasks', id: 't1', data: { id: 't1' }, updatedAt: 1, deleted: false }))
    })
    expect(query.runs).toBe(before)
  })

  it('runs again, without a write, when its dependencies change', async () => {
    const { library, wrapper } = setup()
    library.put('cards', { id: 'c1', deckId: 'd1' })
    library.put('cards', { id: 'c2', deckId: 'd2' })
    const { result, rerender } = await renderHook(({ deckId }: { deckId: string }) => useLiveQuery(['cards'], (lib) => lib.listIds('cards', { deckId }), [deckId]), {
      wrapper,
      initialProps: { deckId: 'd1' },
    })
    expect(result.current).toEqual(['c1'])
    await rerender({ deckId: 'd2' })
    expect(result.current).toEqual(['c2'])
  })

  it('stops listening once unmounted', async () => {
    const { library, wrapper } = setup()
    const query = counted((lib) => lib.count('cards'))
    const { unmount } = await renderHook(() => useLiveQuery(['cards'], query.fn, []), { wrapper })
    await unmount()
    const before = query.runs
    library.put('cards', { id: 'c1' })
    expect(query.runs).toBe(before)
  })

  it('needs a LocalLibraryProvider above it', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {})
    try {
      await expect(renderHook(() => useLiveQuery(['cards'], (lib) => lib.count('cards'), []))).rejects.toThrow(/LocalLibraryProvider/)
    } finally {
      jest.mocked(console.error).mockRestore()
    }
  })
})

describe('useLiveQuery between its first render and its subscription', () => {
  it('still sees a write made then', async () => {
    const { library, wrapper } = setup()
    // A layout effect runs before the hook subscribes (a passive effect).
    function Writer() {
      useLayoutEffect(() => library.put('cards', { id: 'c1' }), [])
      return null
    }
    function Reader() {
      return <Text>{`cards ${useLiveQuery(['cards'], (lib) => lib.count('cards'), [])}`}</Text>
    }
    await render(
      <>
        <Reader />
        <Writer />
      </>,
      { wrapper },
    )
    expect(screen.getByText('cards 1')).toBeTruthy()
  })
})
