import Constants from 'expo-constants'
import { useState } from 'react'
import { ScrollView, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLocalLibrary } from '../store/live'
import { useTheme } from '../theme'
import { Button, Chip, Field, Stepper, ToggleRow } from '../ui'
import { GERMAN_SUMMARY, loadStarterFile, setUpLernzeit, startEmpty, useShouldOfferStarter } from './starter'

const SUGGESTIONS = ['German', 'English', 'Maths', 'Programming', 'Music']

/**
 * The first-launch welcome: shown over the app when this phone and the cloud library are both empty
 * (after the first sync). Pick topics and a daily goal, optionally install the German starter.
 */
export function Welcome() {
  const offered = useShouldOfferStarter()
  if (!offered) return null
  return <WelcomeCard />
}

function WelcomeCard() {
  const { colors, type, spacing } = useTheme()
  const insets = useSafeAreaInsets()
  const library = useLocalLibrary()
  const [picked, setPicked] = useState<string[]>(['German'])
  const [custom, setCustom] = useState('')
  const [minutes, setMinutes] = useState(30)
  const [german, setGerman] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const withGerman = german && picked.some((p) => p.toLowerCase() === 'german')
  const toggle = (name: string) => setPicked((p) => (p.includes(name) ? p.filter((x) => x !== name) : [...p, name]))
  const addCustom = () => {
    const name = custom.trim()
    if (name && !picked.some((p) => p.toLowerCase() === name.toLowerCase())) setPicked([...picked, name])
    setCustom('')
  }

  const start = async () => {
    setBusy(true)
    setError(undefined)
    try {
      const file = withGerman ? await loadStarterFile(String(Constants.expoConfig?.extra?.apiUrl ?? '')) : undefined
      setUpLernzeit(library, picked.map((name) => ({ name, minutes })), file)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Setting up failed.')
      setBusy(false)
    }
  }

  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.main, zIndex: 50 }} accessibilityViewIsModal>
      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingTop: insets.top + spacing.xxl, paddingBottom: insets.bottom + spacing.xxl, gap: spacing.xl }} keyboardShouldPersistTaps="handled">
        <View style={{ gap: spacing.xs }}>
          <Text style={[type.title, { color: colors.ink }]} accessibilityRole="header">
            Welcome to Lernzeit
          </Text>
          <Text style={[type.body, { color: colors.muted }]}>Pick what you study and a daily goal. You can change both later in Settings.</Text>
        </View>
        <View style={{ gap: spacing.sm }}>
          <Text style={[type.section, { color: colors.ink }]}>Topics</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            {[...SUGGESTIONS, ...picked.filter((p) => !SUGGESTIONS.includes(p))].map((s) => (
              <Chip key={s} label={s} selected={picked.includes(s)} onPress={() => toggle(s)} />
            ))}
          </View>
          <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-end' }}>
            <View style={{ flex: 1 }}>
              <Field label="Another topic" value={custom} onChangeText={setCustom} onSubmitEditing={addCustom} />
            </View>
            <Button label="Add" variant="outline" onPress={addCustom} />
          </View>
        </View>
        <Stepper label="Daily goal per topic" value={minutes} step={15} min={0} max={480} onChange={setMinutes} />
        {picked.some((p) => p.toLowerCase() === 'german') ? (
          <ToggleRow label="Add the German starter" hint={`${GERMAN_SUMMARY.cards} cards in ${GERMAN_SUMMARY.decks} decks, ${GERMAN_SUMMARY.stories} stories, ${GERMAN_SUMMARY.questions} questions and ${GERMAN_SUMMARY.grammar} grammar topics. Downloaded now.`} value={german} onChange={setGerman} />
        ) : null}
        {error ? (
          <Text style={[type.body, { color: colors.redInk }]} accessibilityRole="alert">
            {error}
          </Text>
        ) : null}
        <View style={{ gap: spacing.sm }}>
          <Button label={withGerman ? 'Set up and download' : 'Get started'} busy={busy} disabled={picked.length === 0 && !withGerman} onPress={() => void start()} />
          <Button label="Start empty" variant="outline" disabled={busy} onPress={() => startEmpty(library)} />
        </View>
      </ScrollView>
    </View>
  )
}
