// One import per weight: the package's index would bundle all 18 Geist files.
import { Geist_400Regular } from '@expo-google-fonts/geist/400Regular'
import { Geist_500Medium } from '@expo-google-fonts/geist/500Medium'
import { Geist_600SemiBold } from '@expo-google-fonts/geist/600SemiBold'
import { useFonts } from 'expo-font'
import { Stack } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import { StatusBar } from 'expo-status-bar'
import * as SystemUI from 'expo-system-ui'
import { useEffect, useState } from 'react'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { AccountProvider, useAccount } from '../src/account'
import { createServices } from '../src/services'
import { LocalLibraryProvider } from '../src/store/live'
import { SyncEngineProvider } from '../src/sync/engineContext'
import { startSyncTriggers } from '../src/sync/triggers'
import { ThemeProvider, useTheme } from '../src/theme'

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

  // Sync from the start, on local data: the screens never wait for the cloud.
  useEffect(() => {
    const { engine, library } = services
    return engine ? startSyncTriggers({ engine, library }) : undefined
  }, [services])

  // If the fonts fail to load, the app still opens, in the system font.
  if (!ready) return null
  return (
    <SafeAreaProvider>
      <LocalLibraryProvider library={services.library}>
        <AccountProvider service={services.account}>
          <SyncEngineProvider engine={services.engine}>
            <ThemeProvider>
              <Screens />
            </ThemeProvider>
          </SyncEngineProvider>
        </AccountProvider>
      </LocalLibraryProvider>
    </SafeAreaProvider>
  )
}

function Screens() {
  const { scheme, colors } = useTheme()
  // An account in the store means signed in, even offline; only its absence shows the sign-in screen.
  const signedIn = useAccount() !== null

  // The window behind the screens (seen during transitions and the keyboard) matches the theme.
  useEffect(() => {
    SystemUI.setBackgroundColorAsync(colors.sidebar).catch(() => {})
  }, [colors.sidebar])

  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.main } }}>
        <Stack.Protected guard={signedIn}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="more/[id]" />
          <Stack.Screen name="search" />
          <Stack.Screen name="settings" />
        </Stack.Protected>
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="sign-in" />
        </Stack.Protected>
      </Stack>
    </>
  )
}
