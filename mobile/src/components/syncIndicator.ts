import { syncIndicator, type StatusLevel, type SyncIndicator } from '@lernzeit/core/syncIndicator'
import { useSyncStatus } from '../sync/status'
import type { Palette } from '../theme'

/** The dot colour of each level, as the web's LEVEL_DOT. */
export function levelColor(colors: Palette, level: StatusLevel): string {
  return { ok: colors.sageDot, idle: colors.lineStrong, waiting: colors.muted, error: colors.redInk }[level]
}

export function useSyncIndicator(): SyncIndicator {
  return syncIndicator(useSyncStatus())
}
