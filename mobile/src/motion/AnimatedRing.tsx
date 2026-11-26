import { useEffect, type ReactNode } from 'react'
import { View } from 'react-native'
import Animated, { useAnimatedProps, useReducedMotion, useSharedValue, withSpring, withTiming } from 'react-native-reanimated'
import Svg, { Circle } from 'react-native-svg'
import { useTheme } from '../theme'
import { clamp01 } from './AnimatedBar'
import { springs, timings } from './springs'

const AnimatedCircle = Animated.createAnimatedComponent(Circle)

/** A round progress ring (0..1) that fills on mount and on change, with anything in its middle. */
export function AnimatedRing({ value, size = 200, stroke = 14, color, track, children, label }: { value: number; size?: number; stroke?: number; color?: string; track?: string; children?: ReactNode; label?: string }) {
  const { colors } = useTheme()
  const reduced = useReducedMotion()
  const clamped = clamp01(value)
  const r = (size - stroke) / 2
  const length = 2 * Math.PI * r
  const fill = useSharedValue(0)
  useEffect(() => {
    fill.value = reduced ? withTiming(clamped, timings.fade) : withSpring(clamped, { ...springs.gentle, overshootClamping: true })
  }, [clamped, reduced, fill])
  const props = useAnimatedProps(() => ({ strokeDashoffset: length * (1 - fill.value) }))
  return (
    <View
      accessible={!!label}
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }}
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
    >
      <Svg width={size} height={size} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={track ?? colors.track} strokeWidth={stroke} fill="none" />
        <AnimatedCircle cx={size / 2} cy={size / 2} r={r} stroke={color ?? colors.accent} strokeWidth={stroke} fill="none" strokeLinecap="round" strokeDasharray={`${length} ${length}`} animatedProps={props} />
      </Svg>
      {children}
    </View>
  )
}
