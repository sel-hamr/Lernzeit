/*
 * The Settings groups below Account: topics and daily goals, decks, timer, audio, features,
 * appearance and reminders, each a titled white grouped list. Shared settings sync; this device's
 * own (voice, theme, reminders) stay here (DEVICE_SETTING_KEYS), as on the web.
 */
import { describeGoals, uniformGoals, withGoalChange } from '@lernzeit/core/goals'
import { formatHM, WEEKDAYS, WEEKDAY_LONG } from '@lernzeit/core/time'
import type { Deck, EndSound, ThemePref, TimerMode, Topic, TopicColor, WeekGoals } from '@lernzeit/core/types'
import * as Speech from 'expo-speech'
import { Layers, Plus, Trash2, Volume2 } from 'lucide-react-native'
import { useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { newId } from '../data/ids'
import { useToday } from '../data/useToday'
import { useSaveSettings, useSettings } from '../data/settings'
import { enabledFeatureIds, FEATURES } from '../features'
import { useLiveQuery, useLocalLibrary } from '../store/live'
import { TOPIC_COLOR_KEYS, useTheme } from '../theme'
import { setUpNotifications } from '../timer/notify'
import { isTime, normalTime } from '../timer/reminders'
import { Button, Chip, Field, IconButton, Row, Section, SelectRow, Sheet, Stepper, Tile, ToggleRow } from '../ui'

/** A row that does something ("Add a topic"): a soft tile with its icon and the label. */
export function ActionRow({ label, icon, onPress, tone = 'normal', busy, disabled }: { label: string; icon: typeof Plus; onPress: () => void; tone?: 'normal' | 'accent' | 'danger'; busy?: boolean; disabled?: boolean }) {
  const { colors, type } = useTheme()
  const Icon = icon
  const bg = tone === 'accent' ? colors.accentSoft : tone === 'danger' ? colors.dangerSoft : colors.raised
  const fg = tone === 'accent' ? colors.accentInk : tone === 'danger' ? colors.dangerInk : colors.ink
  return (
    <View style={{ opacity: disabled && !busy ? 0.4 : 1 }}>
      <Row
        title={
          <Text style={[type.bodyMedium, { color: tone === 'danger' ? colors.dangerInk : colors.ink }]} numberOfLines={1}>
            {busy ? `${label}…` : label}
          </Text>
        }
        left={
          <Tile bg={bg} size={36}>
            <Icon size={18} strokeWidth={1.8} color={fg} />
          </Tile>
        }
        onPress={disabled || busy ? undefined : onPress}
        accessibilityLabel={label}
      />
    </View>
  )
}

// ---------------------------------------------------------------- Topics

export function TopicsGroup() {
  const library = useLocalLibrary()
  const { topics: palettes } = useTheme()
  const today = useToday()
  const topics = useLiveQuery(['topics'], (l) => l.list<Topic>('topics').sort((a, b) => a.order - b.order), [])
  const [editing, setEditing] = useState<Topic | 'new'>()
  const fmt = (m: number) => formatHM(m)
  return (
    <>
      <Section title="Topics and daily goals" hint="Study time is logged against a topic; each has a goal per weekday.">
        {[
          ...topics.map((t) => (
            <View key={t.id} style={{ opacity: t.archived ? 0.55 : 1 }}>
              <Row
                title={t.name + (t.archived ? ' (archived)' : '')}
                subtitle={describeGoals(t.goalMinutes, fmt)}
                left={<View style={[styles.dot, { backgroundColor: (palettes[t.color] ?? palettes.stone).dot }]} />}
                chevron
                onPress={() => setEditing(t)}
                accessibilityLabel={`Edit ${t.name}`}
              />
            </View>
          )),
          <ActionRow key="add" label="Add a topic" icon={Plus} tone="accent" onPress={() => setEditing('new')} />,
        ]}
      </Section>
      {editing ? (
        <TopicSheet
          topic={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(undefined)}
          onSave={(input) => {
            if (editing === 'new') {
              const order = Math.max(-1, ...topics.map((t) => t.order)) + 1
              library.put('topics', { id: newId(), name: input.name, color: input.color, goalMinutes: input.goals, goalHistory: [{ since: today, goals: input.goals }], archived: false, order, createdAt: Date.now() } satisfies Topic)
            } else {
              let next: Topic = { ...editing, name: input.name || editing.name, color: input.color, archived: input.archived }
              next = withGoalChange(next, input.goals, today)
              library.put('topics', next)
            }
            setEditing(undefined)
          }}
        />
      ) : null}
    </>
  )
}

function TopicSheet({ topic, onClose, onSave }: { topic?: Topic; onClose: () => void; onSave: (input: { name: string; color: TopicColor; goals: WeekGoals; archived: boolean }) => void }) {
  const { colors, type, spacing, radius, topics: palettes } = useTheme()
  const [name, setName] = useState(topic?.name ?? '')
  const [color, setColor] = useState<TopicColor>(topic?.color ?? 'sage')
  const [goals, setGoals] = useState<WeekGoals>(topic?.goalMinutes ?? uniformGoals(60))
  const [archived, setArchived] = useState(topic?.archived ?? false)
  return (
    <Sheet
      open
      onClose={onClose}
      title={topic ? 'Edit topic' : 'New topic'}
      footer={
        <View style={[styles.row, { gap: spacing.sm }]}>
          <Button label="Cancel" variant="soft" onPress={onClose} style={styles.grow} />
          <Button label="Save" haptic="success" disabled={!name.trim() && !topic} onPress={() => onSave({ name: name.trim(), color, goals, archived })} style={styles.grow} />
        </View>
      }
    >
      <View style={{ gap: spacing.md, paddingHorizontal: spacing.md, paddingBottom: spacing.md }}>
        <Field label="Name" value={name} onChangeText={setName} placeholder="German" />
        <View style={[styles.wrap, { gap: spacing.sm }]}>
          {TOPIC_COLOR_KEYS.map((c) => (
            <Chip key={c} label={c} selected={color === c} color={palettes[c].dot} onPress={() => setColor(c)} />
          ))}
        </View>
        <Text style={[type.small, { color: colors.muted, paddingHorizontal: 4 }]}>Daily goal per weekday</Text>
        <View style={{ backgroundColor: colors.raised, borderRadius: radius.block, paddingHorizontal: spacing.lg, paddingVertical: spacing.xs }}>
          {WEEKDAYS.map((d) => (
            <Stepper key={d} label={WEEKDAY_LONG[d]} value={goals[d]} step={15} max={720} onChange={(v) => setGoals({ ...goals, [d]: v })} />
          ))}
        </View>
        <Button label="Same as Monday every day" variant="soft" size="sm" onPress={() => setGoals(uniformGoals(goals.mon))} />
        {topic ? <ToggleRow label="Archived" hint="Leaves Today and the timer; its history stays." value={archived} onChange={setArchived} /> : null}
      </View>
    </Sheet>
  )
}

// ---------------------------------------------------------------- Decks

export function DecksGroup() {
  const library = useLocalLibrary()
  const { colors } = useTheme()
  const decks = useLiveQuery(['decks'], (l) => l.list<Deck>('decks').sort((a, b) => a.order - b.order), [])
  const [editing, setEditing] = useState<Deck>()
  if (decks.length === 0) return null
  return (
    <>
      <Section title="Decks" hint="Name, daily limits and which directions are practised.">
        {decks.map((d) => (
          <Row
            key={d.id}
            title={d.name}
            subtitle={`${d.newPerDay} new, ${d.reviewsPerDay} reviews a day`}
            left={
              <Tile bg={colors.raised} size={36}>
                <Layers size={18} strokeWidth={1.8} color={colors.ink} />
              </Tile>
            }
            chevron
            onPress={() => setEditing(d)}
            accessibilityLabel={`Edit deck ${d.name}`}
          />
        ))}
      </Section>
      {editing ? <DeckSheet deck={editing} onClose={() => setEditing(undefined)} onSave={(next) => (library.put('decks', next), setEditing(undefined))} /> : null}
    </>
  )
}

function DeckSheet({ deck, onClose, onSave }: { deck: Deck; onClose: () => void; onSave: (deck: Deck) => void }) {
  const { colors, spacing, radius } = useTheme()
  const [name, setName] = useState(deck.name)
  const [newPerDay, setNew] = useState(deck.newPerDay)
  const [reviews, setReviews] = useState(deck.reviewsPerDay)
  const [dirs, setDirs] = useState(deck.directions)
  const toggles: { key: keyof Deck['directions']; label: string; hint: string }[] = [
    { key: 'imageToDe', label: 'Picture to German', hint: 'See the picture, say the word.' },
    { key: 'enToDe', label: 'English to German', hint: 'See the English, recall the German.' },
    { key: 'deToEn', label: 'German to English', hint: 'See the German, recall the English.' },
  ]
  return (
    <Sheet
      open
      onClose={onClose}
      title="Edit deck"
      footer={
        <View style={[styles.row, { gap: spacing.sm }]}>
          <Button label="Cancel" variant="soft" onPress={onClose} style={styles.grow} />
          <Button label="Save" haptic="success" onPress={() => onSave({ ...deck, name: name.trim() || deck.name, newPerDay, reviewsPerDay: reviews, directions: dirs })} style={styles.grow} />
        </View>
      }
    >
      <View style={{ gap: spacing.md, paddingHorizontal: spacing.md, paddingBottom: spacing.md }}>
        <Field label="Name" value={name} onChangeText={setName} />
        <View style={{ backgroundColor: colors.raised, borderRadius: radius.block, paddingHorizontal: spacing.lg, paddingVertical: spacing.xs }}>
          <Stepper label="New cards a day" value={newPerDay} step={5} max={500} unit="" onChange={setNew} />
          <Stepper label="Reviews a day" value={reviews} step={25} max={5000} unit="" onChange={setReviews} />
        </View>
        {toggles.map((t) => (
          <ToggleRow key={t.key} label={t.label} hint={t.hint} value={dirs[t.key]} onChange={(on) => setDirs({ ...dirs, [t.key]: on })} />
        ))}
      </View>
    </Sheet>
  )
}

// ---------------------------------------------------------------- Timer

const END_SOUND_LABEL: Record<EndSound, string> = { bell: 'Bell', chime: 'Chime', none: 'Silent' }

export function TimerGroup() {
  const settings = useSettings()
  const save = useSaveSettings()
  return (
    <Section title="Timer" hint="Used by the Timer tab. The end of a session rings as a notification, also with the app closed.">
      <SelectRow<TimerMode>
        inline
        label="Default mode"
        value={settings.defaultTimerMode}
        options={[
          { value: 'countdown', label: 'Countdown' },
          { value: 'pomodoro', label: 'Pomodoro' },
          { value: 'free', label: 'Free (count up)' },
        ]}
        onChange={(v) => save({ defaultTimerMode: v })}
      />
      <Stepper label="Pomodoro focus" value={settings.pomodoroFocus} step={5} min={5} max={120} onChange={(v) => save({ pomodoroFocus: v })} />
      <Stepper label="Pomodoro break" value={settings.pomodoroBreak} step={1} min={1} max={60} onChange={(v) => save({ pomodoroBreak: v })} />
      <SelectRow<EndSound>
        inline
        label="At the end"
        value={settings.endSound}
        options={(Object.keys(END_SOUND_LABEL) as EndSound[]).map((s) => ({ value: s, label: END_SOUND_LABEL[s] }))}
        onChange={(v) => save({ endSound: v })}
      />
      <ToggleRow label="Count review time" hint="Flashcard practice counts toward the topic goal." value={settings.countReviewTime} onChange={(v) => save({ countReviewTime: v })} />
    </Section>
  )
}

// ---------------------------------------------------------------- Audio

export function AudioGroup() {
  const settings = useSettings()
  const save = useSaveSettings()
  const [voices, setVoices] = useState<{ identifier: string; name: string }[]>([])
  useEffect(() => {
    let live = true
    Speech.getAvailableVoicesAsync()
      .then((all) => live && setVoices(all.filter((v) => v.language?.toLowerCase().startsWith('de')).map((v) => ({ identifier: v.identifier, name: v.name }))))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [])
  const current = voices.find((v) => v.identifier === settings.voiceURI)
  return (
    <Section title="Audio" hint="German words are spoken with a voice on this phone.">
      <SelectRow
        inline
        label="German voice"
        value={settings.voiceURI ?? ''}
        display={current?.name ?? 'Phone default'}
        options={[{ value: '', label: 'Phone default' }, ...voices.map((v) => ({ value: v.identifier, label: v.name }))]}
        onChange={(v) => save({ voiceURI: v || undefined })}
      />
      <Stepper label="Speed" value={Math.round(settings.speechRate * 100)} step={5} min={50} max={150} unit="%" onChange={(v) => save({ speechRate: v / 100 })} />
      <ToggleRow label="Play audio on reveal" hint="Say the German word when the answer shows." value={settings.autoPlayAudio} onChange={(v) => save({ autoPlayAudio: v })} />
      <ActionRow label="Test voice" icon={Volume2} onPress={() => Speech.speak('Guten Tag, wie geht es dir?', { language: 'de-DE', rate: settings.speechRate, voice: settings.voiceURI })} />
    </Section>
  )
}

// ---------------------------------------------------------------- Features

export function FeaturesGroup() {
  const settings = useSettings()
  const save = useSaveSettings()
  const on = enabledFeatureIds(settings.hiddenFeatures)
  return (
    <Section title="Features" hint="Turn off what you do not use. It leaves the bars, and nothing you saved is deleted.">
      {FEATURES.map((f) => (
        <ToggleRow
          key={f.id}
          label={f.label}
          hint={f.required ? 'Always on.' : undefined}
          value={on.includes(f.id)}
          onChange={(v) => {
            if (f.required) return
            const hidden = settings.hiddenFeatures.filter((id) => id !== f.id)
            save({ hiddenFeatures: v ? hidden : [...hidden, f.id] })
          }}
        />
      ))}
    </Section>
  )
}

// ---------------------------------------------------------------- Appearance

export function AppearanceGroup() {
  const device = useLiveQuery(['kv'], (l) => l.get<{ value?: { theme?: ThemePref } }>('kv', 'deviceSettings')?.value?.theme, [])
  const save = useSaveSettings()
  return (
    <Section title="Appearance">
      <SelectRow<ThemePref>
        inline
        label="Theme"
        value={device ?? 'system'}
        options={[
          { value: 'system', label: 'Follow the phone' },
          { value: 'light', label: 'Light' },
          { value: 'dark', label: 'Dark' },
        ]}
        onChange={(v) => {
          save({ theme: v })
        }}
      />
    </Section>
  )
}

// ---------------------------------------------------------------- Reminders

export function RemindersGroup() {
  const { colors, type, spacing } = useTheme()
  const settings = useSettings()
  const save = useSaveSettings()
  const [draft, setDraft] = useState('')
  const [note, setNote] = useState<string>()
  const toggle = async (on: boolean) => {
    if (on && !(await setUpNotifications())) {
      setNote('Notifications are off for Lernzeit. Allow them in the phone settings.')
      return
    }
    setNote(undefined)
    save({ remindersEnabled: on })
  }
  const add = () => {
    if (!isTime(draft)) return setNote('Use a time like 18:30.')
    const t = normalTime(draft)
    save({ reminderTimes: [...new Set([...settings.reminderTimes, t])].sort() })
    setDraft('')
    setNote(undefined)
  }
  const rows = [<ToggleRow key="on" label="Goal reminders" value={settings.remindersEnabled} onChange={(v) => void toggle(v)} />]
  if (settings.remindersEnabled) {
    for (const t of settings.reminderTimes) {
      rows.push(
        <Row
          key={t}
          title={<Text style={[type.bodyMedium, { color: colors.ink, fontVariant: ['tabular-nums'] }]}>{t}</Text>}
          right={<IconButton icon={Trash2} label={`Remove ${t}`} variant="ghost" size={40} iconSize={18} haptic="tap" onPress={() => save({ reminderTimes: settings.reminderTimes.filter((x) => x !== t) })} />}
        />,
      )
    }
    rows.push(
      <View key="add" style={[styles.row, { gap: spacing.sm, paddingVertical: spacing.md }]}>
        <View style={styles.grow}>
          <Field value={draft} onChangeText={setDraft} placeholder="18:30" accessibilityLabel="Add a time" keyboardType="numbers-and-punctuation" onSubmitEditing={add} />
        </View>
        <Button label="Add" variant="soft" onPress={add} />
      </View>,
    )
  }
  if (note)
    rows.push(
      <Text key="note" style={[type.small, { color: colors.dangerInk, paddingVertical: spacing.md }]} accessibilityRole="alert">
        {note}
      </Text>,
    )
  return (
    <Section title="Reminders" hint="A notification at these times if a goal is still open. Skipped once today's goals are met.">
      {rows}
    </Section>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  grow: { flex: 1 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap' },
  dot: { width: 12, height: 12, borderRadius: 6, marginHorizontal: 12 },
})
