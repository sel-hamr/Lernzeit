import { useEffect } from 'react'
import Animated, { useAnimatedProps, useReducedMotion, useSharedValue, withDelay, withTiming } from 'react-native-reanimated'
import Svg, { Path } from 'react-native-svg'
import { timings } from './springs'

const AnimatedPath = Animated.createAnimatedComponent(Path)
/** The tick's path length in its 24-unit box (two strokes: 5.7 + 11.3). */
const LENGTH = 18

/** A check mark that draws itself, after `delay` ms. With "remove animations" on, it is just there. */
export function AnimatedCheck({ size = 56, color, stroke = 2.6, delay = 0 }: { size?: number; color: string; stroke?: number; delay?: number }) {
  const reduced = useReducedMotion()
  const drawn = useSharedValue(reduced ? 1 : 0)
  useEffect(() => {
    if (!reduced) drawn.value = withDelay(delay, withTiming(1, timings.draw))
  }, [reduced, delay, drawn])
  const props = useAnimatedProps(() => ({ strokeDashoffset: LENGTH * (1 - drawn.value) }))
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <AnimatedPath d="M6 12.5l4 4L18 8.5" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" fill="none" strokeDasharray={`${LENGTH} ${LENGTH}`} animatedProps={props} />
    </Svg>
  )
}
