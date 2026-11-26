import { Tabs } from 'expo-router'
import { View } from 'react-native'
import { BottomBar } from '../../src/components/BottomBar'
import { TopBar } from '../../src/components/TopBar'
import { Tour } from '../../src/starter/Tour'
import { Welcome } from '../../src/starter/Welcome'
import { PendingNoteSheet } from '../../src/timer/PendingNoteSheet'
import { ReminderEngine } from '../../src/timer/ReminderEngine'
import { TimerEngine } from '../../src/timer/TimerEngine'
import { useTheme } from '../../src/theme'

/** The phone shell: one header over the four tab pages and the floating tab bar. */
export default function TabsLayout() {
  const { colors } = useTheme()
  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
      <TopBar />
      <TimerEngine />
      <ReminderEngine />
      <PendingNoteSheet />
      <Welcome />
      <Tour />
      <Tabs tabBar={(props) => <BottomBar {...props} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.canvas } }}>
        <Tabs.Screen name="index" options={{ title: 'Today' }} />
        <Tabs.Screen name="flashcards" options={{ title: 'Cards' }} />
        <Tabs.Screen name="stories" options={{ title: 'Stories' }} />
        <Tabs.Screen name="timer" options={{ title: 'Timer' }} />
      </Tabs>
    </View>
  )
}
