import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Bell, ChevronRight, Download, HardDriveDownload, Plus, Smartphone, Sparkles, Trash2, Upload, Volume2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Chip, Dot, PageHeader, Section } from '@/components/ui/primitives'
import { Field, Input, Segmented, Select, Switch } from '@/components/ui/form'
import { useFeedback } from '@/components/ui/feedback'
import { db, updateSettings } from '@/db/db'
import { installStarterPack } from '@/db/seed'
import type { EndSound, ThemePref } from '@/db/types'
import { useCards, useDecks, useSettings, useTopics } from '@/data/hooks'
import { downloadFile, exportBackup, resetAllData, restoreBackup } from '@/data/io'
import { DeckDialog } from '@/features/flashcards/DeckDialog'
import { ImportCsvDialog } from '@/features/flashcards/ImportCsvDialog'
import { describeGoals } from '@/lib/goals'
import { isStandalone, useInstallPrompt } from '@/lib/install'
import { notificationPermission, requestNotificationPermission, showNotification } from '@/lib/notify'
import { END_SOUND_LABEL, playEndSound, unlockAudio } from '@/lib/sound'
import { germanVoices, onVoicesChanged, speak, speechSupported } from '@/lib/speech'
import { dateKey, formatHM } from '@/lib/time'
import { count } from '@/lib/text'
import { TopicDialog } from './TopicDialog'

function Group({ title, description, children, action }: { title: string; description?: string; children: ReactNode; action?: ReactNode }) {
  return (
    <Section className="flex flex-col gap-4 px-6 py-5">
      {/* The actions wrap below the description on narrow cards, still right-aligned. */}
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="flex min-w-0 flex-[999_1_240px] flex-col gap-1">
          <h2 className="text-section font-semibold">{title}</h2>
          {description && <p className="text-small text-muted">{description}</p>}
        </div>
        {action && <div className="flex min-w-0 flex-[1_1_auto] justify-end">{action}</div>}
      </div>
      {children}
    </Section>
  )
}

/* A list row that opens a dialog: an inset hover surface that leaves the dividers aligned, and a chevron. */
const rowClass =
  'group relative isolate flex items-center gap-3 border-t border-line py-3 text-left first:border-t-0 before:absolute before:-inset-x-3 before:inset-y-1 before:-z-10 before:rounded-row before:bg-field before:opacity-0 before:transition-opacity hover:before:opacity-100'

function RowChevron() {
  return <ChevronRight size={16} strokeWidth={1.8} aria-hidden className="-mr-1 shrink-0 text-muted transition-colors group-hover:text-ink" />
}

function useVoices() {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>(() => germanVoices())
  useEffect(() => onVoicesChanged(() => setVoices(germanVoices())), [])
  return voices
}

function TopicsGroup() {
  const topics = useTopics(true)
  const [dialog, setDialog] = useState<{ id: string | null } | null>(null)
  return (
    <Group
      title="Topics and daily goals"
      description="Each topic has a colour and a goal in minutes, which can differ by weekday."
      action={
        <Button size="sm" icon={<Plus size={15} strokeWidth={1.8} />} onClick={() => setDialog({ id: null })}>
          Add topic
        </Button>
      }
    >
      <div className="flex flex-col">
        {topics.map((t) => (
          <button key={t.id} type="button" onClick={() => setDialog({ id: t.id })} className={rowClass}>
            <Dot color={t.color} />
            <span className="flex-1 text-body font-medium">{t.name}</span>
            {t.archived && <Chip tone="soft">Archived</Chip>}
            <span className="text-small text-muted tabular-nums">{describeGoals(t.goalMinutes, formatHM)}</span>
            <RowChevron />
          </button>
        ))}
        {topics.length === 0 && <p className="text-small text-muted">No topics yet.</p>}
      </div>
      <TopicDialog open={!!dialog} topicId={dialog?.id ?? null} onClose={() => setDialog(null)} />
    </Group>
  )
}

