import { useEffect, type ReactNode } from 'react'
import type { StyleProp, ViewStyle } from 'react-native'
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSpring, withTiming } from 'react-native-reanimated'
import { RISE_PX, springs, STAGGER_MS, timings } from './springs'

/**
 * Fades its children in and lifts them 12 px on a spring when it mounts, `index × 40 ms` after the
 * screen opens, so a page's cards arrive one after another. With "remove animations" on, a plain fade.
 */
export function FadeInUp({ index = 0, children, style, testID }: { index?: number; children: ReactNode; style?: StyleProp<ViewStyle>; testID?: string }) {
  const reduced = useReducedMotion()
  const shown = useSharedValue(0)
  useEffect(() => {
    const delay = Math.min(index, 10) * STAGGER_MS
    shown.value = withDelay(delay, reduced ? withTiming(1, timings.fade) : withSpring(1, springs.gentle))
    // Only on mount: a card that is already in place does not enter again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const animated = useAnimatedStyle(() => ({
    opacity: Math.min(1, shown.value * 1.4),
    transform: [{ translateY: reduced ? 0 : (1 - shown.value) * RISE_PX }],
  }))
  return (
    <Animated.View testID={testID} style={[style, animated]}>
      {children}
    </Animated.View>
  )
}
