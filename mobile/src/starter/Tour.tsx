import { useState } from 'react'
import { Modal, Pressable, Text, View } from 'react-native'
import { useLiveQuery, useLocalLibrary } from '../store/live'
import { useTheme } from '../theme'
import { Button } from '../ui'
import { libraryIsEmpty } from './starter'

export const TOUR_STEPS = [
  { title: 'Today', text: 'Your daily goals and the time you studied. Each topic has a goal per weekday, and a bar fills as you study.' },
  { title: 'Cards', text: 'Your flashcards by deck. Tap Practise to go through a deck: show the answer, then rate it Again, Hard, Good or Easy. Add words with the plus.' },
  { title: 'Timer', text: 'Pick a topic and start a countdown, pomodoro or free timer. It keeps running when the app is closed and rings when the time is up.' },
  { title: 'Menu', text: 'The menu at the top right holds History, Settings and the other pages. Settings has topics, goals, reminders, backup and this walkthrough.' },
]

/** Whether the walkthrough should show: it is pending, or this phone has data from before it existed and has not seen it. */
function useTourPending(): boolean {
  return useLiveQuery(['kv', 'topics'], (library) => {
    const state = library.get<{ value?: unknown }>('kv', 'tour')?.value
    if (state === 'pending') return true
    return state === undefined && library.count('topics') > 0 && !libraryIsEmpty(library)
  }, [])
}

/** A few overlay cards, once per phone; Settings can start it again. */
export function Tour() {
  const pending = useTourPending()
  const library = useLocalLibrary()
  const { colors, type, spacing, radius } = useTheme()
  const [step, setStep] = useState(0)
  const done = () => {
    library.put('kv', { key: 'tour', value: 'seen' })
    setStep(0)
  }
  const s = TOUR_STEPS[step]
  return (
    <Modal visible={pending} transparent animationType="fade" onRequestClose={done} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: colors.scrim, justifyContent: 'center', padding: spacing.xl }}>
        <View style={{ backgroundColor: colors.main, borderRadius: radius.section, padding: spacing.xl, gap: spacing.lg, borderWidth: 1, borderColor: colors.line }}>
          <Text style={[type.chip, { color: colors.muted }]}>{`${step + 1} of ${TOUR_STEPS.length}`}</Text>
          <Text style={[type.title, { color: colors.ink }]} accessibilityRole="header">
            {s.title}
          </Text>
          <Text style={[type.body, { color: colors.ink2 }]}>{s.text}</Text>
          <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }}>
            <Button label={step === TOUR_STEPS.length - 1 ? 'Done' : 'Next'} onPress={() => (step === TOUR_STEPS.length - 1 ? done() : setStep(step + 1))} />
            <Pressable onPress={done} accessibilityRole="button" accessibilityLabel="Skip the walkthrough" style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.md }}>
              <Text style={[type.bodyMedium, { color: colors.muted }]}>Skip</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  )
}
