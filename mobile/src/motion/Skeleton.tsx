import { useEffect, useId, useState, type ReactNode } from 'react'
import { StyleSheet, View, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native'
import Animated, { cancelAnimation, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated'
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg'
import { useTheme } from '../theme'
import { timings } from './springs'

/**
 * A grey block standing in for content that is on its way, with a soft light sweeping across it.
 * With "remove animations" on it stays still.
 */
export function SkeletonBlock({ width = '100%', height, radius = 12, style }: { width?: DimensionValue; height: number; radius?: number; style?: StyleProp<ViewStyle> }) {
  const { colors, scheme } = useTheme()
  const reduced = useReducedMotion()
  const id = useId()
  const [span, setSpan] = useState(0)
  const sweep = useSharedValue(0)
  useEffect(() => {
    if (reduced) return
    sweep.value = withRepeat(withTiming(1, timings.shimmer), -1, false)
    return () => cancelAnimation(sweep)
  }, [reduced, sweep])
  const band = useAnimatedStyle(() => ({ transform: [{ translateX: (sweep.value * 2 - 1) * span }] }))
  const light = scheme === 'dark' ? colors.lineStrong : colors.card
  return (
    <View onLayout={(e) => setSpan(e.nativeEvent.layout.width)} style={[{ width, height, borderRadius: radius, backgroundColor: colors.track, overflow: 'hidden' }, style]}>
      {span > 0 && !reduced ? (
        <Animated.View style={[StyleSheet.absoluteFill, band]}>
          <Svg width={span} height={height}>
            <Defs>
              <LinearGradient id={`shimmer-${id}`} x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0.2" stopColor={light} stopOpacity={0} />
                <Stop offset="0.5" stopColor={light} stopOpacity={0.7} />
                <Stop offset="0.8" stopColor={light} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width={span} height={height} fill={`url(#shimmer-${id})`} />
          </Svg>
        </Animated.View>
      ) : null}
    </View>
  )
}

/** A group of skeleton blocks, read out once as "Loading". */
export function Skeleton({ children, label = 'Loading', style, testID }: { children: ReactNode; label?: string; style?: StyleProp<ViewStyle>; testID?: string }) {
  return (
    <View testID={testID} accessible accessibilityRole="progressbar" accessibilityLabel={label} style={style}>
      {children}
    </View>
  )
}