function DecksGroup() {
  const decks = useDecks()
  const cards = useCards()
  const topics = useTopics(true)
  const [dialog, setDialog] = useState<{ id: string | null } | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [installing, setInstalling] = useState(false)
  const { toast } = useFeedback()

  const addStarter = async () => {
    setInstalling(true)
    try {
      const result = await installStarterPack(db)
      toast(result.cards ? `Added ${count(result.cards, 'starter card')}` : 'All starter cards are already here')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not add the starter decks', { tone: 'error' })
    } finally {
      setInstalling(false)
    }
  }

  return (
    <Group
      title="Decks"
      description="Daily limits and practice directions are set per deck."
      action={
        <div className="flex flex-wrap justify-end gap-2">
          <Button size="sm" variant="ghost" disabled={installing} icon={<Sparkles size={15} strokeWidth={1.8} />} onClick={() => void addStarter()} title="My Words, German Top Words and Everyday Sentences. Only missing cards are added.">
            Starter decks
          </Button>
          <Button size="sm" variant="ghost" icon={<Upload size={15} strokeWidth={1.8} />} onClick={() => setImportOpen(true)}>
            Import
          </Button>
          <Button size="sm" icon={<Plus size={15} strokeWidth={1.8} />} onClick={() => setDialog({ id: null })}>
            New deck
          </Button>
        </div>
      }
    >
      <div className="flex flex-col">
        {decks.map((d) => {
          const topic = topics.find((t) => t.id === d.topicId)
          const cardCount = cards?.filter((c) => c.deckId === d.id).length ?? 0
          return (
            <button key={d.id} type="button" onClick={() => setDialog({ id: d.id })} className={rowClass}>
              <Dot color={topic?.color} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-body font-medium">{d.name}</span>
                <span className="text-chip text-muted">
                  {count(cardCount, 'card')} · {d.newPerDay} new and {d.reviewsPerDay} reviews a day
                </span>
              </span>
              <span className="hidden text-small text-muted sm:block">{topic ? `Counts toward ${topic.name}` : 'No topic'}</span>
              <RowChevron />
            </button>
          )
        })}
        {decks.length === 0 && <p className="text-small text-muted">No decks yet.</p>}
      </div>
      <DeckDialog open={!!dialog} deckId={dialog?.id ?? null} onClose={() => setDialog(null)} />
      <ImportCsvDialog open={importOpen} onClose={() => setImportOpen(false)} />
    </Group>
  )
}

function ReminderTimes({ times, onChange }: { times: string[]; onChange: (t: string[]) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {times.map((t, i) => (
        <div key={i} className="flex items-center gap-1">
          <Input
            type="time"
            aria-label={`Reminder ${i + 1}`}
            value={t}
            onChange={(e) => onChange(times.map((x, j) => (j === i ? e.target.value || x : x)).sort())}
            className="w-30"
          />
          {times.length > 1 && (
            <Button variant="ghost" size="sm" iconOnly aria-label="Remove reminder" onClick={() => onChange(times.filter((_, j) => j !== i))}>
              <Trash2 size={15} strokeWidth={1.8} />
            </Button>
          )}
        </div>
      ))}
      {times.length < 4 && (
        <Button variant="ghost" size="sm" icon={<Plus size={15} strokeWidth={1.8} />} onClick={() => onChange([...times, '20:00'].sort())}>
          Add time
        </Button>
      )}
    </div>
  )
}

function StorageInfo() {
  const [estimate, setEstimate] = useState<{ usage: number; persisted: boolean } | null>(null)
  const { toast } = useFeedback()
  useEffect(() => {
    void (async () => {
      if (!navigator.storage?.estimate) return
      const e = await navigator.storage.estimate()
      const persisted = (await navigator.storage.persisted?.()) ?? false
      setEstimate({ usage: e.usage ?? 0, persisted })
    })()
  }, [])
  if (!estimate) return null
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-row bg-field px-4 py-3 text-small">
      <span className="text-ink-2">
        Using {(estimate.usage / 1024 / 1024).toFixed(1)} MB on this device.{' '}
        {estimate.persisted ? 'Storage is protected from automatic clean-up.' : 'The browser may clear it when space runs low.'}
      </span>
      {!estimate.persisted && navigator.storage?.persist && (
        <Button
          size="sm"
          variant="outline"
          onClick={async () => {
            const ok = await navigator.storage.persist()
            setEstimate((e) => (e ? { ...e, persisted: ok } : e))
            toast(ok ? 'Storage is now protected' : 'The browser declined. Installing the app usually helps.')
          }}
        >
          Protect storage
        </Button>
      )}
    </div>
  )
}

