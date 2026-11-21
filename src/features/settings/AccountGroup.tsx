import { useEffect, useState } from 'react'
import { LogOut, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Chip, type ChipTone } from '@/components/ui/primitives'
import { useFeedback } from '@/components/ui/feedback'
import { db } from '@/db/db'
import type { StatusLevel } from '@/bridge/status'
import { failureMessage, signOut, useAccount } from '@/sync/account'
import { listDevices, removeDevice, type SignedInDevice } from '@/sync/api'
import { syncNow } from '@/sync/engine'
import { syncIndicator, timeAgo } from '@/sync/indicator'
import { useSyncStatus } from '@/sync/status'
import { count } from '@lernzeit/core/text'
import { Group } from './Group'

export const ACCOUNT_ID = 'account'

const LEVEL_TONE: Record<StatusLevel, ChipTone> = { ok: 'sage', idle: 'soft', waiting: 'neutral', error: 'red' }

/** What a stuck change is, in a word. */
const RECORD_NOUN: Record<string, string> = {
  cards: 'A card',
  decks: 'A deck',
  docs: 'A doc',
  docFolders: 'A folder',
  images: 'An image',
  stories: 'A story',
  questions: 'A question',
  grammarTopics: 'A grammar topic',
  tasks: 'A task',
  topics: 'A topic',
}

/** Who is signed in, how sync is doing, signing out, and the browsers and devices signed in. */
export function AccountGroup() {
  const account = useAccount()
  const status = useSyncStatus()
  const sync = syncIndicator(status)
  const { toast, confirm } = useFeedback()
  const [syncing, setSyncing] = useState(false)

  const syncHere = async () => {
    setSyncing(true)
    try {
      await syncNow()
      toast('Synced')
    } catch (error) {
      toast(failureMessage(error), { tone: 'error' })
    } finally {
      setSyncing(false)
    }
  }

  const leave = async () => {
    if ((await signOut()) === 'done') return
    const waiting = await db.outbox.count()
    const ok = await confirm({
      title: 'Sign out anyway?',
      body: `${count(waiting, 'change is', 'changes are')} not uploaded yet. Signing out removes them from this browser.`,
      confirmLabel: 'Sign out anyway',
      danger: true,
    })
    if (ok) await signOut({ force: true })
  }

  return (
    <Group
      id={ACCOUNT_ID}
      title="Account"
      description="Your library syncs with your Lernzeit cloud. This browser keeps a copy, so it works offline too."
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-px">
          <span className="truncate text-body font-medium">{account?.email}</span>
          <span className="text-small text-muted">{status.lastSyncedAt ? `Last synced ${timeAgo(status.lastSyncedAt)}` : 'Not synced yet on this visit'}</span>
        </div>
        <span title={sync.hint}>
          <Chip tone={LEVEL_TONE[sync.level]}>{sync.label}</Chip>
        </span>
      </div>
      {status.stuck.length > 0 && (
        <ul className="flex flex-col gap-1.5 rounded-row bg-field px-4 py-3 text-small text-ink-2">
          {status.stuck.map((change) => (
            <li key={`${change.tbl}/${change.id}`}>
              {RECORD_NOUN[change.tbl] ?? 'A change'} can’t be uploaded. {change.reason}
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" icon={<RefreshCw size={15} strokeWidth={1.8} />} disabled={syncing} onClick={() => void syncHere()}>
          Sync now
        </Button>
        <Button variant="outline" icon={<LogOut size={15} strokeWidth={1.8} />} onClick={() => void leave()}>
          Sign out
        </Button>
      </div>
      <Devices />
    </Group>
  )
}

function Devices() {
  const { toast, confirm } = useFeedback()
  const [devices, setDevices] = useState<SignedInDevice[]>()
  const [error, setError] = useState<string>()
  // Bumped to load the list again.
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let current = true
    listDevices().then(
      (list) => {
        if (!current) return
        setDevices(list)
        setError(undefined)
      },
      (err: unknown) => current && setError(failureMessage(err)),
    )
    return () => {
      current = false
    }
  }, [version])

  const remove = async (device: SignedInDevice) => {
    const ok = await confirm({
      title: `Remove ${device.name}?`,
      body: 'It is signed out and has to sign in again to sync. Its own copy of the library stays on it.',
      confirmLabel: 'Remove',
      danger: true,
    })
    if (!ok) return
    try {
      await removeDevice(device.id)
      setVersion((v) => v + 1)
    } catch (err) {
      toast(failureMessage(err), { tone: 'error' })
    }
  }

  return (
    <div className="flex flex-col border-t border-line pt-4">
      <span className="pb-1 text-small font-medium">Signed in</span>
      {error && <p className="py-2 text-small text-muted">{error}</p>}
      {devices?.map((device) => (
        <div key={device.id} className="flex items-center gap-3 border-t border-line py-3 first-of-type:border-t-0">
          <div className="flex min-w-0 flex-1 flex-col gap-px">
            <span className="flex items-center gap-2 truncate text-body">
              {device.name}
              {device.current && <Chip tone="sage">This browser</Chip>}
            </span>
            <span className="text-chip text-muted">Last used {timeAgo(device.lastUsedAt)}</span>
          </div>
          {!device.current && (
            <Button size="sm" variant="ghost" onClick={() => void remove(device)}>
              Remove
            </Button>
          )}
        </div>
      ))}
    </div>
  )
}
