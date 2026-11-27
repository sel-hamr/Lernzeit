/*
 * This phone's IANA time zone, and recording it in its own synced record (`kv/timeZone`), as the web
 * does (src/data/timeZone.ts): the Worker runs in UTC and dates study sessions with the owner's zone.
 * It is not a setting: rewriting the shared settings record would put this phone's copy of every
 * other setting over newer changes made on another device.
 */
import { ACCOUNT_KEY, type LocalLibrary } from './store/library'

/** The zone the platform reports, undefined when it cannot tell. */
export function platformTimeZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined
  } catch {
    return undefined
  }
}

/** This phone's zone, UTC when the platform cannot tell. */
export function deviceTimeZone(): string {
  return platformTimeZone() ?? 'UTC'
}

/**
 * Writes `zone` to `kv/timeZone` as a local write (so it syncs) when signed in and it differs from
 * the stored one. Returns whether it wrote. An unknown zone writes nothing.
 */
export function recordTimeZone(library: LocalLibrary, zone: string | undefined): boolean {
  if (!zone || library.getMeta(ACCOUNT_KEY) === undefined) return false
  if (library.get<{ value?: unknown }>('kv', 'timeZone')?.value === zone) return false
  library.put('kv', { key: 'timeZone', value: zone })
  return true
}
