import { RotateCw, TriangleAlert } from 'lucide-react-native'
import { useContext, useState } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaInsetsContext } from 'react-native-safe-area-context'
import { useTheme } from '../theme'
import { Button } from '../ui'

/**
 * What the app shows when a screen throws while drawing: a calm page with Try again, never a blank
 * screen. It draws outside the app's providers (it is the root layout's ErrorBoundary), so it needs
 * nothing from them: the theme follows the phone and the safe area falls back to a margin. In
 * development the error's message shows under the text.
 */
export function CrashScreen({ error, onRetry }: { error: Error; onRetry: () => Promise<void> | void }) {
  const { colors, type, spacing, radius } = useTheme()
  const insets = useContext(SafeAreaInsetsContext)
  const [busy, setBusy] = useState(false)
  const retry = async () => {
    setBusy(true)
    try {
      await onRetry()
    } finally {
      setBusy(false)
    }
  }
  return (
    <ScrollView style={{ backgroundColor: colors.canvas }} contentContainerStyle={[styles.page, { paddingTop: (insets?.top ?? 24) + spacing.xxxl, paddingBottom: (insets?.bottom ?? 16) + spacing.xl, paddingHorizontal: spacing.xl, gap: spacing.lg }]}>
      <View style={[styles.tile, { backgroundColor: colors.dangerSoft, borderRadius: radius.block }]}>
        <TriangleAlert size={28} strokeWidth={1.8} color={colors.dangerInk} />
      </View>
      <Text style={[type.title, styles.center, { color: colors.ink }]} accessibilityRole="header">
        Something went wrong
      </Text>
      <Text style={[type.body, styles.center, { color: colors.muted }]}>Lernzeit hit a problem drawing this screen. Your library is safe on this phone. Try again, and if it keeps happening, restart the app.</Text>
      {__DEV__ ? (
        <Text style={[type.small, styles.center, { color: colors.dangerInk }]} selectable>
          {error.message}
        </Text>
      ) : null}
      <Button label="Try again" size="lg" busy={busy} icon={<RotateCw size={16} strokeWidth={1.8} color={colors.onPrimary} />} onPress={() => void retry()} style={styles.button} />
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  page: { flexGrow: 1, alignItems: 'center', justifyContent: 'center' },
  tile: { width: 64, height: 64, alignItems: 'center', justifyContent: 'center' },
  center: { textAlign: 'center' },
  button: { alignSelf: 'stretch', marginTop: 8 },
})
