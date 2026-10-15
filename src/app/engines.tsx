import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, DEFAULT_SETTINGS, KV_KEYS } from '@/db/db'
import type { Settings } from '@/db/types'
import { storage } from '@/lib/browser'
import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/form'
import { useFeedback } from '@/components/ui/feedback'
import { handleRequest } from '@/bridge/actions'
import { browserKind, useBridgeConfig } from '@/bridge/config'
import { connectBridge } from '@/bridge/connection'
import { setBridgeStatus } from '@/bridge/status'
import { useActiveTimer, usePendingNote, useSettings, useTopics } from '@/data/hooks'
import { useTodayProgress } from '@/data/progress'
import { completePhase, resolvePendingNote } from '@/data/timer'
import { showNotification } from '@/lib/notify'
import { playEndSound } from '@/lib/sound'
import { formatHM, formatMinutesShort, formatTimer, parseTimeOfDay } from '@/lib/time'
import { elapsedMs, isPaused, isPhaseComplete, phaseEndAt, remainingMs } from '@/lib/timer'

/**
 * Watches the running timer. Phases end by timestamp, so this also catches up
 * after the tab was closed or the phone slept.
 */
export function TimerEngine() {
  const timer = useActiveTimer()
  const settings = useSettings()
  const topics = useTopics(true)
  const busy = useRef(false)

  useEffect(() => {
    if (!timer) return
    const topicName = topics.find((t) => t.id === timer.topicId)?.name ?? 'Study'

    const check = async () => {
      const now = Date.now()
      if (busy.current || !isPhaseComplete(timer, now)) return
      busy.current = true
      try {
        const outcome = await completePhase({ runId: timer.runId, cycle: timer.cycle, phase: timer.phase })
        if (!outcome) return
        // Only make noise if the phase ended just now, not hours ago.
        const fresh = now - (phaseEndAt(timer) ?? now) < 90_000
        if (fresh) playEndSound(settings.endSound)
        if (fresh && document.visibilityState === 'hidden') {
          if (outcome.kind === 'break-done') void showNotification('Break is over', `Ready for the next ${topicName} round.`, 'lernzeit-timer')
          else {
            const minutes = outcome.saved?.minutes ?? 0
            void showNotification('Time is up', `${formatMinutesShort(minutes)} of ${topicName} saved.`, 'lernzeit-timer')
          }
        }
      } finally {
        busy.current = false
      }
    }

    void check()
    const interval = setInterval(check, 1000)
    const end = phaseEndAt(timer)
    const exact = end && !isPaused(timer) ? setTimeout(check, Math.max(0, end - Date.now() + 30)) : undefined
    document.addEventListener('visibilitychange', check)
    return () => {
      clearInterval(interval)
      if (exact) clearTimeout(exact)
      document.removeEventListener('visibilitychange', check)
    }
  }, [timer, settings.endSound, topics])

  // Show the countdown in the browser tab title.
  useEffect(() => {
    if (!timer) {
      document.title = 'Lernzeit'
      return
    }
    const topicName = topics.find((t) => t.id === timer.topicId)?.name ?? ''
    const update = () => {
      const now = Date.now()
      const left = remainingMs(timer, now)
      const shown = formatTimer(left ?? elapsedMs(timer, now))
      const label = timer.phase === 'break' ? 'Break' : topicName
      document.title = `${isPaused(timer) ? 'Paused · ' : ''}${shown} · ${label} — Lernzeit`
    }
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [timer, topics])

  return null
}

/** "You still have 1:00 h of German today" at the times set in Settings. */
export function ReminderEngine() {
  const settings = useSettings()
  const progress = useTodayProgress()
  const fired = useLiveQuery(() => db.kv.get(KV_KEYS.remindersFired), [])
  const latest = useRef(progress)
  useEffect(() => {
    latest.current = progress
  })

  useEffect(() => {
    if (!settings.remindersEnabled || !settings.reminderTimes.length) return
    const check = async () => {
      const p = latest.current
      const now = new Date()
      const minutesNow = now.getHours() * 60 + now.getMinutes()
      const state = (fired?.value as { day: string; times: string[] } | undefined) ?? { day: p.today, times: [] }
      const done = state.day === p.today ? state.times : []
      const due = settings.reminderTimes.filter((t) => {
        const at = parseTimeOfDay(t)
        return !done.includes(t) && minutesNow >= at && minutesNow - at < 180
      })
      if (!due.length) return
      await db.kv.put({ key: KV_KEYS.remindersFired, value: { day: p.today, times: [...done, ...due] } })
      const open = p.topics.filter((r) => r.goal > 0 && r.left > 0)
      if (!open.length) return
      const body = open
        .slice(0, 3)
        .map((r) => `${formatHM(r.left)} h of ${r.topic.name}`)
        .join(', ')
      void showNotification('Lernzeit', `You still have ${body} today.`, 'lernzeit-reminder')
    }
    void check()
    const id = setInterval(check, 30_000)
    return () => clearInterval(id)
  }, [settings.remindersEnabled, settings.reminderTimes, fired])

  return null
}

/** Keeps this tab connected to the Lernzeit MCP server while Settings → AI connection is on. */
export function BridgeEngine() {
  const { enabled, name, token, port } = useBridgeConfig()

  useEffect(() => {
    if (!enabled || !token.trim()) {
      setBridgeStatus(enabled ? 'no_token' : 'off')
      return
    }
    setBridgeStatus('waiting')
    let disconnect: (() => void) | undefined
    // The settings fields save on every key, so reconnect only once typing pauses.
    const start = setTimeout(() => {
      const kind = browserKind()
      disconnect = connectBridge({ port, token: token.trim(), name: name.trim() || kind, kind, onRequest: handleRequest, onStatus: setBridgeStatus })
    }, 400)
    return () => {
      clearTimeout(start)
      disconnect?.()
    }
  }, [enabled, name, token, port])

  return null
}

/** Applies the theme preference and remembers it for the pre-paint script. */
export function ThemeSync() {
  // null while loading: keep the theme the pre-paint script chose until the real setting arrives.
  const row = useLiveQuery(() => db.kv.get(KV_KEYS.settings), [], null)
  const theme = row === null ? null : ((row?.value as Partial<Settings> | undefined)?.theme ?? DEFAULT_SETTINGS.theme)
  useEffect(() => {
    if (!theme) return
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const resolved = theme === 'system' ? (media.matches ? 'dark' : 'light') : theme
      document.documentElement.dataset.theme = resolved
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolved === 'dark' ? '#141816' : '#F7F7F4')
    }
    apply()
    storage.set('lernzeit-theme', theme)
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [theme])
  return null
}

