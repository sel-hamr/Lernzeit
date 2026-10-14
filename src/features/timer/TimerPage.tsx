import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import clsx from 'clsx'
import { Pause, Play, SkipForward, Square } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Dot, PageHeader, Section } from '@/components/ui/primitives'
import { SelectRow, Textarea } from '@/components/ui/form'
import { useFeedback } from '@/components/ui/feedback'
import { StationClock } from '@/components/StationClock'
import { updateSettings } from '@/db/db'
import type { ActiveTimer, EndSound, TimerMode, Topic } from '@/db/types'
import { useSettings, useTopics } from '@/data/hooks'
import { useTodayProgress } from '@/data/progress'
import { discardTimer, patchTimer, pauseTimer, resumeTimer, skipBreak, stopTimer } from '@/data/timer'
import { END_SOUND_LABEL, playEndSound, unlockAudio } from '@/lib/sound'
import { formatClock, formatHM, formatMinutesShort, formatTimer, MINUTE } from '@/lib/time'
import { elapsedMs, isAwaitingFocus, isPaused, phaseLengthMs, remainingMs } from '@/lib/timer'
import { defaultCountdown, useStartTimer } from './useStartTimer'

const MODE_LABEL: Record<TimerMode, string> = { countdown: 'Countdown', pomodoro: 'Pomodoro', free: 'Free' }
const PRESETS = [15, 20, 25, 30, 45, 60, 90, 120, 180]
const POMODORO_PRESETS: [number, number][] = [
  [25, 5],
  [30, 5],
  [45, 10],
  [50, 10],
  [60, 15],
]

function StatusChip({ timer }: { timer: ActiveTimer | null | undefined }) {
  if (!timer) return null
  const awaiting = isAwaitingFocus(timer)
  const state = timer.phase === 'break' ? 'Break' : awaiting ? 'Ready' : isPaused(timer) ? 'Paused' : 'Running'
  const tone =
    state === 'Running'
      ? 'bg-sage text-sage-ink'
      : state === 'Break'
        ? 'bg-(--t-sand-soft) text-(--t-sand-ink)'
        : 'bg-neutral-chip text-neutral-ink'
  return (
    <span className={clsx('flex h-8 items-center gap-2 rounded-full px-3.5 text-small font-medium', tone)}>
      <span className={clsx('size-2 rounded-full', state === 'Running' ? 'animate-pulse bg-sage-dot' : state === 'Break' ? 'bg-(--t-sand-dot)' : 'bg-muted')} />
      {state}
    </span>
  )
}

/** Debounced draft note stored on the running timer. */
function useDraftNote(timer: ActiveTimer | null | undefined) {
  const [note, setNote] = useState(timer?.note ?? '')
  const [forRun, setForRun] = useState(timer?.runId)
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  if (timer?.runId !== forRun) {
    setForRun(timer?.runId)
    setNote(timer?.note ?? '')
  }
  const change = (value: string) => {
    setNote(value)
    clearTimeout(saveTimeout.current)
    saveTimeout.current = setTimeout(() => void patchTimer({ note: value }), 400)
  }
  const flush = async () => {
    clearTimeout(saveTimeout.current)
    if (timer && note !== timer.note) await patchTimer({ note })
  }
  useEffect(() => () => clearTimeout(saveTimeout.current), [])
  return { note, change, flush }
}

