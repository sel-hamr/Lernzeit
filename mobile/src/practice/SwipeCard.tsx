import type { Grade } from '@lernzeit/core/types'
import { forwardRef, useEffect, useImperativeHandle, useState, type ReactNode } from 'react'
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler'
import Animated, { interpolate, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'
import { haptics, springs, timings } from '../motion'
import { useTheme } from '../theme'
import { FLING_SECONDS, flyTarget, ratingForSwipe } from './swipe'

export interface SwipeCardHandle {
  /** Turns the card over (rotateY); `then` runs at the edge, where the content swaps. */
  flip: (then: () => void) => void
  /** Sends the card off for this rating, then runs `then`. */
  fly: (grade: Grade, then: () => void) => void
}

/** The stack behind the card: up to two edges peek out above it. */
const TOP = 24
/** A drag this far up or down activates (or, with scrolling content, cancels) the swipe. */
const VERTICAL: [number, number] = [-14, 14]
const STACK = [
  { inset: 14, lift: 10, opacity: 0.7 },
  { inset: 28, lift: 20, opacity: 0.4 },
]

/**
 * The practice card: it rises from the stack when it arrives, turns over when flipped, and once
 * the answer shows it can be swiped. It tilts with the drag while a tint and a word ("Good",
 * "Again", "Easy") fade in; past the threshold it flies off and rates, short of it it springs back.
 * With "remove animations" on, it just swaps.
 */
export const SwipeCard = forwardRef<SwipeCardHandle, { children: ReactNode; canSwipe: boolean; behind: number; onRate: (grade: Grade) => void }>(function SwipeCard({ children, canSwipe, behind, onRate }, ref) {
  const { colors, type, radius, shadow, fonts } = useTheme()
  const reduced = useReducedMotion()
  const { width, height } = useWindowDimensions()
  const thresholds = { x: Math.min(120, width * 0.28), y: 110 }
  const x = useSharedValue(0)
  const y = useSharedValue(0)
  const turn = useSharedValue(0)
  const enter = useSharedValue(reduced ? 1 : 0)
  const armed = useSharedValue(0)
  const [box, setBox] = useState({ view: 0, content: 0 })
  // Long content scrolls inside the card; then only sideways swipes rate.
  const scrollable = box.content > box.view + 1

  useEffect(() => {
    if (!reduced) enter.value = withSpring(1, springs.card)
  }, [reduced, enter])

  const fly = (grade: Grade, then: () => void) => {
    if (reduced) return then()
    const to = flyTarget(grade, width, height)
    x.value = withTiming(to.x, timings.flyOff)
    y.value = withTiming(to.y, timings.flyOff, (done) => {
      if (done) scheduleOnRN(then)
    })
  }

  useImperativeHandle(ref, () => ({
    flip: (then) => {
      if (reduced) return then()
      turn.value = withTiming(90, timings.flipHalf, (done) => {
        if (done) scheduleOnRN(afterHalf, then)
      })
    },
    fly,
  }))

  // The far side: the content has swapped, so turn the rest of the way from the other edge.
  const afterHalf = (then: () => void) => {
    then()
    turn.value = -90
    turn.value = withSpring(0, springs.card)
  }

  const buzz = () => haptics.select()
  const rate = (grade: Grade) => {
    haptics.tap()
    onRate(grade)
  }

  const pan = usePanGesture({
    enabled: canSwipe,
    activeOffsetX: [-14, 14],
    activeOffsetY: scrollable ? undefined : VERTICAL,
    failOffsetY: scrollable ? VERTICAL : undefined,
    onUpdate: (e) => {
      'worklet'
      x.value = e.translationX
      // Down rates nothing: the card only gives a little that way.
      y.value = e.translationY > 0 ? e.translationY * 0.25 : e.translationY
      const r = ratingForSwipe(x.value, y.value, thresholds) ?? 0
      if (r !== armed.value) {
        armed.value = r
        if (r) scheduleOnRN(buzz)
      }
    },
    onDeactivate: (e) => {
      'worklet'
      const r = ratingForSwipe(x.value + e.velocityX * FLING_SECONDS, y.value + Math.min(0, e.velocityY) * FLING_SECONDS, thresholds)
      armed.value = 0
      if (r === null) {
        x.value = withSpring(0, springs.card)
        y.value = withSpring(0, springs.card)
        return
      }
      const to = flyTarget(r, width, height)
      x.value = withTiming(to.x, timings.flyOff)
      y.value = withTiming(to.y, timings.flyOff, (done) => {
        if (done) scheduleOnRN(rate, r)
      })
    },
  })

  const card = useAnimatedStyle(() => ({
    opacity: Math.min(1, enter.value * 1.6),
    transform: [
      { perspective: 1200 },
      { translateX: x.value },
      { translateY: y.value + (1 - enter.value) * -STACK[0]!.lift },
      { scale: interpolate(enter.value, [0, 1], [0.94, 1]) },
      { rotateZ: `${(x.value / width) * 14}deg` },
      { rotateY: `${turn.value}deg` },
    ],
  }))
  const good = useAnimatedStyle(() => ({ opacity: Math.max(0, Math.min(1, x.value / thresholds.x)) * (-y.value > Math.abs(x.value) ? 0 : 1) }))
  const again = useAnimatedStyle(() => ({ opacity: Math.max(0, Math.min(1, -x.value / thresholds.x)) * (-y.value > Math.abs(x.value) ? 0 : 1) }))
  const easy = useAnimatedStyle(() => ({ opacity: -y.value > Math.abs(x.value) ? Math.max(0, Math.min(1, -y.value / thresholds.y)) : 0 }))
  // The card behind comes forward a little as this one is dragged away.
  const next = useAnimatedStyle(() => {
    const p = Math.min(1, Math.max(Math.abs(x.value) / thresholds.x, -y.value / thresholds.y, 0))
    return { transform: [{ translateY: STACK[0]!.lift * p }, { scaleX: interpolate(p, [0, 1], [1, 1.04]) }] }
  })

  const tint = (label: string, wash: string, pill: string, ink: string, style: object, align: 'flex-start' | 'flex-end' | 'center') => (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.tint, { borderRadius: radius.card, backgroundColor: wash, alignItems: align }, style]}>
      <View style={[styles.tintLabel, { backgroundColor: pill, borderRadius: radius.pill }]}>
        <Text style={[type.button, { color: ink, fontFamily: fonts.semibold }]}>{label}</Text>
      </View>
    </Animated.View>
  )

  return (
    <View style={styles.area}>
      {STACK.slice(0, Math.min(2, behind))
        .map((layer, i) => (
          <Animated.View
            key={i}
            pointerEvents="none"
            style={[styles.layer, { left: layer.inset, right: layer.inset, top: TOP - layer.lift, backgroundColor: colors.card, opacity: layer.opacity, borderRadius: radius.card }, i === 0 ? next : null]}
          />
        ))
        .reverse()}
      <GestureDetector gesture={pan}>
        <Animated.View style={[styles.card, { backgroundColor: colors.card, borderRadius: radius.card, marginTop: TOP }, shadow.float, card]}>
          <ScrollView
            scrollEnabled={scrollable}
            showsVerticalScrollIndicator={scrollable}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.content}
            onLayout={(e) => {
              const view = e.nativeEvent.layout.height
              setBox((b) => (b.view === view ? b : { ...b, view }))
            }}
            onContentSizeChange={(_, content) => setBox((b) => (b.content === content ? b : { ...b, content }))}
          >
            {children}
          </ScrollView>
          {tint('Good', 'rgba(212, 242, 74, 0.42)', colors.accent, colors.onAccent, good, 'flex-start')}
          {tint('Again', 'rgba(229, 72, 77, 0.2)', colors.danger, '#FFFFFF', again, 'flex-end')}
          {tint('Easy', 'rgba(212, 242, 74, 0.42)', colors.accent, colors.onAccent, easy, 'center')}
        </Animated.View>
      </GestureDetector>
    </View>
  )
})

const styles = StyleSheet.create({
  area: { flex: 1 },
  layer: { position: 'absolute', height: 60 },
  card: { flex: 1, overflow: 'hidden' },
  content: { flexGrow: 1, padding: 16, gap: 14 },
  tint: { padding: 20, opacity: 0 },
  tintLabel: { paddingHorizontal: 16, paddingVertical: 8 },
})
