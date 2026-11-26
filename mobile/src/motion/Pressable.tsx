import { forwardRef, type ComponentRef } from 'react'
import { Pressable as RNPressable, type GestureResponderEvent, type PressableProps as RNPressableProps, type StyleProp, type View, type ViewStyle } from 'react-native'
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from 'react-native-reanimated'
import { haptics, type HapticKind } from './haptics'
import { springs, timings } from './springs'

const AnimatedPressable = Animated.createAnimatedComponent(RNPressable)

export type PressableProps = Omit<RNPressableProps, 'style'> & {
  style?: StyleProp<ViewStyle>
  /** A haptic on press. */
  haptic?: HapticKind
  /** How far it shrinks while held; 0.97 by default, 1 for none. */
  scaleTo?: number
}

/**
 * Every tappable thing in the app: it shrinks to 0.97 on a spring while held and springs back on
 * release (no ripple). With "remove animations" on, it dims a little instead.
 */
export const Pressable = forwardRef<ComponentRef<typeof View>, PressableProps>(function Pressable({ style, haptic, scaleTo = 0.97, onPressIn, onPressOut, onPress, ...rest }, ref) {
  const reduced = useReducedMotion()
  const down = useSharedValue(0)
  const animated = useAnimatedStyle(() => (reduced ? { opacity: 1 - down.value * 0.25 } : { transform: [{ scale: 1 - (1 - scaleTo) * down.value }] }))
  const pressIn = (e: GestureResponderEvent) => {
    down.value = reduced ? withTiming(1, timings.fade) : withSpring(1, springs.press)
    onPressIn?.(e)
  }
  const pressOut = (e: GestureResponderEvent) => {
    down.value = reduced ? withTiming(0, timings.fade) : withSpring(0, springs.press)
    onPressOut?.(e)
  }
  const press = (e: GestureResponderEvent) => {
    if (haptic) haptics[haptic]()
    onPress?.(e)
  }
  return <AnimatedPressable ref={ref} {...rest} onPressIn={pressIn} onPressOut={pressOut} onPress={onPress ? press : undefined} style={[style, animated]} />
})