export function TimerPage() {
  const progress = useTodayProgress()
  const { timer, now } = progress
  const topics = useTopics()
  const settings = useSettings()
  const startTimer = useStartTimer()
  const { toast } = useFeedback()
  const [params] = useSearchParams()

  // Setup used before a timer is running.
  const firstOpen = progress.topics.find((r) => r.goal > 0 && !r.hit)?.topic ?? topics[0]
  const [pickedTopic, setPickedTopic] = useState<string | undefined>(params.get('topic') ?? undefined)
  const [pickedMode, setPickedMode] = useState<TimerMode | undefined>(undefined)
  const [pickedMinutes, setPickedMinutes] = useState<number | undefined>(undefined)

  const topicId = timer?.topicId ?? (pickedTopic && topics.some((t) => t.id === pickedTopic) ? pickedTopic : firstOpen?.id)
  const topic: Topic | undefined = topics.find((t) => t.id === topicId)
  const row = progress.topics.find((r) => r.topic.id === topicId)
  const mode: TimerMode = timer?.mode ?? pickedMode ?? settings.defaultTimerMode
  const leftToday = row?.left ?? 0
  const setupMinutes = pickedMinutes ?? defaultCountdown(leftToday)

  const draft = useDraftNote(timer)

  const isBreak = timer?.phase === 'break'
  const awaiting = !!timer && isAwaitingFocus(timer)
  const paused = !!timer && isPaused(timer)
  const elapsed = timer ? elapsedMs(timer, now) : 0
  const remaining = timer ? remainingMs(timer, now) : mode === 'free' ? undefined : (mode === 'pomodoro' ? settings.pomodoroFocus : setupMinutes) * MINUTE
  const lengthMinutes = timer ? (phaseLengthMs(timer) ?? 0) / MINUTE : mode === 'pomodoro' ? settings.pomodoroFocus : setupMinutes

  const readout = remaining !== undefined ? formatTimer(remaining) : formatTimer(elapsed)
  let caption: string
  if (!timer) caption = mode === 'free' ? 'counts up until you stop' : `${formatMinutesShort(lengthMinutes)} session`
  else if (isBreak) caption = `left in this ${formatMinutesShort(lengthMinutes)} break`
  else if (awaiting) caption = `Break over · round ${timer.cycle} is ready`
  else if (timer.mode === 'free') caption = 'studied in this session'
  else caption = `left in this ${formatMinutesShort(lengthMinutes)} session`

  // Time left on the topic once this session is over.
  const afterSession = useMemo(() => {
    if (!row || row.goal === 0) return null
    const sessionLeft = isBreak || !timer ? (timer ? 0 : (mode === 'free' ? 0 : lengthMinutes)) : (remaining ?? 0) / MINUTE
    return Math.max(0, row.left - Math.ceil(sessionLeft - 1e-6))
  }, [row, isBreak, timer, mode, lengthMinutes, remaining])

  const lengthOptions = useMemo(() => {
    const set = new Set(PRESETS)
    if (leftToday >= 5) set.add(Math.round(leftToday))
    set.add(timer?.targetMinutes ?? setupMinutes)
    return [...set].sort((a, b) => a - b)
  }, [leftToday, timer?.targetMinutes, setupMinutes])

  const start = () => {
    if (!topicId) return
    void startTimer(topicId, { leftMinutes: leftToday, mode, minutes: setupMinutes, stay: true })
  }

  const stop = async () => {
    await draft.flush()
    if (isBreak) {
      await discardTimer()
      toast('Pomodoro finished')
      return
    }
    const saved = await stopTimer()
    if (!saved) toast('Under a minute, so nothing was saved')
  }

  // Space starts or pauses, like a media player.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || (e.target as HTMLElement).closest('input, textarea, select, button, [contenteditable="true"]')) return
      e.preventDefault()
      unlockAudio()
      if (!timer) start()
      else if (isBreak) return
      else if (paused) void resumeTimer()
      else void pauseTimer()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const subtitle = timer
    ? [topic?.name, MODE_LABEL[timer.mode].toLowerCase(), timer.mode === 'pomodoro' ? `round ${timer.cycle}` : null, `started ${formatClock(timer.firstStartedAt)}`]
        .filter(Boolean)
        .join(' · ')
    : 'Pick a topic and press Start. The time goes to that topic when you stop.'

  // Wait for the stored timer so a running session never flashes as idle.
  if (timer === undefined) return <div className="h-140" aria-busy="true" />

  const clockLabel = timer
    ? `${readout} ${remaining !== undefined ? 'left' : 'studied'}${paused ? ', paused' : ''}`
    : `Ready: ${readout}`

  return (
    <>
      <PageHeader title="Focus timer" subtitle={subtitle} actions={<StatusChip timer={timer} />} />

      <div className="flex flex-wrap items-start gap-5">
        <Section className="flex min-w-0 flex-[3_1_420px] flex-col items-center gap-5.5 bg-soft px-6 pt-9 pb-7">
          <StationClock
            elapsedMs={elapsed}
            remainingMs={timer ? remaining : mode === 'free' ? undefined : remaining}
            tone={isBreak ? 'break' : 'focus'}
            label={clockLabel}
          />
          <div className="flex flex-col items-center gap-1.5 text-center">
            <div className={clsx('text-timer font-normal tabular-nums transition-opacity', paused && !awaiting && 'opacity-50')} aria-live="off">
              {readout}
            </div>
            <div className="text-body text-muted">{caption}</div>
          </div>
          <div className="flex flex-wrap justify-center gap-2.5">
            {!timer && (
              <Button variant="primary" size="lg" className="min-w-40" onClick={start} disabled={!topicId} icon={<Play size={13} fill="currentColor" strokeWidth={0} />}>
                Start
              </Button>
            )}
            {timer && isBreak && (
              <>
                <Button variant="outline" size="lg" onClick={() => void skipBreak()} icon={<SkipForward size={15} strokeWidth={1.8} />}>
                  Skip break
                </Button>
                <Button variant="primary" size="lg" onClick={() => void stop()} icon={<Square size={11} fill="currentColor" strokeWidth={0} />}>
                  End pomodoro
                </Button>
              </>
            )}
            {timer && awaiting && (
              <>
                <Button variant="outline" size="lg" onClick={() => void discardTimer()}>
                  End pomodoro
                </Button>
                <Button variant="primary" size="lg" onClick={() => void resumeTimer()} icon={<Play size={13} fill="currentColor" strokeWidth={0} />}>
                  Start round {timer.cycle}
                </Button>
              </>
            )}
            {timer && !isBreak && !awaiting && (
              <>
                <Button
                  variant="outline"
                  size="lg"
                  onClick={() => void (paused ? resumeTimer() : pauseTimer())}
                  icon={paused ? <Play size={13} fill="currentColor" strokeWidth={0} /> : <Pause size={14} fill="currentColor" strokeWidth={0} />}
                >
                  {paused ? 'Resume' : 'Pause'}
                </Button>
                <Button variant="primary" size="lg" onClick={() => void stop()} icon={<Square size={11} fill="currentColor" strokeWidth={0} />}>
                  Stop and save
                </Button>
              </>
            )}
          </div>
        </Section>

        <div className="flex min-w-0 flex-[2_1_300px] flex-col gap-5">
          <section className="flex flex-col overflow-hidden rounded-section border border-line bg-main shadow-popup">
            <div className="flex flex-col gap-1 px-5.5 pt-5.5 pb-3.5">
              <h2 className="text-[19px] font-semibold tracking-[-0.01em]">Session</h2>
              <div className="text-small text-muted">Time goes to the topic when you stop.</div>
            </div>
            <div className="flex flex-col gap-2 px-4 pb-4">
              <SelectRow
                label="Topic"
                value={topicId ?? ''}
                onChange={(v) => (timer ? void patchTimer({ topicId: v }) : (setPickedTopic(v), setPickedMinutes(undefined)))}
                display={
                  topic ? (
                    <>
                      <Dot color={topic.color} /> {topic.name}
                    </>
                  ) : (
                    'Add a topic in Settings'
                  )
                }
              >
                {topics.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </SelectRow>
              <SelectRow
                label="Mode"
                value={mode}
                disabled={isBreak || awaiting}
                onChange={(v) => {
                  const m = v as TimerMode
                  if (timer) void patchTimer({ mode: m, targetMinutes: m === 'countdown' ? setupMinutes : undefined })
                  else setPickedMode(m)
                  void updateSettings({ defaultTimerMode: m })
                }}
                display={MODE_LABEL[mode]}
              >
                <option value="countdown">Countdown</option>
                <option value="pomodoro">Pomodoro</option>
                <option value="free">Free (count up)</option>
              </SelectRow>
              {mode === 'pomodoro' ? (
                <SelectRow
                  label="Length"
                  value={`${timer?.targetMinutes ?? settings.pomodoroFocus}/${timer?.breakMinutes ?? settings.pomodoroBreak}`}
                  disabled={isBreak}
                  onChange={(v) => {
                    const [focus, rest] = v.split('/').map(Number)
                    void updateSettings({ pomodoroFocus: focus, pomodoroBreak: rest })
                    if (timer) void patchTimer({ targetMinutes: focus, breakMinutes: rest })
                  }}
                  display={`${timer?.targetMinutes ?? settings.pomodoroFocus} min focus · ${timer?.breakMinutes ?? settings.pomodoroBreak} min break`}
                >
                  {[...new Map([[`${settings.pomodoroFocus}/${settings.pomodoroBreak}`, [settings.pomodoroFocus, settings.pomodoroBreak]], ...POMODORO_PRESETS.map((p) => [`${p[0]}/${p[1]}`, p] as const)]).values()].map(([f, b]) => (
                    <option key={`${f}/${b}`} value={`${f}/${b}`}>
                      {f} min focus, {b} min break
                    </option>
                  ))}
                </SelectRow>
              ) : mode === 'countdown' ? (
                <SelectRow
                  label="Length"
                  value={String(timer?.targetMinutes ?? setupMinutes)}
                  onChange={(v) => (timer ? void patchTimer({ targetMinutes: Number(v) }) : setPickedMinutes(Number(v)))}
                  display={formatMinutesShort(timer?.targetMinutes ?? setupMinutes)}
                >
                  {lengthOptions.map((m) => (
                    <option key={m} value={m}>
                      {formatMinutesShort(m)}
                      {m === Math.round(leftToday) ? ' (rest of today’s goal)' : ''}
                    </option>
                  ))}
                </SelectRow>
              ) : (
                <SelectRow label="Length" value="free" onChange={() => {}} disabled display="Until you stop">
                  <option value="free">Until you stop</option>
                </SelectRow>
              )}
              <SelectRow
                label="At the end"
                value={settings.endSound}
                onChange={(v) => {
                  unlockAudio()
                  void updateSettings({ endSound: v as EndSound })
                  playEndSound(v as EndSound)
                }}
                display={END_SOUND_LABEL[settings.endSound]}
              >
                {(Object.keys(END_SOUND_LABEL) as EndSound[]).map((s) => (
                  <option key={s} value={s}>
                    {END_SOUND_LABEL[s]}
                  </option>
                ))}
              </SelectRow>
            </div>
            <div className="flex justify-between gap-3 border-t border-line bg-sidebar px-5.5 py-3.5 text-small text-muted tabular-nums">
              <span>After this session</span>
              <span className="font-medium text-ink">
                {!topic ? '—' : afterSession === null ? `${topic.name} has no goal today` : afterSession === 0 ? `${topic.name} goal reached` : `${topic.name} ${formatHM(afterSession)} h left today`}
              </span>
            </div>
          </section>

          <Section className="flex flex-col gap-2.5 px-5.5 py-4.5">
            <label htmlFor="session-draft-note" className="text-body font-semibold">
              What did you learn?
            </label>
            <Textarea
              id="session-draft-note"
              rows={3}
              maxLength={200}
              disabled={!timer || isBreak}
              placeholder={timer && !isBreak ? 'One line about this session' : 'Start a session to take a note'}
              value={timer && !isBreak ? draft.note : ''}
              onChange={(e) => draft.change(e.target.value)}
            />
          </Section>
        </div>
      </div>
    </>
  )
}
