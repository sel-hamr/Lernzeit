import { phoneTabIds } from '@lernzeit/core/nav'
import type { Tabs } from 'expo-router'
import { useEffect, useState, type ComponentProps } from 'react'
import { StyleSheet, View } from 'react-native'
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, type SharedValue } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { enabledFeatureIds, featureById, type Feature } from '../features'
import { useHiddenFeatures } from '../features'
import { haptics, Pressable, springs } from '../motion'
import { useTheme } from '../theme'

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0]

/** The route (file) of a tab: the Today tab is the index. */
export const tabRoute = (id: string) => (id === 'today' ? 'index' : id)

/** Bar padding around the pill. */
const INSET = 6

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
 * The floating tab bar: a white bar inset from the screen edges, above the safe area. The active
 * tab is a lime-soft pill with its icon and word; the pill slides on a spring to the tab you pick.
 * A turned-off page is left out.
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

  useEffect(() => {
    pos.value = reduced ? active : withSpring(active, springs.snappy)
  }, [active, reduced, pos])

  const pill = useAnimatedStyle(() => {
    const unit = width / (count + 1)
    return { left: INSET + pillStart(count, pos.value) * unit, width: unit * 2 }
  })

  return (
    <View style={{ backgroundColor: colors.canvas, paddingHorizontal: 12, paddingTop: 4, paddingBottom: Math.max(insets.bottom, 8) + 4 }}>
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
      </View>
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
  bar: { height: 64, flexDirection: 'row', alignItems: 'stretch', paddingHorizontal: INSET },
  pill: { position: 'absolute', top: INSET, bottom: INSET, borderRadius: 999 },
  slot: { flexBasis: 0 },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 48 },
  label: { fontSize: 13, lineHeight: 17, flexShrink: 1 },
})
