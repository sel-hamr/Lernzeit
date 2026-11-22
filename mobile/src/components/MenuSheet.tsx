import { usePathname, useRouter, type Href } from 'expo-router'
import { Cloud, CloudOff, Settings } from 'lucide-react-native'
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { menuFeatures, useHiddenFeatures } from '../features'
import { useTheme } from '../theme'
import { levelColor, useSyncIndicator } from './syncIndicator'

/**
 * The phone's menu, a sheet from the bottom as on the web: the pages that are not on the bottom bar,
 * Settings and the sync status. It closes on the back button, a tap on the backdrop and navigation.
 */
export function MenuSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { colors, type, spacing, radius } = useTheme()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const pathname = usePathname()
  const items = menuFeatures(useHiddenFeatures())
  const sync = useSyncIndicator()

  const go = (href: Href) => {
    onClose()
    router.push(href)
  }
  const row = (active: boolean, pressed: boolean) => [
    styles.row,
    { borderRadius: radius.img, paddingHorizontal: spacing.md, gap: spacing.md, backgroundColor: active || pressed ? colors.field : 'transparent', borderColor: active ? colors.line : 'transparent' },
  ]

  return (
    <Modal testID="menu-sheet" visible={open} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <View style={styles.fill}>
        <Pressable style={[styles.fill, { backgroundColor: colors.scrim }]} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close menu" />
        <View
          style={[styles.sheet, { backgroundColor: colors.main, borderColor: colors.line, paddingBottom: insets.bottom + spacing.md, paddingHorizontal: spacing.md, paddingTop: spacing.md }]}
        >
          <Text style={[type.section, styles.title, { color: colors.ink, paddingHorizontal: spacing.md }]} accessibilityRole="header">
            Menu
          </Text>
          <ScrollView>
            {items.map(({ id, label, icon: Icon }) => {
              const active = pathname === `/more/${id}`
              return (
                <Pressable key={id} onPress={() => go(`/more/${id}` as Href)} accessibilityRole="link" accessibilityLabel={label} accessibilityState={{ selected: active }} style={({ pressed }) => row(active, pressed)}>
                  <Icon size={18} strokeWidth={1.7} color={colors.ink2} />
                  <Text style={[active ? type.bodyMedium : type.body, { color: active ? colors.ink : colors.ink2 }]}>{label}</Text>
                </Pressable>
              )
            })}
            <Pressable
              onPress={() => go('/settings')}
              accessibilityRole="link"
              accessibilityLabel="Settings"
              accessibilityState={{ selected: pathname === '/settings' }}
              style={({ pressed }) => row(pathname === '/settings', pressed)}
            >
              <Settings size={18} strokeWidth={1.7} color={colors.ink2} />
              <Text style={[type.body, { color: colors.ink2 }]}>Settings</Text>
            </Pressable>
            <View style={[styles.divider, { borderTopColor: colors.line, marginTop: spacing.sm, paddingTop: spacing.sm }]}>
              <Pressable
                onPress={() => go('/settings')}
                accessibilityRole="link"
                accessibilityLabel={`Sync: ${sync.label}`}
                accessibilityHint={sync.hint}
                style={({ pressed }) => row(false, pressed)}
              >
                {sync.level === 'ok' ? <Cloud size={16} strokeWidth={1.7} color={colors.ink2} /> : <CloudOff size={16} strokeWidth={1.7} color={colors.ink2} />}
                <Text style={[type.small, styles.grow, { color: colors.ink2 }]}>Sync</Text>
                <View style={[styles.dot, { backgroundColor: levelColor(colors, sync.level) }]} />
                <Text style={[type.chip, { color: colors.muted }]} numberOfLines={1}>
                  {sync.label}
                </Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  sheet: { borderTopLeftRadius: 16, borderTopRightRadius: 16, borderTopWidth: 1, maxHeight: '80%' },
  title: { height: 40, textAlignVertical: 'center' },
  row: { minHeight: 48, flexDirection: 'row', alignItems: 'center', borderWidth: 1 },
  divider: { borderTopWidth: 1 },
  grow: { flex: 1 },
  dot: { width: 6, height: 6, borderRadius: 3 },
})
