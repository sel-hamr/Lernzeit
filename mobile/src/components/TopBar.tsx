import { dayKeyAt } from '@lernzeit/core/today'
import { formatLongDate } from '@lernzeit/core/time'
import { usePathname, useRouter } from 'expo-router'
import { Search } from 'lucide-react-native'
import { StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAccount } from '../account'
import { featureById } from '../features'
import { FadeInUp, Pressable } from '../motion'
import { useLiveQuery } from '../store/live'
import { useTheme } from '../theme'
import { useNow } from '../timer/hooks'
import { greeting, hourIn } from '../today/greeting'
import { IconButton } from '../ui'

/** The tab whose page is open: the path's first part, Today for the index. */
const tabOf = (pathname: string) => pathname.split('/').filter(Boolean)[0] ?? 'today'

/**
 * The tabs' header on the canvas: on Today the greeting by the hour and the date, on the other tabs
 * the page's name; a round Search button on the right. The menu lives in the bottom bar.
 */
export function TopBar() {
  const { colors, type, spacing } = useTheme()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const pathname = usePathname()
  const account = useAccount()
  const zone = useLiveQuery(['kv'], (library) => {
    const value = library.get<{ value?: unknown }>('kv', 'timeZone')?.value
    return typeof value === 'string' && value ? value : undefined
  }, [])
  // The greeting and the date move on by themselves; a minute is close enough.
  const now = useNow(true, 60_000)

  const tab = tabOf(pathname)
  const today = tab === 'today'
  const title = today ? greeting(hourIn(now, zone)) : (featureById(tab)?.label ?? '')
  const initial = account?.email.trim()[0]?.toUpperCase()

  return (
    <View style={{ paddingTop: insets.top + spacing.sm, paddingHorizontal: spacing.pageX, paddingBottom: spacing.md, backgroundColor: colors.canvas }}>
      <View style={[styles.row, { gap: spacing.md }]}>
        {today && initial ? (
          <Pressable onPress={() => router.push('/settings')} accessibilityRole="button" accessibilityLabel="Account and settings" scaleTo={0.92} style={[styles.avatar, { backgroundColor: colors.accent }]}>
            <Text style={[type.section, { color: colors.onAccent }]}>{initial}</Text>
          </Pressable>
        ) : null}
        <FadeInUp key={title} style={styles.grow}>
          <Text testID="page-title" accessibilityRole="header" numberOfLines={1} style={[today ? type.section : type.title, { color: colors.ink }, today && styles.greeting]}>
            {title}
          </Text>
          {today ? (
            <Text style={[type.small, { color: colors.muted }]} numberOfLines={1}>
              {formatLongDate(dayKeyAt(now, zone))}
            </Text>
          ) : null}
        </FadeInUp>
        <IconButton icon={Search} label="Search" onPress={() => router.push('/search')} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  row: { minHeight: 48, flexDirection: 'row', alignItems: 'center' },
  grow: { flex: 1 },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  greeting: { fontSize: 19, lineHeight: 25, letterSpacing: -0.3 },
})
