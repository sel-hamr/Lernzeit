import { useRouter } from 'expo-router'
import { Menu, Search } from 'lucide-react-native'
import { useState } from 'react'
import { Image, Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import mark from '../../assets/splash-icon.png'
import { useTheme } from '../theme'
import { MenuSheet } from './MenuSheet'
import { levelColor, useSyncIndicator } from './syncIndicator'

/** The phone's top bar: the Lernzeit mark and name, Search and the Menu. Nothing else, as on the web. */
export function TopBar() {
  const { colors, type, spacing } = useTheme()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const [menuOpen, setMenuOpen] = useState(false)
  const sync = useSyncIndicator()
  // The dot shows sync only while it needs a look.
  const needsLook = sync.level !== 'ok' && !sync.passing

  return (
    <View style={[styles.bar, { paddingTop: insets.top, backgroundColor: colors.sidebar, borderBottomColor: colors.line, paddingHorizontal: spacing.lg }]}>
      <View style={styles.row}>
        <View style={[styles.brand, { gap: spacing.sm }]}>
          <Image source={mark} style={styles.mark} accessibilityIgnoresInvertColors />
          <Text style={[type.brand, { color: colors.ink }]} accessibilityRole="header">
            Lernzeit
          </Text>
        </View>
        <View style={styles.actions}>
          <Pressable onPress={() => router.push('/search')} accessibilityRole="button" accessibilityLabel="Search" style={styles.button}>
            <Search size={19} strokeWidth={1.7} color={colors.ink2} />
          </Pressable>
          <Pressable
            onPress={() => setMenuOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={needsLook ? `Menu, Sync: ${sync.label}` : 'Menu'}
            accessibilityState={{ expanded: menuOpen }}
            style={styles.button}
          >
            <Menu size={20} strokeWidth={1.7} color={colors.ink2} />
            {needsLook ? <View style={[styles.badge, { backgroundColor: levelColor(colors, sync.level), borderColor: colors.sidebar }]} /> : null}
          </Pressable>
        </View>
      </View>
      <MenuSheet open={menuOpen} onClose={() => setMenuOpen(false)} />
    </View>
  )
}

const styles = StyleSheet.create({
  bar: { borderBottomWidth: 1 },
  row: { height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { flexDirection: 'row', alignItems: 'center' },
  mark: { width: 24, height: 24 },
  actions: { flexDirection: 'row', alignItems: 'center' },
  button: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: 10, right: 10, width: 10, height: 10, borderRadius: 5, borderWidth: 2 },
})