export default function SettingsPage() {
  const settings = useSettings()
  const voices = useVoices()
  const { toast, confirm } = useFeedback()
  const { canInstall, install } = useInstallPrompt()
  const [permission, setPermission] = useState(notificationPermission())
  const restoreInput = useRef<HTMLInputElement>(null)

  const exportData = async () => {
    const backup = await exportBackup()
    downloadFile(`lernzeit-backup-${dateKey()}.json`, JSON.stringify(backup))
    toast(`Backup saved: ${count(backup.cards.length, 'card')}, ${count(backup.sessions.length, 'session')}, ${count(backup.tasks.length, 'task')}`)
  }

  const restoreData = async (file: File) => {
    let parsed: unknown
    try {
      parsed = JSON.parse(await file.text())
    } catch {
      toast('That file is not valid JSON', { tone: 'error' })
      return
    }
    const ok = await confirm({
      title: 'Restore this backup?',
      body: 'Everything currently in Lernzeit is replaced by the backup. Export a backup first if you want to keep it.',
      confirmLabel: 'Replace my data',
      danger: true,
    })
    if (!ok) return
    try {
      const result = await restoreBackup(parsed)
      toast(`Restored ${count(result.cards, 'card')}, ${count(result.sessions, 'session')} and ${count(result.tasks, 'task')}`)
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Restore failed', { tone: 'error' })
    }
  }

  const reset = async () => {
    const ok = await confirm({
      title: 'Delete all data?',
      body: 'Cards, images, history and tasks are removed from this device. This cannot be undone.',
      confirmLabel: 'Delete everything',
      danger: true,
    })
    if (!ok) return
    await resetAllData()
    window.location.assign('/')
  }

  const toggleReminders = async (on: boolean) => {
    if (on) {
      const result = await requestNotificationPermission()
      setPermission(result)
      if (result !== 'granted') {
        toast(result === 'unsupported' ? 'This browser does not support notifications' : 'Notifications are blocked for this site', { tone: 'error' })
        return
      }
    }
    await updateSettings({ remindersEnabled: on })
  }

  return (
    <>
      <PageHeader title="Settings" subtitle="Goals, decks, timer, audio and your data. Everything stays on this device." />

      <div className="grid items-start gap-5 xl:grid-cols-2">
        <div className="flex flex-col gap-5">
          <TopicsGroup />
          <DecksGroup />

          <Group title="Focus timer">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Pomodoro focus (minutes)" htmlFor="pomo-focus">
                <Input id="pomo-focus" type="number" inputMode="numeric" min={5} max={120} value={settings.pomodoroFocus} onChange={(e) => void updateSettings({ pomodoroFocus: Math.max(1, Math.min(180, Number(e.target.value) || 25)) })} />
              </Field>
              <Field label="Pomodoro break (minutes)" htmlFor="pomo-break">
                <Input id="pomo-break" type="number" inputMode="numeric" min={1} max={60} value={settings.pomodoroBreak} onChange={(e) => void updateSettings({ pomodoroBreak: Math.max(1, Math.min(60, Number(e.target.value) || 5)) })} />
              </Field>
              <Field label="Sound at the end" htmlFor="end-sound">
                <div className="flex gap-2">
                  <Select id="end-sound" className="flex-1" value={settings.endSound} onChange={(e) => void updateSettings({ endSound: e.target.value as EndSound })}>
                    {(Object.keys(END_SOUND_LABEL) as EndSound[]).map((s) => (
                      <option key={s} value={s}>
                        {END_SOUND_LABEL[s]}
                      </option>
                    ))}
                  </Select>
                  <Button
                    variant="outline"
                    iconOnly
                    aria-label="Play sound"
                    disabled={settings.endSound === 'none'}
                    onClick={() => {
                      unlockAudio()
                      playEndSound(settings.endSound)
                    }}
                  >
                    <Volume2 size={17} strokeWidth={1.8} />
                  </Button>
                </div>
              </Field>
            </div>
            <Switch
              label="Count flashcard reviews as study time"
              description="Review time goes to the deck's topic, for example German."
              checked={settings.countReviewTime}
              onChange={(v) => void updateSettings({ countReviewTime: v })}
            />
          </Group>
        </div>

        <div className="flex flex-col gap-5">
          <Group title="Flashcards and audio">
            <Field label="German voice" htmlFor="voice" hint={speechSupported() ? (voices.length ? 'Voices come from your browser and system.' : 'No German voice found. Install one in your system settings.') : 'Speech is not supported in this browser.'}>
              <div className="flex gap-2">
                <Select id="voice" className="flex-1" value={settings.voiceURI ?? ''} onChange={(e) => void updateSettings({ voiceURI: e.target.value || undefined })}>
                  <option value="">Automatic</option>
                  {voices.map((v) => (
                    <option key={v.voiceURI} value={v.voiceURI}>
                      {v.name} ({v.lang})
                    </option>
                  ))}
                </Select>
                <Button variant="outline" iconOnly aria-label="Test voice" onClick={() => speak('Der Hund spielt im Garten.', { voiceURI: settings.voiceURI, rate: settings.speechRate })}>
                  <Volume2 size={17} strokeWidth={1.8} />
                </Button>
              </div>
            </Field>
            <Field label={`Speaking speed · ${settings.speechRate.toFixed(2)}×`} htmlFor="rate">
              <input
                id="rate"
                type="range"
                min={0.6}
                max={1.3}
                step={0.05}
                value={settings.speechRate}
                onChange={(e) => void updateSettings({ speechRate: Number(e.target.value) })}
                className="accent-button-dark"
              />
            </Field>
            <Switch label="Play audio when the answer is shown" checked={settings.autoPlayAudio} onChange={(v) => void updateSettings({ autoPlayAudio: v })} />
            <Switch label="Typing mode" description="Type each answer. Small slips such as ue for ü are accepted." checked={settings.typingMode} onChange={(v) => void updateSettings({ typingMode: v })} />
            <Switch label="Listening mode" description="Hear the German and type what you heard." checked={settings.listeningMode} onChange={(v) => void updateSettings({ listeningMode: v })} />
          </Group>

          <Group title="Appearance">
            <Segmented<ThemePref>
              label="Theme"
              value={settings.theme}
              onChange={(v) => void updateSettings({ theme: v })}
              options={[
                { value: 'light', label: 'Light' },
                { value: 'dark', label: 'Dark' },
                { value: 'system', label: 'System' },
              ]}
              className="self-start"
            />
          </Group>

          <Group title="Reminders" description="A notification if a goal is still open at these times, for example “You still have 1:00 h of German today”.">
            <Switch
              label="Goal reminders"
              description={
                permission === 'denied'
                  ? 'Notifications are blocked. Allow them in the browser site settings.'
                  : permission === 'unsupported'
                    ? 'This browser does not support notifications.'
                    : 'Works while Lernzeit is open or installed and running in the background.'
              }
              checked={settings.remindersEnabled && permission === 'granted'}
              onChange={(v) => void toggleReminders(v)}
              disabled={permission === 'unsupported'}
            />
            {settings.remindersEnabled && permission === 'granted' && (
              <div className="flex flex-col gap-3">
                <ReminderTimes times={settings.reminderTimes} onChange={(t) => void updateSettings({ reminderTimes: t })} />
                <Button size="sm" variant="ghost" className="self-start" icon={<Bell size={15} strokeWidth={1.8} />} onClick={() => void showNotification('Lernzeit', 'Reminders are on. This is how they look.', 'lernzeit-test')}>
                  Send a test
                </Button>
              </div>
            )}
          </Group>

          <Group title="Your data" description="Lernzeit works offline and keeps everything in this browser. Back it up now and then.">
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" icon={<Download size={15} strokeWidth={1.8} />} onClick={() => void exportData()}>
                Export backup
              </Button>
              <Button variant="outline" icon={<HardDriveDownload size={15} strokeWidth={1.8} />} onClick={() => restoreInput.current?.click()}>
                Restore backup
              </Button>
              <input
                ref={restoreInput}
                type="file"
                accept="application/json,.json"
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) void restoreData(file)
                  e.target.value = ''
                }}
              />
              {canInstall && !isStandalone() && (
                <Button variant="soft" icon={<Smartphone size={15} strokeWidth={1.8} />} onClick={() => void install()}>
                  Install app
                </Button>
              )}
            </div>
            <StorageInfo />
            <div className="flex items-center justify-between gap-3 border-t border-line pt-4">
              <span className="text-small text-muted">Remove everything and start fresh.</span>
              <Button variant="danger" size="sm" icon={<Trash2 size={15} strokeWidth={1.8} />} onClick={() => void reset()}>
                Delete all data
              </Button>
            </div>
          </Group>
        </div>
      </div>
    </>
  )
}
