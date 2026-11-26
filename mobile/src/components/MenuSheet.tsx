import { usePathname, useRouter, type Href } from 'expo-router'
import { Cloud, CloudOff, Settings, type LucideIcon } from 'lucide-react-native'
import { StyleSheet, View } from 'react-native'
import { menuFeatures, useHiddenFeatures } from '../features'
import { useTheme } from '../theme'
import { Row, Sheet, Tile } from '../ui'
import { levelColor, useSyncIndicator } from './syncIndicator'

/**
 * The phone's menu, a bottom sheet of large rows (icon, title, chevron): the pages that are not on
 * the tab bar, Settings and the sync status. It closes on Android back, a tap on the backdrop, a
 * drag down and navigation.
 */
export function MenuSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { colors, spacing, radius } = useTheme()
  const router = useRouter()
  const pathname = usePathname()
  const items = menuFeatures(useHiddenFeatures())
  const sync = useSyncIndicator()

  const go = (href: Href) => {
    onClose()
    router.push(href)
  }
  const link = (key: string, label: string, Icon: LucideIcon, href: Href, path: string) => {
    const active = pathname === path
    return (
      <View key={key} style={[styles.item, { borderRadius: radius.row, backgroundColor: active ? colors.raised : 'transparent', paddingHorizontal: spacing.md }]}>
        <Row
          title={label}
          left={
            <Tile bg={colors.raised}>
              <Icon size={20} strokeWidth={1.8} color={colors.ink} />
            </Tile>
          }
          chevron
          onPress={() => go(href)}
          accessibilityRole="link"
          accessibilityLabel={label}
        />
      </View>
    )
  }

  return (
    <Sheet testID="menu-sheet" open={open} onClose={onClose} title="Menu" closeLabel="Close menu">
      {items.map(({ id, label, icon }) => link(id, label, icon, `/more/${id}` as Href, `/more/${id}`))}
      {link('settings', 'Settings', Settings, '/settings', '/settings')}
      <View style={[styles.sync, { backgroundColor: colors.raised, borderRadius: radius.block, marginHorizontal: spacing.xs, marginTop: spacing.sm, paddingHorizontal: spacing.md }]}>
        <Row
          title="Sync"
          subtitle={sync.label}
          left={
            <Tile bg={colors.card}>{sync.level === 'ok' ? <Cloud size={20} strokeWidth={1.8} color={colors.ink} /> : <CloudOff size={20} strokeWidth={1.8} color={colors.ink} />}</Tile>
          }
          right={<View style={[styles.dot, { backgroundColor: levelColor(colors, sync.level) }]} />}
          onPress={() => go('/settings')}
          accessibilityRole="link"
          accessibilityLabel={`Sync: ${sync.label}`}
        />
      </View>
    </Sheet>
  )
}

const styles = StyleSheet.create({
  item: {},
  sync: {},
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: 4 },
})
