// One import per weight: the package's index would bundle all 18 Geist files.
import { Geist_400Regular } from '@expo-google-fonts/geist/400Regular'
import { Geist_500Medium } from '@expo-google-fonts/geist/500Medium'
import { Geist_600SemiBold } from '@expo-google-fonts/geist/600SemiBold'
import { useFonts } from 'expo-font'
import { Stack, type ErrorBoundaryProps } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import { StatusBar } from 'expo-status-bar'
import * as SystemUI from 'expo-system-ui'
import { useEffect, useState, type ReactNode } from 'react'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { useReducedMotion } from 'react-native-reanimated'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { AccountProvider, backfillLastAccount, useAccount } from '../src/account'
import { CrashScreen } from '../src/components/CrashScreen'
import { stackAnimation } from '../src/motion'
import { createServices } from '../src/services'
import { LocalLibraryProvider } from '../src/store/live'
import { SyncEngineProvider } from '../src/sync/engineContext'
import { startSyncTriggers } from '../src/sync/triggers'
import { useLiveQuery } from '../src/store/live'
import { ThemeProvider, useTheme, type ThemePreference } from '../src/theme'

/** The theme chosen in Settings (kept on this device); the phone's own setting until one is chosen. */
function SettingsTheme({ children }: { children: ReactNode }) {
  const theme = useLiveQuery(['kv'], (l) => l.get<{ value?: { theme?: ThemePreference } }>('kv', 'deviceSettings')?.value?.theme, [])
  return <ThemeProvider preference={theme ?? 'system'}>{children}</ThemeProvider>
}

/**
 * A screen that throws while drawing shows a calm "Something went wrong" page with Try again instead
 * of a blank screen (expo-router wraps this layout, and so every screen, in it).
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  // A crash before the fonts loaded would otherwise leave the splash over this page.
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {})
  }, [])
  return <CrashScreen error={error} onRetry={retry} />
}

// The splash stays up until Geist is loaded, so no text shows in the fallback font first.
SplashScreen.preventAutoHideAsync().catch(() => {})

export default function RootLayout() {
  const [loaded, error] = useFonts({ Geist_400Regular, Geist_500Medium, Geist_600SemiBold })
  // Opened once, on the first render: the library, the cloud client and the account.
  const [services] = useState(createServices)
  const ready = loaded || error !== null

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {})
  }, [ready])

  // Phones that signed in before the other-account guard learn who they belong to.
  useEffect(() => backfillLastAccount(services.library), [services])

  // Sync from the start, on local data: the screens never wait for the cloud.
  useEffect(() => {
    const { engine, library } = services
    return engine ? startSyncTriggers({ engine, library }) : undefined
  }, [services])

  // If the fonts fail to load, the app still opens, in the system font.
  if (!ready) return null
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <LocalLibraryProvider library={services.library}>
          <AccountProvider service={services.account}>
            <SyncEngineProvider engine={services.engine}>
              <SettingsTheme>
                <Screens />
              </SettingsTheme>
            </SyncEngineProvider>
          </AccountProvider>
        </LocalLibraryProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}

function Screens() {
  const { scheme, colors } = useTheme()
  // An account in the store means signed in, even offline; only its absence shows the sign-in screen.
  const signedIn = useAccount() !== null

  // The window behind the screens (seen during transitions and the keyboard) matches the theme.
  const reduced = useReducedMotion()

  useEffect(() => {
    SystemUI.setBackgroundColorAsync(colors.canvas).catch(() => {})
  }, [colors.canvas])

  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      {/* Pages slide in from the right, practice and editors rise from the bottom, search fades (motion/transitions.ts). */}
      <Stack screenOptions={({ route }) => ({ headerShown: false, contentStyle: { backgroundColor: colors.canvas }, animation: stackAnimation(route.name, reduced) })}>
        <Stack.Protected guard={signedIn}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="more/[id]" />
          <Stack.Screen name="search" />
          <Stack.Screen name="card/[id]" />
          <Stack.Screen name="card/edit" />
          <Stack.Screen name="practice" />
          <Stack.Screen name="practice-history" />
          <Stack.Screen name="import-csv" />
          <Stack.Screen name="settings" />
          <Stack.Screen name="story/[id]" />
          <Stack.Screen name="story/edit" />
          <Stack.Screen name="grammar/[id]" />
          <Stack.Screen name="grammar/edit" />
          <Stack.Screen name="grammar/practice" />
          <Stack.Screen name="questions/practice" />
          <Stack.Screen name="doc/[id]" />
          <Stack.Screen name="doc/edit" />
          <Stack.Screen name="docs/[folder]" />
        </Stack.Protected>
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="sign-in" />
        </Stack.Protected>
      </Stack>
    </>
  )
}
