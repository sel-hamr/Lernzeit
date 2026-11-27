import { CalendarCheck, Clock3, Layers, Menu, type LucideIcon } from 'lucide-react-native'
import { useState } from 'react'
import { Modal, StyleSheet, Text, View } from 'react-native'
import { FadeInUp } from '../motion'
import { useLiveQuery, useLocalLibrary } from '../store/live'
import { useTheme } from '../theme'
import { Button, Tile } from '../ui'
import { libraryIsEmpty } from './starter'

export const TOUR_STEPS = [
  { title: 'Today', text: 'Your daily goals and the time you studied. Each topic has a goal per weekday, and a bar fills as you study.' },
  { title: 'Cards', text: 'Your flashcards by deck. Tap Practise to go through a deck: show the answer, then rate it Again, Hard, Good or Easy. Add cards from the ⋯ menu.' },
  { title: 'Timer', text: 'Pick a topic and start a countdown, pomodoro or free timer. It keeps running when the app is closed and rings when the time is up.' },
  { title: 'Menu', text: 'The Menu button at the right end of the bottom bar holds Grammar, Questions, Docs and Settings. Settings has topics, goals, reminders, backup and this walkthrough.' },
]

/** Whether the walkthrough should show: it is pending, or this phone has data from before it existed and has not seen it. */
function useTourPending(): boolean {
  return useLiveQuery(['kv', 'topics'], (library) => {
    const state = library.get<{ value?: unknown }>('kv', 'tour')?.value
    if (state === 'pending') return true
    return state === undefined && library.count('topics') > 0 && !libraryIsEmpty(library)
  }, [])
}

const STEP_ICON: LucideIcon[] = [CalendarCheck, Layers, Clock3, Menu]

/** A few overlay cards, once per phone; Settings can start it again. Android back skips it. */
export function Tour() {
  const pending = useTourPending()
  const library = useLocalLibrary()
  const { colors, type, spacing, radius, shadow } = useTheme()
  const [step, setStep] = useState(0)
  const done = () => {
    library.put('kv', { key: 'tour', value: 'seen' })
    setStep(0)
  }
  const s = TOUR_STEPS[step]
  const Icon = STEP_ICON[step] ?? Menu
  const lastStep = step === TOUR_STEPS.length - 1
  return (
    <Modal visible={pending} transparent animationType="fade" onRequestClose={done} statusBarTranslucent navigationBarTranslucent>
      <View style={[styles.backdrop, { backgroundColor: colors.scrim, padding: spacing.xl }]}>
        <FadeInUp key={step}>
          <View style={[{ backgroundColor: colors.card, borderRadius: radius.card, padding: spacing.xl, gap: spacing.lg }, shadow.float]}>
            <View style={styles.between}>
              <Tile bg={colors.accent} size={48}>
                <Icon size={22} strokeWidth={1.8} color={colors.onAccent} />
              </Tile>
              <View style={[styles.dots, { gap: 6 }]} accessible accessibilityLabel={`${step + 1} of ${TOUR_STEPS.length}`}>
                {TOUR_STEPS.map((t, i) => (
                  <View key={t.title} style={[styles.dot, { width: i === step ? 22 : 8, backgroundColor: i === step ? colors.ink : colors.lineStrong }]} />
                ))}
              </View>
            </View>
            <Text style={[type.title, { color: colors.ink }]} accessibilityRole="header">
              {s.title}
            </Text>
            <Text style={[type.body, { color: colors.ink2 }]}>{s.text}</Text>
            <View style={[styles.row, { gap: spacing.sm }]}>
              <Button label="Skip" variant="soft" onPress={done} style={styles.grow} />
              <Button label={lastStep ? 'Done' : 'Next'} haptic={lastStep ? 'success' : 'tap'} onPress={() => (lastStep ? done() : setStep(step + 1))} style={styles.grow} />
            </View>
          </View>
        </FadeInUp>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'center' },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  row: { flexDirection: 'row', alignItems: 'center' },
  grow: { flex: 1 },
  dots: { flexDirection: 'row', alignItems: 'center' },
  dot: { height: 8, borderRadius: 4 },
})
