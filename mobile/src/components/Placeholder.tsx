import { StyleSheet, Text, View } from 'react-native'
import { useTheme } from '../theme'

/** A page that arrives in a later update: its name (when the page has no header of its own) and a plain line. */
export function Placeholder({ title, message = 'Coming in the next update' }: { title?: string; message?: string }) {
  const { colors, type, spacing } = useTheme()
  return (
    <View style={[styles.page, { backgroundColor: colors.main, paddingHorizontal: spacing.pageX, paddingTop: spacing.pageTop, gap: spacing.sm }]}>
      {title ? (
        <Text style={[type.title, { color: colors.ink }]} accessibilityRole="header">
          {title}
        </Text>
      ) : null}
      <Text style={[type.body, { color: colors.muted }]}>{message}</Text>
    </View>
  )
}

const styles = StyleSheet.create({ page: { flex: 1 } })
