import { useSyncExternalStore } from 'react'

/**
 * - `standby`: another tab of this browser holds the connection
 * - `waiting`: the MCP server is not running, so the tab keeps trying
 * - `wrong_token`, `outdated`, `name_taken`: refused; it tries again once the settings change
 */
export type BridgeStatus = 'off' | 'standby' | 'waiting' | 'connected' | 'wrong_token' | 'outdated' | 'name_taken'

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
