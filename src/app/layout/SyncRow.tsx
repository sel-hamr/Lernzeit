import { Link } from 'react-router'
import clsx from 'clsx'
import { Cloud, CloudOff } from 'lucide-react'
import { ACCOUNT_ID } from '@/features/settings/AccountGroup'
import { LEVEL_DOT, useSyncIndicator } from './syncState'

const ACCOUNT_SETTINGS = `/settings#${ACCOUNT_ID}`

/** Whether the library is in step with the cloud, and what waits; the reason on hover. */
export function SyncRow() {
  const sync = useSyncIndicator()
  const Icon = sync.level === 'ok' ? Cloud : CloudOff
  return (
    <Link to={ACCOUNT_SETTINGS} title={sync.hint ?? sync.label} className="flex h-9 items-center gap-2.5 rounded-img px-3 text-small text-ink-2 transition-colors hover:bg-main/60 hover:text-ink">
      <Icon size={16} strokeWidth={1.7} aria-hidden />
      <span className="flex-1">Sync</span>
      <span className="flex min-w-0 items-center gap-1.5 text-chip text-muted">
        <span className={clsx('size-1.5 shrink-0 rounded-full', LEVEL_DOT[sync.level])} />
        <span className="truncate">{sync.label}</span>
      </span>
    </Link>
  )
}
