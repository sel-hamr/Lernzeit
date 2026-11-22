import { dateKey, formatLongDate } from '@lernzeit/core/time'
import { Image, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import mark from '../assets/splash-icon.png'
import { useTheme } from '../src/theme'

/** Placeholder home screen until the Today screen arrives: the mark, the name and today's date. */
export default function Home() {
  const { colors, type, spacing } = useTheme()
  return (
    <SafeAreaView style={[styles.page, { backgroundColor: colors.main, paddingHorizontal: spacing.pageX }]}>
      <View style={[styles.center, { gap: spacing.md }]}>
        <Image source={mark} style={styles.mark} accessibilityIgnoresInvertColors />
        <Text style={[type.title, { color: colors.ink }]} accessibilityRole="header">
          Lernzeit
        </Text>
        <Text style={[type.body, { color: colors.muted }]}>{formatLongDate(dateKey())}</Text>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  mark: { width: 56, height: 56 },
})
