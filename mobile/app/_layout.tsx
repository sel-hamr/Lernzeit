// One import per weight: the package's index would bundle all 18 Geist files.
import { Geist_400Regular } from '@expo-google-fonts/geist/400Regular'
import { Geist_500Medium } from '@expo-google-fonts/geist/500Medium'
import { Geist_600SemiBold } from '@expo-google-fonts/geist/600SemiBold'
import { useFonts } from 'expo-font'
import { Stack } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import { StatusBar } from 'expo-status-bar'
import * as SystemUI from 'expo-system-ui'
import { useEffect } from 'react'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { ThemeProvider, useTheme } from '../src/theme'

// The splash stays up until Geist is loaded, so no text shows in the fallback font first.
SplashScreen.preventAutoHideAsync().catch(() => {})

export default function RootLayout() {
  const [loaded, error] = useFonts({ Geist_400Regular, Geist_500Medium, Geist_600SemiBold })
  const ready = loaded || error !== null

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {})
  }, [ready])

  // If the fonts fail to load, the app still opens, in the system font.
  if (!ready) return null
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <Screens />
      </ThemeProvider>
    </SafeAreaProvider>
  )
}

function Screens() {
  const { scheme, colors } = useTheme()

  // The window behind the screens (seen during transitions and the keyboard) matches the theme.
  useEffect(() => {
    SystemUI.setBackgroundColorAsync(colors.sidebar).catch(() => {})
  }, [colors.sidebar])

  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.main } }} />
    </>
  )
}
