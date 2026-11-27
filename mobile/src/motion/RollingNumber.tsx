import { useEffect, useState } from 'react'
import { View, type StyleProp, type TextStyle } from 'react-native'
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from 'react-native-reanimated'
import { springs, timings } from './springs'

/**
 * A number (any short text) that rolls into place when it changes: the new value rises from below
 * inside a clipped line as it fades in. The first value just shows. It is always one text node, so
 * screen readers and tests read the plain value.
 */
export function RollingNumber({ value, style, testID, fit }: { value: string; style?: StyleProp<TextStyle>; testID?: string; /** One line, shrunk to fit a narrow tile ("1 h 05 min"). */ fit?: boolean }) {
  // The value shown when this mounted does not roll; every later one does.
  const [initial] = useState(value)
  return (
    <View style={{ overflow: 'hidden' }}>
      <Roll key={value} value={value} roll={value !== initial} style={style} testID={testID} fit={fit} />
    </View>
  )
}

function Roll({ value, roll, style, testID, fit }: { value: string; roll: boolean; style?: StyleProp<TextStyle>; testID?: string; fit?: boolean }) {
  const reduced = useReducedMotion()
  const shown = useSharedValue(roll ? 0 : 1)
  useEffect(() => {
    if (roll) shown.value = reduced ? withTiming(1, timings.fade) : withSpring(1, springs.snappy)
  }, [roll, reduced, shown])
  const animated = useAnimatedStyle(() => ({
    opacity: shown.value,
    transform: [{ translateY: reduced ? 0 : (1 - shown.value) * 18 }],
  }))
  return (
    <Animated.Text testID={testID} style={[style, animated]} numberOfLines={fit ? 1 : undefined} adjustsFontSizeToFit={fit} minimumFontScale={0.6}>
      {value}
    </Animated.Text>
  )
}
