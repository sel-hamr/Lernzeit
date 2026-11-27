import { useEffect } from 'react'
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSpring, withTiming } from 'react-native-reanimated'
import { springs, STAGGER_MS, timings } from './springs'

/**
 * A vertical bar in a chart column that grows up from the bottom on mount and moves on a spring
 * when its value changes. It is always `max` tall and slides with `translateY` inside its track
 * (which clips it), so it never asks for a layout pass and its rounded top stays round.
 * `value` is in px, 0..max. With "remove animations" on it is just there.
 */
export function GrowBar({ value, max, color, radius = 8, opacity = 1, index = 0 }: { value: number; max: number; color: string; radius?: number; opacity?: number; index?: number }) {
  const reduced = useReducedMotion()
  const shown = useSharedValue(reduced ? value : 0)
  useEffect(() => {
    shown.value = reduced ? withTiming(value, timings.fade) : withDelay(Math.min(index, 10) * STAGGER_MS, withSpring(value, { ...springs.gentle, overshootClamping: true }))
  }, [value, reduced, index, shown])
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: max - shown.value }] }))
  return <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, right: 0, bottom: 0, height: max, borderRadius: radius, backgroundColor: color, opacity }, style]} />
}
