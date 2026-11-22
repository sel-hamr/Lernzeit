/*
 * The Settings groups below Account: topics and daily goals, decks, timer, audio, features,
 * appearance and reminders. Shared settings sync; this device's own (voice, theme, reminders) stay
 * here (DEVICE_SETTING_KEYS), as on the web.
 */
import { describeGoals, uniformGoals, withGoalChange } from '@lernzeit/core/goals'
import { formatHM, WEEKDAYS, WEEKDAY_LONG } from '@lernzeit/core/time'
import type { Deck, EndSound, ThemePref, TimerMode, Topic, TopicColor, WeekGoals } from '@lernzeit/core/types'
import * as Speech from 'expo-speech'
import { Plus, Trash2 } from 'lucide-react-native'
import { useEffect, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { newId } from '../data/ids'
import { useToday } from '../data/useToday'
import { useSaveSettings, useSettings } from '../data/settings'
import { enabledFeatureIds, FEATURES } from '../features'
import { useLiveQuery, useLocalLibrary } from '../store/live'
import { TOPIC_COLOR_KEYS, useTheme } from '../theme'
import { setUpNotifications } from '../timer/notify'
import { isTime, normalTime } from '../timer/reminders'
import { Button, Card, Chip, Field, SelectRow, Sheet, Stepper, ToggleRow } from '../ui'


// ---------------------------------------------------------------- Topics

export function TopicsGroup() {
  const library = useLocalLibrary()
  const { colors, type, topics: palettes } = useTheme()
  const today = useToday()
  const topics = useLiveQuery(['topics'], (l) => l.list<Topic>('topics').sort((a, b) => a.order - b.order), [])
  const [editing, setEditing] = useState<Topic | 'new'>()
  const fmt = (m: number) => formatHM(m)
  return (
    <Card title="Topics and daily goals" hint="Study time is logged against a topic; each has a goal per weekday.">
      {topics.map((t) => (
        <Pressable key={t.id} onPress={() => setEditing(t)} accessibilityRole="button" accessibilityLabel={`Edit ${t.name}`} style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12, opacity: t.archived ? 0.55 : 1 }}>
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: (palettes[t.color] ?? palettes.stone).dot }} />
          <View style={{ flex: 1 }}>
            <Text style={[type.bodyMedium, { color: colors.ink }]}>{t.name + (t.archived ? ' (archived)' : '')}</Text>
            <Text style={[type.small, { color: colors.muted }]}>{describeGoals(t.goalMinutes, fmt)}</Text>
          </View>
        </Pressable>
      ))}
      <Button label="Add a topic" variant="outline" icon={<Plus size={16} color={colors.ink} />} onPress={() => setEditing('new')} />
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
    </Card>
  )
}

function TopicSheet({ topic, onClose, onSave }: { topic?: Topic; onClose: () => void; onSave: (input: { name: string; color: TopicColor; goals: WeekGoals; archived: boolean }) => void }) {
  const { colors, type, spacing, topics: palettes } = useTheme()
  const [name, setName] = useState(topic?.name ?? '')
  const [color, setColor] = useState<TopicColor>(topic?.color ?? 'sage')
  const [goals, setGoals] = useState<WeekGoals>(topic?.goalMinutes ?? uniformGoals(60))
  const [archived, setArchived] = useState(topic?.archived ?? false)
  return (
    <Sheet open onClose={onClose} title={topic ? 'Edit topic' : 'New topic'}>
      <View style={{ gap: spacing.md, paddingHorizontal: spacing.md, paddingBottom: spacing.md }}>
        <Field label="Name" value={name} onChangeText={setName} placeholder="German" />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          {TOPIC_COLOR_KEYS.map((c) => (
            <Chip key={c} label={c} selected={color === c} color={palettes[c].dot} onPress={() => setColor(c)} />
          ))}
        </View>
        <Text style={[type.small, { color: colors.muted }]}>Daily goal per weekday</Text>
        {WEEKDAYS.map((d) => (
          <Stepper key={d} label={WEEKDAY_LONG[d]} value={goals[d]} step={15} max={720} onChange={(v) => setGoals({ ...goals, [d]: v })} />
        ))}
        <Button label="Same as Monday every day" variant="outline" onPress={() => setGoals(uniformGoals(goals.mon))} />
        {topic ? <ToggleRow label="Archived" hint="Leaves Today and the timer; its history stays." value={archived} onChange={setArchived} /> : null}
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <Button label="Save" disabled={!name.trim() && !topic} onPress={() => onSave({ name: name.trim(), color, goals, archived })} />
          <Button label="Cancel" variant="outline" onPress={onClose} />
        </View>
      </View>
    </Sheet>
  )
}

// ---------------------------------------------------------------- Decks

export function DecksGroup() {
  const library = useLocalLibrary()
  const { colors, type } = useTheme()
  const decks = useLiveQuery(['decks'], (l) => l.list<Deck>('decks').sort((a, b) => a.order - b.order), [])
  const [editing, setEditing] = useState<Deck>()
  if (decks.length === 0) return null
  return (
    <Card title="Decks" hint="Name, daily limits and which directions are practised.">
      {decks.map((d) => (
        <Pressable key={d.id} onPress={() => setEditing(d)} accessibilityRole="button" accessibilityLabel={`Edit deck ${d.name}`} style={{ minHeight: 48, justifyContent: 'center' }}>
          <Text style={[type.bodyMedium, { color: colors.ink }]}>{d.name}</Text>
          <Text style={[type.small, { color: colors.muted }]}>{`${d.newPerDay} new, ${d.reviewsPerDay} reviews a day`}</Text>
        </Pressable>
      ))}
      {editing ? <DeckSheet deck={editing} onClose={() => setEditing(undefined)} onSave={(next) => (library.put('decks', next), setEditing(undefined))} /> : null}
    </Card>
  )
}

