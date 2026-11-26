import { formatClock, formatHM, formatMinutesShort, formatTimer, MINUTE } from '@lernzeit/core/time'
import { elapsedMs, isAwaitingFocus, isPaused, phaseLengthMs, remainingMs } from '@lernzeit/core/timer'
import type { TimerMode } from '@lernzeit/core/types'
import { ChevronDown, Coffee, NotebookPen, Pause, Play, SkipForward, Square, Target } from 'lucide-react-native'
import { useEffect, useRef, useState } from 'react'
import { KeyboardAvoidingView, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { useSaveSettings, useSettings } from '../data/settings'
import { AnimatedRing, FadeInUp, Pressable } from '../motion'
import { useTabBarSpace } from '../components/BottomBar'
import { useLocalLibrary } from '../store/live'
import { useTodayView } from '../today/useTodayView'
import { numbers, useTheme } from '../theme'
import { Badge, Button, EmptyState, Field, OptionRow, SelectRow, Sheet } from '../ui'
import { useActiveTimer, useNow, useTopics } from './hooks'
import { ringProgress } from './ring'
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

/** The Timer tab: a big ring with the time, the topic chip, Start / Pause / Stop, the setup and the note. */
export function TimerScreen() {
  const { colors, type, spacing, radius, shadow, topics: topicColors } = useTheme()
  const { width } = useWindowDimensions()
  const library = useLocalLibrary()
  const timer = useActiveTimer()
  const topics = useTopics()
  const settings = useSettings()
  const saveSettings = useSaveSettings()
  const view = useTodayView()
  const now = useNow(!!timer && !isPaused(timer))
  const [message, setMessage] = useState<string>()
  const [topicSheet, setTopicSheet] = useState(false)

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
    ? [MODE_LABEL[timer.mode], timer.mode === 'pomodoro' ? `round ${timer.cycle}` : null, `started ${formatClock(timer.firstStartedAt)}`].filter(Boolean).join(' · ')
    : 'Time goes to the topic when you stop'

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
  const pickTopic = (id: string) => {
    setTopicSheet(false)
    if (timer) patchTimer(library, { topicId: id })
    else {
      setPickedTopic(id)
      setPickedMinutes(undefined)
    }
  }

  const lengthOptions = [...new Set([...PRESETS, ...(leftToday >= 5 ? [Math.round(leftToday)] : []), timer?.targetMinutes ?? setupMinutes])].sort((a, b) => a - b)
  const pomodoroOptions = [...new Map([[settings.pomodoroFocus, settings.pomodoroBreak] as [number, number], ...POMODORO_PRESETS].map((p) => [`${p[0]}/${p[1]}`, p] as const)).values()]

  const afterLeft = !row || row.goal === 0 ? null : Math.max(0, row.left - Math.ceil((isBreak || mode === 'free' ? 0 : (remaining ?? 0) / MINUTE) - 1e-6))
  const goalLine = !topic ? '' : afterLeft === null ? `${topic.name} has no goal today` : afterLeft === 0 ? `${topic.name} goal reached after this session` : `${topic.name}: ${formatHM(afterLeft)} h left today after this session`

  const barSpace = useTabBarSpace()
  const ringSize = Math.max(200, Math.min(280, width - spacing.pageX * 2 - spacing.xxl * 2))
  const progress = ringProgress(elapsed, remaining, !!timer && !awaiting)
  const ringColor = isBreak ? colors.blueBar : paused ? colors.muted : colors.accent
  const dotFor = (key: string | undefined) => (key ? (topicColors[key as keyof typeof topicColors] ?? topicColors.stone).dot : colors.muted)
  const long = readout.length > 5
  const playIcon = (color: string) => <Play size={15} color={color} fill={color} />
  const stopIcon = <Square size={12} color={colors.onPrimary} fill={colors.onPrimary} />
  const card = [{ backgroundColor: colors.card, borderRadius: radius.card, padding: spacing.xl, gap: spacing.md }, shadow.card]

  if (topics.length === 0 && !timer) {
    return (
      <ScrollView style={{ backgroundColor: colors.canvas }} contentContainerStyle={{ paddingHorizontal: spacing.pageX, paddingTop: spacing.xs, paddingBottom: barSpace }}>
        <FadeInUp>
          <EmptyState icon={Target} title="No topics yet" body="The timer logs time against a topic. Add one in Settings, then come back to start." />
        </FadeInUp>
      </ScrollView>
    )
  }

  return (
    <KeyboardAvoidingView behavior="padding" style={styles.fill}>
      <ScrollView
        style={{ backgroundColor: colors.canvas }}
        contentContainerStyle={{ paddingHorizontal: spacing.pageX, paddingTop: spacing.xs, paddingBottom: barSpace, gap: spacing.cardGap }}
        keyboardShouldPersistTaps="handled"
      >
        <FadeInUp index={0}>
          <View testID="timer-hero" style={[card, styles.hero, { gap: spacing.lg }]}>
            <View style={styles.between}>
              <Badge label={state} tone={state === 'Running' ? 'lime' : state === 'Break' ? 'accent' : 'neutral'} icon={isBreak ? <Coffee size={12} strokeWidth={2} color={colors.accentInk} /> : undefined} />
              <Text style={[type.small, numbers, { color: colors.muted, flexShrink: 1 }]} numberOfLines={1}>
                {subtitle}
              </Text>
            </View>
            <AnimatedRing value={progress} size={ringSize} stroke={16} color={ringColor} label={`${state}, ${Math.round(progress * 100)} percent`}>
              <View style={{ alignItems: 'center', gap: 2, paddingHorizontal: spacing.xl }}>
                <Text
                  testID="timer-readout"
                  accessibilityLabel={`${readout} ${remaining !== undefined ? 'left' : 'studied'}${paused ? ', paused' : ''}`}
                  style={[type.timer, { color: colors.ink, opacity: paused && !awaiting ? 0.45 : 1 }, long && styles.longReadout]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                >
                  {readout}
                </Text>
                <Text style={[type.small, { color: colors.muted, textAlign: 'center' }]} numberOfLines={2}>
                  {caption}
                </Text>
              </View>
            </AnimatedRing>
            <Pressable
              onPress={() => setTopicSheet(true)}
              haptic="select"
              accessibilityRole="button"
              accessibilityLabel={`Topic: ${topic?.name ?? 'none'}`}
              style={[styles.topicChip, { backgroundColor: colors.raised, borderRadius: radius.pill, paddingHorizontal: spacing.lg, gap: spacing.sm }]}
            >
              <View style={[styles.dot, { backgroundColor: dotFor(topic?.color) }]} />
              <Text style={[type.bodyMedium, { color: colors.ink, flexShrink: 1 }]} numberOfLines={1}>
                {topic?.name ?? 'Pick a topic'}
              </Text>
              <ChevronDown size={16} strokeWidth={1.8} color={colors.muted} />
            </Pressable>
            <View style={[styles.buttons, { gap: spacing.sm }]}>
              {!timer && <Button label="Start" size="lg" haptic="firm" disabled={!topicId} onPress={start} icon={playIcon(colors.onPrimary)} />}
              {timer && isBreak && (
                <>
                  <Button label="Skip break" variant="soft" size="lg" haptic="tap" onPress={() => skipBreak(library)} icon={<SkipForward size={16} strokeWidth={1.8} color={colors.ink} />} />
                  <Button label="End pomodoro" size="lg" haptic="success" onPress={stop} icon={stopIcon} />
                </>
              )}
              {timer && awaiting && (
                <>
                  <Button label="End pomodoro" variant="soft" size="lg" haptic="tap" onPress={() => discardTimer(library)} />
                  <Button label={`Start round ${timer.cycle}`} size="lg" haptic="firm" onPress={() => resumeTimer(library)} icon={playIcon(colors.onPrimary)} />
                </>
              )}
              {timer && !isBreak && !awaiting && (
                <>
                  <Button
                    label={paused ? 'Resume' : 'Pause'}
                    variant={paused ? 'accent' : 'soft'}
                    size="lg"
                    haptic="tap"
                    onPress={() => (paused ? resumeTimer(library) : pauseTimer(library))}
                    icon={paused ? playIcon(colors.onAccent) : <Pause size={15} color={colors.ink} fill={colors.ink} />}
                  />
                  <Button label="Stop and save" size="lg" haptic="success" onPress={stop} icon={stopIcon} />
                </>
              )}
            </View>
            {message ? (
              <Text style={[type.small, { color: colors.muted, textAlign: 'center' }]} accessibilityLiveRegion="polite">
                {message}
              </Text>
            ) : null}
          </View>
        </FadeInUp>

        <FadeInUp index={1}>
          <View style={card}>
            <Text style={[type.section, { color: colors.ink }]} accessibilityRole="header">
              Session
            </Text>
            <View style={[styles.segments, { backgroundColor: colors.raised, borderRadius: radius.pill, padding: 4 }]}>
              {(['countdown', 'pomodoro', 'free'] as TimerMode[]).map((m) => {
                const on = mode === m
                return (
                  <Pressable
                    key={m}
                    haptic="select"
                    scaleTo={0.95}
                    accessibilityRole="button"
                    accessibilityLabel={MODE_LABEL[m]}
                    accessibilityState={{ selected: on, disabled: isBreak || awaiting }}
                    onPress={() => {
                      if (isBreak || awaiting) return
                      if (timer) patchTimer(library, { mode: m, targetMinutes: m === 'countdown' ? setupMinutes : undefined })
                      else setPickedMode(m)
                      saveSettings({ defaultTimerMode: m })
                    }}
                    style={[styles.segment, { borderRadius: radius.pill, backgroundColor: on ? colors.card : 'transparent' }, on && shadow.card]}
                  >
                    <Text style={[type.small, { color: on ? colors.ink : colors.muted }]}>{MODE_LABEL[m]}</Text>
                  </Pressable>
                )
              })}
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
            {goalLine ? <Text style={[type.small, numbers, { color: colors.muted, paddingHorizontal: 4 }]}>{goalLine}</Text> : null}
          </View>
        </FadeInUp>

        <FadeInUp index={2}>
          <View style={card}>
            <View style={[styles.row, { gap: spacing.sm }]}>
              <NotebookPen size={18} strokeWidth={1.8} color={colors.ink2} />
              <Text style={[type.section, { color: colors.ink }]} accessibilityRole="header">
                What did you learn?
              </Text>
            </View>
            <Field
              accessibilityLabel="What did you learn?"
              multiline
              maxLength={200}
              editable={!!timer && !isBreak}
              placeholder={timer && !isBreak ? 'One line about this session' : 'Start a session to take a note'}
              value={timer && !isBreak ? note : ''}
              onChangeText={changeNote}
            />
            <Text style={[type.small, { color: colors.muted, paddingHorizontal: 4 }]}>Saved with the session</Text>
          </View>
        </FadeInUp>
      </ScrollView>

      <Sheet open={topicSheet} onClose={() => setTopicSheet(false)} title="Topic">
        {topics.map((t) => (
          <OptionRow key={t.id} label={t.name} selected={t.id === topicId} onPress={() => pickTopic(t.id)} icon={<View style={[styles.dot, { backgroundColor: dotFor(t.color) }]} />} />
        ))}
      </Sheet>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  hero: { alignItems: 'center' },
  between: { alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center' },
  topicChip: { minHeight: 44, maxWidth: '100%', flexDirection: 'row', alignItems: 'center' },
  dot: { width: 10, height: 10, borderRadius: 5 },
  // Stacked at full width: two large pills side by side cut their labels at phone widths.
  buttons: { alignSelf: 'stretch' },
  longReadout: { fontSize: 52, lineHeight: 58, letterSpacing: -2 },
  segments: { flexDirection: 'row' },
  segment: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center' },
})
