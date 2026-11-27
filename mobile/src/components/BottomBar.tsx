import { phoneTabIds } from '@lernzeit/core/nav'
import type { Tabs } from 'expo-router'
import { Menu } from 'lucide-react-native'
import { useContext, useEffect, useState, type ComponentProps } from 'react'
import { Pressable as RNPressable, StyleSheet, View } from 'react-native'
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming, type SharedValue } from 'react-native-reanimated'
import { SafeAreaInsetsContext, useSafeAreaInsets } from 'react-native-safe-area-context'
import { enabledFeatureIds, featureById, type Feature } from '../features'
import { useHiddenFeatures } from '../features'
import { haptics, Pressable, springs, timings } from '../motion'
import { useTheme } from '../theme'
import { MenuSheet } from './MenuSheet'
import { levelColor, useSyncIndicator } from './syncIndicator'

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0]

/** The route (file) of a tab: the Today tab is the index. */
export const tabRoute = (id: string) => (id === 'today' ? 'index' : id)

/** Bar padding around the pill. */
const INSET = 6
const BAR_HEIGHT = 64
/** The bar's words never grow past this with large system text: the pill has a fixed width. */
const MAX_FONT_SCALE = 1.2

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

/** The middle of tab `j`, in weight units from the bar's inner left edge, while the pill sits at `pos`. */
export function tabCenter(j: number, pos: number): number {
  'worklet'
  let start = 0
  for (let k = 0; k < j; k++) start += tabWeight(k, pos)
  return start + tabWeight(j, pos) / 2
}

/**
 * The floating tab bar: a white bar inset from the screen edges, above the safe area, with the
 * pages scrolling under it (they pad their ends with `useTabBarSpace`). The active
 * tab is a lime-soft pill with its icon and word; the pill slides on a spring to the tab you pick.
 * A turned-off page is left out. The last slot is the Menu button (a button, not a tab: the pill
 * never lands on it); it opens the menu sheet and carries a dot while sync needs a look.
 *
 * Everything that moves moves by `translateX` on the UI thread, never by width or position: the
 * pill is always two units wide, and each tab's icon and word sit in a two-unit box centred where
 * its tab is at that moment. The taps land on a still row of slots on top, laid out once per change.
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
  // The tab under a finger (-1 for none) and how far it is pressed in.
  const pressed = useSharedValue(-1)
  const down = useSharedValue(0)
  const [width, setWidth] = useState(0)
  const [menuOpen, setMenuOpen] = useState(false)
  const sync = useSyncIndicator()
  const needsLook = sync.level !== 'ok' && !sync.passing
  const unit = width / (count + 2)

  useEffect(() => {
    pos.value = reduced ? active : withSpring(active, springs.snappy)
  }, [active, reduced, pos])

  const pill = useAnimatedStyle(() => ({ transform: [{ translateX: pillStart(count, pos.value) * unit }] }))

  const press = (j: number, inward: boolean) => {
    if (inward) pressed.value = j
    down.value = reduced ? withTiming(inward ? 1 : 0, timings.fade) : withSpring(inward ? 1 : 0, springs.press)
  }

  return (
    <View pointerEvents="box-none" style={[styles.float, { paddingBottom: Math.max(insets.bottom, 8) + 4 }]}>
      <View style={[styles.bar, { backgroundColor: colors.card, borderRadius: radius.card }, shadow.float]} onLayout={(e) => setWidth(e.nativeEvent.layout.width - INSET * 2)}>
        {width > 0 && count > 0 ? (
          <View pointerEvents="none" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={StyleSheet.absoluteFill}>
            <Animated.View style={[styles.pill, { width: unit * 2, backgroundColor: colors.accentSoft }, pill]} />
            {tabs.map(({ id, feature }, j) => (
              <TabFace key={id} index={j} pos={pos} unit={unit} pressed={pressed} down={down} reduced={reduced} feature={feature} focused={j === active} />
            ))}
          </View>
        ) : null}
        <View accessibilityRole="tablist" style={styles.slots}>
          {tabs.map(({ id, feature, route }, j) => {
            const focused = j === active
            const onPress = () => {
              const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true })
              if (!focused && !event.defaultPrevented) {
                haptics.select()
                navigateToTab(route.key)
              }
            }
            return (
              <RNPressable
                key={id}
                onPress={onPress}
                onPressIn={() => press(j, true)}
                onPressOut={() => press(j, false)}
                accessibilityRole="tab"
                accessibilityLabel={feature.short}
                accessibilityState={{ selected: focused }}
                style={[styles.slot, { flexGrow: focused ? 2 : 1 }]}
              />
            )
          })}
          <View style={[styles.slot, { flexGrow: 1 }]}>
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
      </View>
      <MenuSheet open={menuOpen} onClose={() => setMenuOpen(false)} />
    </View>
  )
}

/** What a tab shows (its icon, and its word while active), moved to where the tab is right now. */
function TabFace({ index, pos, unit, pressed, down, reduced, feature, focused }: { index: number; pos: SharedValue<number>; unit: number; pressed: SharedValue<number>; down: SharedValue<number>; reduced: boolean; feature: Feature; focused: boolean }) {
  const { colors, fonts } = useTheme()
  const Icon = feature.icon
  const place = useAnimatedStyle(() => {
    const held = pressed.value === index ? down.value : 0
    return {
      opacity: reduced ? 1 - held * 0.25 : 1,
      transform: [{ translateX: (tabCenter(index, pos.value) - 1) * unit }, { scale: reduced ? 1 : 1 - held * 0.06 }],
    }
  })
  const label = useAnimatedStyle(() => ({ opacity: Math.max(0, 1 - Math.abs(pos.value - index) * 2) }))
  return (
    <Animated.View style={[styles.face, { width: unit * 2 }, place]}>
      <Icon size={20} strokeWidth={focused ? 2 : 1.8} color={focused ? colors.accentInk : colors.muted} />
      {focused ? (
        <Animated.Text numberOfLines={1} maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.label, { fontFamily: fonts.semibold, color: colors.accentInk }, label]}>
          {feature.short}
        </Animated.Text>
      ) : null}
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  float: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 12, paddingTop: 4 },
  bar: { height: BAR_HEIGHT, paddingHorizontal: INSET },
  pill: { position: 'absolute', left: INSET, top: INSET, bottom: INSET, borderRadius: 999 },
  face: { position: 'absolute', left: INSET, top: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 10 },
  slots: { flex: 1, flexDirection: 'row', alignItems: 'stretch' },
  slot: { flexBasis: 0, minHeight: 48 },
  dot: { position: 'absolute', top: -3, right: -4, width: 10, height: 10, borderRadius: 5, borderWidth: 2 },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 48 },
  label: { fontSize: 13, lineHeight: 17, flexShrink: 1 },
})
