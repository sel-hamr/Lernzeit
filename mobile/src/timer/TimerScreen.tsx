import { formatClock, formatHM, formatMinutesShort, formatTimer, MINUTE } from '@lernzeit/core/time'
import { elapsedMs, isAwaitingFocus, isPaused, phaseLengthMs, remainingMs } from '@lernzeit/core/timer'
import type { TimerMode } from '@lernzeit/core/types'
import { Pause, Play, SkipForward, Square } from 'lucide-react-native'
import { useEffect, useRef, useState } from 'react'
import { ScrollView, Text, View } from 'react-native'
import { useSaveSettings, useSettings } from '../data/settings'
import { useLocalLibrary } from '../store/live'
import { useTodayView } from '../today/useTodayView'
import { numbers, useTheme } from '../theme'
import { Button, Chip, Field, SelectRow } from '../ui'
import { useActiveTimer, useNow, useTopics } from './hooks'
import { discardTimer, patchTimer, pauseTimer, resumeTimer, skipBreak, startTimer, stopTimer } from './timerStore'

const MODE_LABEL: Record<TimerMode, string> = { countdown: 'Countdown', pomodoro: 'Pomodoro', free: 'Free' }
const PRESETS = [15, 20, 25, 30, 45, 60, 90, 120, 180]
const POMODORO_PRESETS: [number, number][] = [
  [25, 5],
  [30, 5],
  [45, 10],
  [50, 10],
  [60, 15],
]

/** Countdown length offered for a topic: what is left today, or 25 min once the goal is met. */
export const defaultCountdown = (leftMinutes: number) => (leftMinutes >= 5 ? Math.round(leftMinutes) : 25)

