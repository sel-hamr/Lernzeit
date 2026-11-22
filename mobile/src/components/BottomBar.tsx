import { phoneTabIds } from '@lernzeit/core/nav'
import type { Tabs } from 'expo-router'
import type { ComponentProps } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { enabledFeatureIds, featureById, useHiddenFeatures } from '../features'
import { useTheme } from '../theme'

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0]

/** The route (file) of a tab: the Today tab is the index. */
export const tabRoute = (id: string) => (id === 'today' ? 'index' : id)

/** The bottom bar: Today, Cards, Stories, Timer, with the web's active pill. A turned-off page is left out. */
export function BottomBar({ state, emitter, navigateToTab }: TabBarProps) {
  const { colors, spacing, fonts } = useTheme()
  const insets = useSafeAreaInsets()
  const ids = phoneTabIds(enabledFeatureIds(useHiddenFeatures()))
  const current = state.routes[state.index]

  return (
    <View accessibilityRole="tablist" style={[styles.bar, { backgroundColor: colors.sidebar, borderTopColor: colors.line, paddingBottom: insets.bottom }]}>
      {ids.map((id) => {
        const feature = featureById(id)
        const route = state.routes.find((r) => r.name === tabRoute(id))
        if (!feature || !route) return null
        const focused = current?.key === route.key
        const Icon = feature.icon
        const onPress = () => {
          const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true })
          if (!focused && !event.defaultPrevented) navigateToTab(route.key)
        }
        return (
          <Pressable
            key={id}
            onPress={onPress}
            accessibilityRole="tab"
            accessibilityLabel={feature.short}
            accessibilityState={{ selected: focused }}
            style={[styles.tab, { gap: spacing.xs }]}
          >
            <View style={[styles.pill, focused && { backgroundColor: colors.main, borderColor: colors.line }]}>
              <Icon size={19} strokeWidth={focused ? 1.9 : 1.7} color={focused ? colors.ink : colors.muted} />
            </View>
            <Text style={[styles.label, { fontFamily: fonts.medium, color: focused ? colors.ink : colors.muted }]}>{feature.short}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', borderTopWidth: 1 },
  tab: { flex: 1, minHeight: 60, alignItems: 'center', justifyContent: 'center' },
  pill: { width: 48, height: 28, borderRadius: 999, borderWidth: 1, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 11, lineHeight: 14 },
})
