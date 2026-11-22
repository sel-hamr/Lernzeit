import { Tabs } from 'expo-router'
import { View } from 'react-native'
import { BottomBar } from '../../src/components/BottomBar'
import { TopBar } from '../../src/components/TopBar'
import { useTheme } from '../../src/theme'

/** The phone shell: one top bar over the four tab pages and the bottom bar. */
export default function TabsLayout() {
  const { colors } = useTheme()
  return (
    <View style={{ flex: 1, backgroundColor: colors.main }}>
      <TopBar />
      <Tabs tabBar={(props) => <BottomBar {...props} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.main } }}>
        <Tabs.Screen name="index" options={{ title: 'Today' }} />
        <Tabs.Screen name="flashcards" options={{ title: 'Cards' }} />
        <Tabs.Screen name="stories" options={{ title: 'Stories' }} />
        <Tabs.Screen name="timer" options={{ title: 'Timer' }} />
      </Tabs>
    </View>
  )
}
