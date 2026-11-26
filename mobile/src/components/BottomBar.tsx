import { phoneTabIds } from '@lernzeit/core/nav'
import type { Tabs } from 'expo-router'
import { Menu } from 'lucide-react-native'
import { useContext, useEffect, useState, type ComponentProps } from 'react'
import { StyleSheet, View } from 'react-native'
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, type SharedValue } from 'react-native-reanimated'
import { SafeAreaInsetsContext, useSafeAreaInsets } from 'react-native-safe-area-context'
import { enabledFeatureIds, featureById, type Feature } from '../features'
import { useHiddenFeatures } from '../features'
import { haptics, Pressable, springs } from '../motion'
import { useTheme } from '../theme'
import { MenuSheet } from './MenuSheet'
import { levelColor, useSyncIndicator } from './syncIndicator'

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0]

/** The route (file) of a tab: the Today tab is the index. */
export const tabRoute = (id: string) => (id === 'today' ? 'index' : id)

/** Bar padding around the pill. */
const INSET = 6
const BAR_HEIGHT = 64

/** How far the floating bar reaches up from the bottom edge, safe area included. */
export function tabBarHeight(bottomInset: number): number {
  return BAR_HEIGHT + 4 + Math.max(bottomInset, 8) + 4
}

/**
 * The bottom padding a tab page's scrolling content needs: the floating bar floats over the
 * page, so the last card has to clear it, with a little air.
 */
export function useTabBarSpace(extra = 24): number {
  // The context, not useSafeAreaInsets: a page rendered alone (in a test) has no provider.
  return tabBarHeight(useContext(SafeAreaInsetsContext)?.bottom ?? 0) + extra
}

/**
 * How wide tab `j` is while the pill sits at `pos` (a tab index, fractional while it slides): the
 * active tab is twice as wide as the others, so its label fits next to the icon. The weights always
 * add up to `count + 1`.
 */
export function tabWeight(j: number, pos: number): number {
  'worklet'
  return 1 + Math.max(0, 1 - Math.abs(pos - j))
}

/** The pill's left edge, in weight units, at `pos`: the widths of the tabs before it. */
export function pillStart(count: number, pos: number): number {
  'worklet'
  let start = 0
  for (let k = 0; k < count; k++) start += tabWeight(k, pos) * Math.max(0, Math.min(1, pos - k))
  return start
}

/**
 * The floating tab bar: a white bar inset from the screen edges, above the safe area, with the
 * pages scrolling under it (they pad their ends with `useTabBarSpace`). The active
 * tab is a lime-soft pill with its icon and word; the pill slides on a spring to the tab you pick.
 * A turned-off page is left out. The last slot is the Menu button (a button, not a tab: the pill
 * never lands on it); it opens the menu sheet and carries a dot while sync needs a look.
 */
export function BottomBar({ state, emitter, navigateToTab }: TabBarProps) {
  const { colors, radius, shadow } = useTheme()
  const insets = useSafeAreaInsets()
  const reduced = useReducedMotion()
  const ids = phoneTabIds(enabledFeatureIds(useHiddenFeatures()))
  const current = state.routes[state.index]
  const tabs = ids.flatMap((id) => {
    const feature = featureById(id)
    const route = state.routes.find((r) => r.name === tabRoute(id))
    return feature && route ? [{ id, feature, route }] : []
  })
  const active = Math.max(0, tabs.findIndex((t) => t.route.key === current?.key))
  const count = tabs.length
  const pos = useSharedValue(active)
  const [width, setWidth] = useState(0)
  const [menuOpen, setMenuOpen] = useState(false)
  const sync = useSyncIndicator()
  const needsLook = sync.level !== 'ok' && !sync.passing

  useEffect(() => {
    pos.value = reduced ? active : withSpring(active, springs.snappy)
  }, [active, reduced, pos])

  const pill = useAnimatedStyle(() => {
    const unit = width / (count + 2)
    return { left: INSET + pillStart(count, pos.value) * unit, width: unit * 2 }
  })

  return (
    <View pointerEvents="box-none" style={[styles.float, { paddingBottom: Math.max(insets.bottom, 8) + 4 }]}>
      <View accessibilityRole="tablist" style={[styles.bar, { backgroundColor: colors.card, borderRadius: radius.card }, shadow.float]} onLayout={(e) => setWidth(e.nativeEvent.layout.width - INSET * 2)}>
        {width > 0 && count > 0 ? <Animated.View pointerEvents="none" style={[styles.pill, { backgroundColor: colors.accentSoft }, pill]} /> : null}
        {tabs.map(({ id, feature, route }, j) => {
          const focused = j === active
          const onPress = () => {
            const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true })
            if (!focused && !event.defaultPrevented) {
              haptics.select()
              navigateToTab(route.key)
            }
          }
          return <Tab key={id} index={j} pos={pos} feature={feature} focused={focused} onPress={onPress} />
        })}
        <View style={[styles.slot, styles.menuSlot]}>
          <Pressable
            onPress={() => {
              haptics.select()
              setMenuOpen(true)
            }}
            scaleTo={0.94}
            accessibilityRole="button"
            accessibilityLabel={needsLook ? `Menu, Sync: ${sync.label}` : 'Menu'}
            style={styles.tab}
          >
            <View>
              <Menu size={20} strokeWidth={1.8} color={colors.muted} />
              {needsLook ? <View style={[styles.dot, { backgroundColor: levelColor(colors, sync.level), borderColor: colors.card }]} /> : null}
            </View>
          </Pressable>
        </View>
      </View>
      <MenuSheet open={menuOpen} onClose={() => setMenuOpen(false)} />
    </View>
  )
}

function Tab({ index, pos, feature, focused, onPress }: { index: number; pos: SharedValue<number>; feature: Feature; focused: boolean; onPress: () => void }) {
  const { colors, fonts } = useTheme()
  const Icon = feature.icon
  const grow = useAnimatedStyle(() => ({ flexGrow: tabWeight(index, pos.value) }))
  const label = useAnimatedStyle(() => ({ opacity: Math.max(0, 1 - Math.abs(pos.value - index) * 2) }))
  return (
    <Animated.View style={[styles.slot, grow]}>
      <Pressable onPress={onPress} scaleTo={0.94} accessibilityRole="tab" accessibilityLabel={feature.short} accessibilityState={{ selected: focused }} style={styles.tab}>
        <Icon size={20} strokeWidth={focused ? 2 : 1.8} color={focused ? colors.accentInk : colors.muted} />
        {focused ? (
          <Animated.Text numberOfLines={1} style={[styles.label, { fontFamily: fonts.semibold, color: colors.accentInk }, label]}>
            {feature.short}
          </Animated.Text>
        ) : null}
      </Pressable>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  float: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 12, paddingTop: 4 },
  bar: { height: BAR_HEIGHT, flexDirection: 'row', alignItems: 'stretch', paddingHorizontal: INSET },
  pill: { position: 'absolute', top: INSET, bottom: INSET, borderRadius: 999 },
  slot: { flexBasis: 0 },
  menuSlot: { flexGrow: 1 },
  dot: { position: 'absolute', top: -3, right: -4, width: 10, height: 10, borderRadius: 5, borderWidth: 2 },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 48 },
  label: { fontSize: 13, lineHeight: 17, flexShrink: 1 },
})
