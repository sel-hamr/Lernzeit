import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, KV_KEYS, type LernzeitDB } from '@/db/db'
import { DEFAULT_PORT } from './protocol'

/**
 * Settings → AI connection. It belongs to this browser, so it has its own kv
 * row instead of living in Settings, which backups carry to other browsers.
 */
export interface BridgeConfig {
  enabled: boolean
  /** How the AI tells browsers apart. Empty means the browser kind, e.g. "Chrome". */
  name: string
  token: string
  port: number
}

export const DEFAULT_BRIDGE_CONFIG: BridgeConfig = { enabled: false, name: '', token: '', port: DEFAULT_PORT }

const withDefaults = (value: unknown): BridgeConfig => ({ ...DEFAULT_BRIDGE_CONFIG, ...(value as Partial<BridgeConfig> | undefined) })

export async function getBridgeConfig(database: LernzeitDB = db): Promise<BridgeConfig> {
  return withDefaults((await database.kv.get(KV_KEYS.bridge))?.value)
}

export async function updateBridgeConfig(patch: Partial<BridgeConfig>, database: LernzeitDB = db) {
  await database.transaction('rw', database.kv, async () => {
    const current = await getBridgeConfig(database)
    await database.kv.put({ key: KV_KEYS.bridge, value: { ...current, ...patch } })
  })
}

export function useBridgeConfig(): BridgeConfig {
  const row = useLiveQuery(() => db.kv.get(KV_KEYS.bridge), [])
  return useMemo(() => withDefaults(row?.value), [row])
}

/** The browser family from its user agent, e.g. "Edge". Edge and Opera also say Chrome, so they go first. */
export function browserKind(userAgent: string = navigator.userAgent): string {
  if (/\bEdg\//.test(userAgent)) return 'Edge'
  if (/\bOPR\//.test(userAgent)) return 'Opera'
  if (/\bFirefox\//.test(userAgent)) return 'Firefox'
  if (/\bChrome\//.test(userAgent)) return 'Chrome'
  if (/\bSafari\//.test(userAgent)) return 'Safari'
  return 'Browser'
}
