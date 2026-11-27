import { useRouter } from 'expo-router'
import { ChevronLeft } from 'lucide-react-native'
import type { ReactNode } from 'react'
import { KeyboardAvoidingView, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '../theme'
import { IconButton } from '../ui'

/**
 * A page outside the tabs (Settings, a menu page, the card editor): a round back button and the
 * title on the canvas, the content scrolling under it and an optional `footer` (a Save pill) pinned
 * at the bottom. Fields stay above the keyboard.
 */
export function Screen({ title, children, footer, right, scroll = true, onTouchStart }: { title: string; children?: ReactNode; footer?: ReactNode; right?: ReactNode; /** false: the children fill the page and scroll themselves (a board, a long list). */ scroll?: boolean; onTouchStart?: () => void }) {
  const { colors, type, spacing } = useTheme()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  return (
    <KeyboardAvoidingView behavior="padding" onTouchStart={onTouchStart} style={[styles.page, { backgroundColor: colors.canvas, paddingTop: insets.top }]}>
      <View style={[styles.header, { paddingHorizontal: spacing.pageX - 4, gap: spacing.md }]}>
        <IconButton icon={ChevronLeft} label="Back" iconSize={22} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
        <Text style={[type.section, styles.title, { color: colors.ink }]} accessibilityRole="header" numberOfLines={1}>
          {title}
        </Text>
        {right}
      </View>
      {scroll ? (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: spacing.pageX, paddingTop: spacing.sm, paddingBottom: footer ? spacing.xl : insets.bottom + spacing.xxl, gap: spacing.lg }}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={styles.page}>{children}</View>
      )}
      {footer ? <View style={{ paddingHorizontal: spacing.pageX, paddingTop: spacing.sm, paddingBottom: insets.bottom + spacing.md, backgroundColor: colors.canvas }}>{footer}</View> : null}
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  header: { height: 64, flexDirection: 'row', alignItems: 'center' },
  title: { flex: 1, fontSize: 20, lineHeight: 26 },
})
