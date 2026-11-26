import { useEffect } from 'react'
import { View, type StyleProp, type ViewStyle } from 'react-native'
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from 'react-native-reanimated'
import { useTheme } from '../theme'
import { springs, timings } from './springs'

/** 0..1, with anything that is not a number as 0. */
export const clamp01 = (value: number) => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0))

/**
 * A progress bar that fills from 0 to its value on mount and moves on a spring when the value
 * changes. `value` is 0..1. TalkBack reads it as a progress bar with its percent.
 */
export function AnimatedBar({ value, color, track, height = 8, label, style }: { value: number; color?: string; track?: string; height?: number; label?: string; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme()
  const reduced = useReducedMotion()
  const clamped = clamp01(value)
  const fill = useSharedValue(0)
  useEffect(() => {
    fill.value = reduced ? withTiming(clamped, timings.fade) : withSpring(clamped, { ...springs.gentle, overshootClamping: true })
  }, [clamped, reduced, fill])
  const animated = useAnimatedStyle(() => ({ width: `${fill.value * 100}%` }))
  return (
    <View
      accessible={!!label}
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }}
      style={[{ height, borderRadius: height / 2, backgroundColor: track ?? colors.track, overflow: 'hidden' }, style]}
    >
      <Animated.View style={[{ height: '100%', borderRadius: height / 2, backgroundColor: color ?? colors.accent }, animated]} />
    </View>
  )
}