function DeckSheet({ deck, onClose, onSave }: { deck: Deck; onClose: () => void; onSave: (deck: Deck) => void }) {
  const { spacing } = useTheme()
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
    <Sheet open onClose={onClose} title="Edit deck">
      <View style={{ gap: spacing.md, paddingHorizontal: spacing.md, paddingBottom: spacing.md }}>
        <Field label="Name" value={name} onChangeText={setName} />
        <Stepper label="New cards a day" value={newPerDay} step={5} max={500} unit="" onChange={setNew} />
        <Stepper label="Reviews a day" value={reviews} step={25} max={5000} unit="" onChange={setReviews} />
        {toggles.map((t) => (
          <ToggleRow key={t.key} label={t.label} hint={t.hint} value={dirs[t.key]} onChange={(on) => setDirs({ ...dirs, [t.key]: on })} />
        ))}
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <Button label="Save" onPress={() => onSave({ ...deck, name: name.trim() || deck.name, newPerDay, reviewsPerDay: reviews, directions: dirs })} />
          <Button label="Cancel" variant="outline" onPress={onClose} />
        </View>
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
    <Card title="Timer" hint="Used by the Timer tab. The end of a session rings as a notification, also with the app closed.">
      <SelectRow<TimerMode>
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
        label="At the end"
        value={settings.endSound}
        options={(Object.keys(END_SOUND_LABEL) as EndSound[]).map((s) => ({ value: s, label: END_SOUND_LABEL[s] }))}
        onChange={(v) => save({ endSound: v })}
      />
      <ToggleRow label="Count review time" hint="Flashcard practice counts toward the topic goal." value={settings.countReviewTime} onChange={(v) => save({ countReviewTime: v })} />
    </Card>
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
    <Card title="Audio" hint="German words are spoken with a voice on this phone.">
      <SelectRow
        label="German voice"
        value={settings.voiceURI ?? ''}
        display={current?.name ?? 'Phone default'}
        options={[{ value: '', label: 'Phone default' }, ...voices.map((v) => ({ value: v.identifier, label: v.name }))]}
        onChange={(v) => save({ voiceURI: v || undefined })}
      />
      <Stepper label="Speed" value={Math.round(settings.speechRate * 100)} step={5} min={50} max={150} unit="%" onChange={(v) => save({ speechRate: v / 100 })} />
      <ToggleRow label="Play audio on reveal" hint="Say the German word when the answer shows." value={settings.autoPlayAudio} onChange={(v) => save({ autoPlayAudio: v })} />
      <Button label="Test voice" variant="outline" onPress={() => Speech.speak('Guten Tag, wie geht es dir?', { language: 'de-DE', rate: settings.speechRate, voice: settings.voiceURI })} />
    </Card>
  )
}

// ---------------------------------------------------------------- Features

export function FeaturesGroup() {
  const settings = useSettings()
  const save = useSaveSettings()
  const on = enabledFeatureIds(settings.hiddenFeatures)
  return (
    <Card title="Features" hint="Turn off what you do not use. It leaves the bars, and nothing you saved is deleted.">
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
    </Card>
  )
}

// ---------------------------------------------------------------- Appearance

export function AppearanceGroup() {
  const device = useLiveQuery(['kv'], (l) => l.get<{ value?: { theme?: ThemePref } }>('kv', 'deviceSettings')?.value?.theme, [])
  const save = useSaveSettings()
  return (
    <Card title="Appearance">
      <SelectRow<ThemePref>
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
    </Card>
  )
}

// ---------------------------------------------------------------- Reminders

export function RemindersGroup() {
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
  return (
    <Card title="Reminders" hint="A notification at these times if a goal is still open. Skipped once today's goals are met.">
      <ToggleRow label="Goal reminders" value={settings.remindersEnabled} onChange={(v) => void toggle(v)} />
      {settings.remindersEnabled ? (
        <>
          {settings.reminderTimes.map((t) => (
            <View key={t} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 40 }}>
              <ReminderTime time={t} />
              <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${t}`} hitSlop={8} onPress={() => save({ reminderTimes: settings.reminderTimes.filter((x) => x !== t) })}>
                <RemoveIcon />
              </Pressable>
            </View>
          ))}
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
            <View style={{ flex: 1 }}>
              <Field label="Add a time" value={draft} onChangeText={setDraft} placeholder="18:30" keyboardType="numbers-and-punctuation" onSubmitEditing={add} />
            </View>
            <Button label="Add" variant="outline" onPress={add} />
          </View>
        </>
      ) : null}
      {note ? <NoteText text={note} /> : null}
    </Card>
  )
}

function ReminderTime({ time }: { time: string }) {
  const { colors, type } = useTheme()
  return <Text style={[type.bodyMedium, { color: colors.ink }]}>{time}</Text>
}
function RemoveIcon() {
  const { colors } = useTheme()
  return <Trash2 size={18} strokeWidth={1.7} color={colors.muted} />
}
function NoteText({ text }: { text: string }) {
  const { colors, type } = useTheme()
  return <Text style={[type.small, { color: colors.redInk }]}>{text}</Text>
}
