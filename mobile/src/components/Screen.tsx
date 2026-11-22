import { useRouter } from 'expo-router'
import { ChevronLeft } from 'lucide-react-native'
import type { ReactNode } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '../theme'

/** A page outside the tabs (Settings, a menu page, Search): a back button and its title. */
export function Screen({ title, children }: { title: string; children?: ReactNode }) {
  const { colors, type, spacing } = useTheme()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  return (
    <View style={[styles.page, { backgroundColor: colors.main, paddingTop: insets.top }]}>
      <View style={[styles.header, { borderBottomColor: colors.line, backgroundColor: colors.sidebar, paddingHorizontal: spacing.xs }]}>
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={4}
          style={styles.back}
        >
          <ChevronLeft size={22} strokeWidth={1.7} color={colors.ink2} />
        </Pressable>
        <Text style={[type.section, { color: colors.ink }]} accessibilityRole="header">
          {title}
        </Text>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.pageX, paddingTop: spacing.pageTop, paddingBottom: insets.bottom + spacing.xxl, gap: spacing.xxl }}>{children}</ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  header: { height: 56, flexDirection: 'row', alignItems: 'center', gap: 4, borderBottomWidth: 1 },
  back: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
})
