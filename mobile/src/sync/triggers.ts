/*
 * When the phone syncs, as the web does (src/sync/engine.ts startSync): when the app starts, when
 * it comes back to the foreground, 2 s after the last local write (so a burst of edits goes up
 * together), every 60 s while it is in the foreground, and when the network comes back. Nothing
 * while signed out; signing in syncs at once. Failures show in the sync status, not here.
 */
import NetInfo from '@react-native-community/netinfo'
import { SYNC_TABLES } from '@lernzeit/core/sync'
import { AppState, type AppStateStatus } from 'react-native'
import { ACCOUNT_KEY, type LocalLibrary } from '../store/library'
import type { SyncEngine } from './engine'
import { getSyncStatus, setSyncStatus } from './status'

/** A sync starts this long after the last local write. */
export const LOCAL_CHANGE_DELAY = 2_000
/** How often the app in the foreground syncs to pick up other devices' changes. */
export const INTERVAL = 60_000

/** The part of React Native's AppState the triggers use. */
export interface AppStateSource {
  currentState: string | null | undefined
  addEventListener(type: 'change', listener: (state: AppStateStatus) => void): { remove(): void }
}

/** The part of NetInfo the triggers use. */
export interface NetworkSource {
  addEventListener(listener: (state: { isConnected: boolean | null }) => void): () => void
}

export interface SyncTriggerOptions {
  engine: Pick<SyncEngine, 'syncNow'>
  library: LocalLibrary
  appState?: AppStateSource
  netInfo?: NetworkSource
}

const noop = () => {}

/** Starts the triggers, syncing once now. Returns the function that stops them; a sync already running finishes. */
export function startSyncTriggers({ engine, library, appState = AppState, netInfo = NetInfo }: SyncTriggerOptions): () => void {
  const signedIn = () => library.getMeta(ACCOUNT_KEY) !== undefined
  const sync = () => {
    if (signedIn()) engine.syncNow().catch(noop)
  }

  let delay: ReturnType<typeof setTimeout> | undefined
  const stopWrites = library.subscribe(SYNC_TABLES, (event) => {
    if (!event.local) return
    clearTimeout(delay)
    delay = setTimeout(sync, LOCAL_CHANGE_DELAY)
  })

  // The 60 s timer runs only in the foreground while signed in, so a phone in the background or
  // signed out is not woken every minute.
  let interval: ReturnType<typeof setInterval> | undefined
  const updateInterval = (state = appState.currentState) => {
    const wanted = state === 'active' && signedIn()
    if (wanted && interval === undefined) interval = setInterval(sync, INTERVAL)
    else if (!wanted && interval !== undefined) {
      clearInterval(interval)
      interval = undefined
    }
  }

  let wasSignedIn = signedIn()
  const stopAccount = library.subscribe(['meta'], () => {
    const now = signedIn()
    if (now && !wasSignedIn) sync()
    wasSignedIn = now
    updateInterval()
  })

  const foreground = appState.addEventListener('change', (state) => {
    updateInterval(state)
    if (state === 'active') sync()
  })
  updateInterval()

  // NetInfo tells the current state first; only a change from offline to online syncs.
  let online: boolean | undefined
  const stopNetwork = netInfo.addEventListener(({ isConnected }) => {
    const connected = isConnected !== false
    if (connected && online === false) sync()
    if (!connected && signedIn() && getSyncStatus().state !== 'syncing') setSyncStatus({ state: 'offline' })
    online = connected
  })

  sync()
  return () => {
    stopWrites()
    stopAccount()
    foreground.remove()
    clearInterval(interval)
    clearTimeout(delay)
    stopNetwork()
  }
}
