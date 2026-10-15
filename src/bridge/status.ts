import { useSyncExternalStore } from 'react'
import { useBridgeConfig } from './config'

/**
 * - `no_token`: switched on, but there is no token yet
 * - `standby`: another tab of this browser holds the connection
 * - `waiting`: the MCP server is not running, so the tab keeps trying
 * - `wrong_token`, `outdated`, `name_taken`: refused; it tries again once the settings change
 */
export type BridgeStatus = 'off' | 'no_token' | 'standby' | 'waiting' | 'connected' | 'wrong_token' | 'outdated' | 'name_taken'

let current: BridgeStatus = 'off'
const listeners = new Set<() => void>()

export function setBridgeStatus(status: BridgeStatus) {
  if (status === current) return
  current = status
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useBridgeStatus(): BridgeStatus {
  return useSyncExternalStore(subscribe, () => current)
}

export type StatusLevel = 'ok' | 'idle' | 'waiting' | 'error'

export const STATUS_INFO: Record<BridgeStatus, { label: string; level: StatusLevel; hint?: string }> = {
  off: { label: 'Off', level: 'idle' },
  no_token: { label: 'Needs a token', level: 'waiting', hint: 'Generate a token, then copy the setup for your AI app.' },
  standby: { label: 'Connected in another tab', level: 'idle' },
  waiting: { label: 'Waiting for the AI app', level: 'waiting', hint: 'Start an AI app that has the Lernzeit MCP server, such as Claude Desktop.' },
  connected: { label: 'Connected', level: 'ok' },
  wrong_token: { label: 'Wrong token', level: 'error', hint: 'The token must match LERNZEIT_TOKEN in your AI app’s config. Copy the setup again below.' },
  outdated: { label: 'Version mismatch', level: 'error', hint: 'Update Lernzeit and the MCP server to the same version.' },
  name_taken: { label: 'Name in use', level: 'error', hint: 'Another browser connected with this name. Pick a different one.' },
}

/** The connection status with its label, or `undefined` while AI connection is off. */
export function useBridgeIndicator() {
  const { enabled, token } = useBridgeConfig()
  const current = useBridgeStatus()
  if (!enabled) return undefined
  // Derived here too, so the label is right before the engine has caught up.
  const status = token ? current : 'no_token'
  return { status, ...STATUS_INFO[status] }
}
