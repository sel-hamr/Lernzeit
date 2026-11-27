import { useSyncStatus } from '@/sync/status'
import { syncIndicator, type StatusLevel, type SyncIndicator } from '@/sync/indicator'

export const LEVEL_DOT: Record<StatusLevel, string> = { ok: 'bg-sage-dot', idle: 'bg-line-strong', waiting: 'bg-muted', error: 'bg-red-ink' }

export function useSyncIndicator(): SyncIndicator {
  return syncIndicator(useSyncStatus())
}