/** After a session: an optional one-line note, "What did you learn?". */
export function SessionNoteDialog() {
  const pending = usePendingNote()
  const topics = useTopics(true)
  const { toast } = useFeedback()
  const [note, setNote] = useState('')
  const [shownFor, setShownFor] = useState<number | null>(null)

  const topic = topics.find((t) => t.id === pending?.topicId)
  const summary = pending ? `${formatMinutesShort(pending.minutes)} of ${topic?.name ?? 'study'}` : ''

  // A note written during the session needs no second prompt.
  useEffect(() => {
    if (pending && pending.note) {
      void resolvePendingNote(null)
      toast(`Session saved · ${summary}`)
    }
  }, [pending, summary, toast])

  if (pending && !pending.note && shownFor !== pending.savedAt) {
    setShownFor(pending.savedAt)
    setNote('')
  }

  const open = !!pending && !pending.note
  return (
    <Dialog
      open={open}
      onClose={() => void resolvePendingNote(null)}
      title="Session saved"
      description={`${summary} added to today.`}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={() => void resolvePendingNote(null)}>
            Skip
          </Button>
          <Button variant="primary" type="submit" form="session-note-form">
            Save note
          </Button>
        </>
      }
    >
      <form
        id="session-note-form"
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          void resolvePendingNote(note)
        }}
      >
        <label htmlFor="session-note" className="text-body font-semibold">
          What did you learn?
        </label>
        <Input id="session-note" autoFocus value={note} onChange={(e) => setNote(e.target.value)} placeholder="One line about this session" maxLength={200} />
      </form>
    </Dialog>
  )
}