/** The Timer tab: topic, mode, Start / Pause / Stop, and "What did you learn?". */
export function TimerScreen() {
  const { colors, type, spacing, radius } = useTheme()
  const library = useLocalLibrary()
  const timer = useActiveTimer()
  const topics = useTopics()
  const settings = useSettings()
  const saveSettings = useSaveSettings()
  const view = useTodayView()
  const now = useNow(!!timer && !isPaused(timer))
  const [message, setMessage] = useState<string>()

  const firstOpen = view.progress.topics.find((r) => r.goal > 0 && !r.hit)?.topic ?? topics[0]
  const [pickedTopic, setPickedTopic] = useState<string>()
  const [pickedMode, setPickedMode] = useState<TimerMode>()
  const [pickedMinutes, setPickedMinutes] = useState<number>()

  const topicId = timer?.topicId ?? (pickedTopic && topics.some((t) => t.id === pickedTopic) ? pickedTopic : firstOpen?.id)
  const topic = topics.find((t) => t.id === topicId)
  const row = view.progress.topics.find((r) => r.topic.id === topicId)
  const mode: TimerMode = timer?.mode ?? pickedMode ?? settings.defaultTimerMode
  const leftToday = row?.left ?? 0
  const setupMinutes = pickedMinutes ?? defaultCountdown(leftToday)

  // The draft note lives on the running timer, saved a moment after typing stops.
  const [note, setNote] = useState(timer?.note ?? '')
  const [noteRun, setNoteRun] = useState(timer?.runId)
  const saveNote = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  if (timer?.runId !== noteRun) {
    setNoteRun(timer?.runId)
    setNote(timer?.note ?? '')
  }
  useEffect(() => () => clearTimeout(saveNote.current), [])
  const changeNote = (value: string) => {
    setNote(value)
    clearTimeout(saveNote.current)
    saveNote.current = setTimeout(() => patchTimer(library, { note: value }), 400)
  }

  const isBreak = timer?.phase === 'break'
  const awaiting = !!timer && isAwaitingFocus(timer)
  const paused = !!timer && isPaused(timer)
  const elapsed = timer ? elapsedMs(timer, now) : 0
  const remaining = timer ? remainingMs(timer, now) : mode === 'free' ? undefined : (mode === 'pomodoro' ? settings.pomodoroFocus : setupMinutes) * MINUTE
  const lengthMinutes = timer ? (phaseLengthMs(timer) ?? 0) / MINUTE : mode === 'pomodoro' ? settings.pomodoroFocus : setupMinutes
  const readout = formatTimer(remaining ?? elapsed)

  let caption: string
  if (!timer) caption = mode === 'free' ? 'counts up until you stop' : `${formatMinutesShort(lengthMinutes)} session`
  else if (isBreak) caption = `left in this ${formatMinutesShort(lengthMinutes)} break`
  else if (awaiting) caption = `Break over, round ${timer.cycle} is ready`
  else if (timer.mode === 'free') caption = 'studied in this session'
  else caption = `left in this ${formatMinutesShort(lengthMinutes)} session`

  const state = !timer ? 'Ready' : isBreak ? 'Break' : awaiting ? 'Ready' : paused ? 'Paused' : 'Running'
  const subtitle = timer
    ? [topic?.name, MODE_LABEL[timer.mode].toLowerCase(), timer.mode === 'pomodoro' ? `round ${timer.cycle}` : null, `started ${formatClock(timer.firstStartedAt)}`].filter(Boolean).join(' · ')
    : 'Pick a topic and press Start. The time goes to that topic when you stop.'

  const start = () => {
    if (!topicId) return
    setMessage(undefined)
    startTimer(library, { topicId, mode, targetMinutes: mode === 'countdown' ? setupMinutes : undefined })
    if (mode !== settings.defaultTimerMode) saveSettings({ defaultTimerMode: mode })
  }
  const stop = () => {
    if (isBreak) {
      discardTimer(library)
      setMessage('Pomodoro finished')
      return
    }
    patchTimer(library, { note })
    const saved = stopTimer(library)
    setMessage(saved ? undefined : 'Under a minute, so nothing was saved')
  }

  const lengthOptions = [...new Set([...PRESETS, ...(leftToday >= 5 ? [Math.round(leftToday)] : []), timer?.targetMinutes ?? setupMinutes])].sort((a, b) => a - b)
  const pomodoroOptions = [...new Map([[settings.pomodoroFocus, settings.pomodoroBreak] as [number, number], ...POMODORO_PRESETS].map((p) => [`${p[0]}/${p[1]}`, p] as const)).values()]

  const afterLeft = !row || row.goal === 0 ? null : Math.max(0, row.left - Math.ceil((isBreak || mode === 'free' ? 0 : (remaining ?? 0) / MINUTE) - 1e-6))

  const toneBg = isBreak ? colors.buttonSoft : colors.soft
  return (
    <ScrollView
      style={{ backgroundColor: colors.canvas }}
      contentContainerStyle={{ paddingHorizontal: spacing.pageX, paddingTop: 0, paddingBottom: spacing.xxxl, gap: spacing.xl }}
      keyboardShouldPersistTaps="handled"
    >
      {/* The page name is in the header above; the day line stays here. */}
      <Text style={[type.body, { color: colors.muted, paddingHorizontal: 4 }]}>{subtitle}</Text>

      <View style={{ backgroundColor: toneBg, borderColor: colors.line, borderWidth: 1, borderRadius: radius.section, padding: spacing.xl, gap: spacing.lg, alignItems: 'center' }}>
        <View style={{ backgroundColor: state === 'Running' ? colors.sage : colors.neutralChip, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 4 }}>
          <Text style={[type.chip, { color: state === 'Running' ? colors.sageInk : colors.neutralInk }]}>{state}</Text>
        </View>
        <Text accessibilityLabel={`${readout} ${remaining !== undefined ? 'left' : 'studied'}${paused ? ', paused' : ''}`} style={[type.timer, { color: colors.ink, opacity: paused && !awaiting ? 0.5 : 1 }]}>
          {readout}
        </Text>
        <Text style={[type.body, { color: colors.muted, textAlign: 'center' }]}>{caption}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing.sm }}>
          {!timer && <Button label="Start" disabled={!topicId} onPress={start} icon={<Play size={14} color={colors.onDark} fill={colors.onDark} />} style={{ minWidth: 160 }} />}
          {timer && isBreak && (
            <>
              <Button label="Skip break" variant="outline" onPress={() => skipBreak(library)} icon={<SkipForward size={16} strokeWidth={1.8} color={colors.ink} />} />
              <Button label="End pomodoro" onPress={stop} icon={<Square size={12} color={colors.onDark} fill={colors.onDark} />} />
            </>
          )}
          {timer && awaiting && (
            <>
              <Button label="End pomodoro" variant="outline" onPress={() => discardTimer(library)} />
              <Button label={`Start round ${timer.cycle}`} onPress={() => resumeTimer(library)} icon={<Play size={14} color={colors.onDark} fill={colors.onDark} />} />
            </>
          )}
          {timer && !isBreak && !awaiting && (
            <>
              <Button
                label={paused ? 'Resume' : 'Pause'}
                variant="outline"
                onPress={() => (paused ? resumeTimer(library) : pauseTimer(library))}
                icon={paused ? <Play size={14} color={colors.ink} fill={colors.ink} /> : <Pause size={14} color={colors.ink} fill={colors.ink} />}
              />
              <Button label="Stop and save" onPress={stop} icon={<Square size={12} color={colors.onDark} fill={colors.onDark} />} />
            </>
          )}
        </View>
        {message ? <Text style={[type.body, { color: colors.muted }]}>{message}</Text> : null}
      </View>

      <View style={{ gap: spacing.sm }}>
        <SelectRow
          label="Topic"
          value={topicId ?? ''}
          display={topic?.name ?? 'Add a topic in Settings'}
          options={topics.map((t) => ({ value: t.id, label: t.name }))}
          onChange={(v) => (timer ? patchTimer(library, { topicId: v }) : (setPickedTopic(v), setPickedMinutes(undefined)))}
        />
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          {(['countdown', 'pomodoro', 'free'] as TimerMode[]).map((m) => (
            <Chip
              key={m}
              label={MODE_LABEL[m]}
              selected={mode === m}
              onPress={() => {
                if (isBreak || awaiting) return
                if (timer) patchTimer(library, { mode: m, targetMinutes: m === 'countdown' ? setupMinutes : undefined })
                else setPickedMode(m)
                saveSettings({ defaultTimerMode: m })
              }}
            />
          ))}
        </View>
        {mode === 'pomodoro' ? (
          <SelectRow
            label="Length"
            value={`${timer?.targetMinutes ?? settings.pomodoroFocus}/${timer?.breakMinutes ?? settings.pomodoroBreak}`}
            display={`${timer?.targetMinutes ?? settings.pomodoroFocus} min focus, ${timer?.breakMinutes ?? settings.pomodoroBreak} min break`}
            disabled={isBreak}
            options={pomodoroOptions.map(([f, b]) => ({ value: `${f}/${b}`, label: `${f} min focus, ${b} min break` }))}
            onChange={(v) => {
              const [focus, rest] = v.split('/').map(Number)
              saveSettings({ pomodoroFocus: focus, pomodoroBreak: rest })
              if (timer) patchTimer(library, { targetMinutes: focus, breakMinutes: rest })
            }}
          />
        ) : mode === 'countdown' ? (
          <SelectRow
            label="Length"
            value={String(timer?.targetMinutes ?? setupMinutes)}
            display={formatMinutesShort(timer?.targetMinutes ?? setupMinutes)}
            options={lengthOptions.map((m) => ({ value: String(m), label: `${formatMinutesShort(m)}${m === Math.round(leftToday) ? ' (rest of today’s goal)' : ''}` }))}
            onChange={(v) => (timer ? patchTimer(library, { targetMinutes: Number(v) }) : setPickedMinutes(Number(v)))}
          />
        ) : null}
        <Text style={[type.small, { color: colors.muted }]}>
          {!topic ? '' : afterLeft === null ? `${topic.name} has no goal today` : afterLeft === 0 ? `${topic.name} goal reached after this session` : `${topic.name}: ${formatHM(afterLeft)} h left today after this session`}
        </Text>
      </View>

      <View style={{ gap: spacing.sm }}>
        <Field
          label="What did you learn?"
          multiline
          maxLength={200}
          editable={!!timer && !isBreak}
          placeholder={timer && !isBreak ? 'One line about this session' : 'Start a session to take a note'}
          value={timer && !isBreak ? note : ''}
          onChangeText={changeNote}
        />
        <Text style={[type.small, numbers, { color: colors.muted }]}>It is saved with the session.</Text>
      </View>
    </ScrollView>
  )
}
