/*
 * Live reads for screens: `useLiveQuery(tables, query, deps)` runs `query` on the local library and
 * runs it again after each committed write to one of `tables` (one run per transaction), or when
 * `deps` change. The reads are synchronous, so the first render already has the answer.
 */
import { createContext, createElement, useCallback, useContext, useState, useSyncExternalStore, type DependencyList, type ReactNode } from 'react'
import type { LiveTable, LocalLibrary } from './library'

const LocalLibraryContext = createContext<LocalLibrary | null>(null)

/** Hands `library` to the live queries below it. */
export function LocalLibraryProvider({ library, children }: { library: LocalLibrary; children?: ReactNode }) {
  return createElement(LocalLibraryContext.Provider, { value: library }, children)
}

export function useLocalLibrary(): LocalLibrary {
  const library = useContext(LocalLibraryContext)
  if (!library) throw new Error('useLocalLibrary and useLiveQuery need a LocalLibraryProvider above them.')
  return library
}

export function useLiveQuery<T>(tables: readonly LiveTable[], query: (library: LocalLibrary) => T, deps: DependencyList): T {
  const library = useLocalLibrary()
  // The tables as one string, so a new array with the same tables keeps the subscription.
  const key = [...tables].sort().join(',')
  const watched = useCallback(() => key.split(',') as LiveTable[], [key])
  const subscribe = useCallback((onChange: () => void) => library.subscribe(watched(), onChange), [library, watched])
  // The library's own count of writes to these tables, so a write between the first render and the
  // subscription is not missed: React compares it again once subscribed.
  const changes = useSyncExternalStore(subscribe, () => library.version(watched()))

  // The last answer and what it was read for. A new change or dep reads again during the render
  // (React's pattern for state derived from props), so the screen never shows a stale answer.
  const [answer, setAnswer] = useState(() => ({ value: query(library), library, changes, deps }))
  if (answer.library !== library || answer.changes !== changes || !sameDeps(answer.deps, deps)) {
    const next = { value: query(library), library, changes, deps }
    setAnswer(next)
    return next.value
  }
  return answer.value
}

const sameDeps = (a: DependencyList, b: DependencyList) => a.length === b.length && a.every((dep, i) => Object.is(dep, b[i]))
