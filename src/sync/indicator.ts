/* How sync is doing, in plain words, for the sidebar row, the phone's Settings dot and Settings → Account. */
import type { StatusLevel } from '@/bridge/status'
import { docDateLabel } from '@lernzeit/core/docs'
import { count } from '@lernzeit/core/text'
import type { StuckChange, SyncStatus } from './status'

export interface SyncIndicator {
  label: string
  level: StatusLevel
  /** More on hover or tap: why it failed, or why changes cannot go up. */
  hint?: string
  /** A passing state, such as a sync under way, that needs no dot of its own. */
  passing?: boolean
}

const changes = (n: number) => count(n, 'change')

export function syncIndicator(status: SyncStatus & { pending: number; stuck: StuckChange[] }): SyncIndicator {
  const { state, pending, stuck } = status
  if (state === 'signedOut') return { label: 'Signed out', level: 'error' }
  if (state === 'offline') return { label: pending ? `Offline · ${changes(pending)} waiting` : 'Offline', level: 'waiting' }
  if (state === 'syncing') return { label: 'Syncing…', level: 'waiting', passing: true }
  if (state === 'error') return { label: 'Sync failed', level: 'error', hint: status.error }
  if (stuck.length) return { label: `${changes(stuck.length)} can’t be uploaded`, level: 'error', hint: stuck.map((s) => s.reason).join('\n') }
  // Changes go up a moment after they are made.
  if (pending) return { label: `${changes(pending)} waiting`, level: 'waiting', passing: true }
  return { label: 'Synced', level: 'ok' }
}

/** "just now", "5 min ago", "3 h ago", then "Yesterday" or a date. */
export function timeAgo(time: number, now: number = Date.now()): string {
  const minutes = Math.floor((now - time) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  if (minutes < 12 * 60) return `${Math.floor(minutes / 60)} h ago`
  return docDateLabel(time, now)
}
