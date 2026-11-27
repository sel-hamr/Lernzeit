/* Hands the one sync engine to the screens (Settings' Sync now). Absent in tests that need no cloud. */
import { createContext, createElement, useContext, type ReactNode } from 'react'
import type { SyncEngine } from './engine'

const SyncEngineContext = createContext<SyncEngine | undefined>(undefined)

export function SyncEngineProvider({ engine, children }: { engine?: SyncEngine; children?: ReactNode }) {
  return createElement(SyncEngineContext.Provider, { value: engine }, children)
}

export function useSyncEngine(): SyncEngine | undefined {
  return useContext(SyncEngineContext)
}
