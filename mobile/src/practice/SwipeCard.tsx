import type { Grade } from '@lernzeit/core/types'
import { forwardRef, useEffect, useImperativeHandle, useState, type ReactNode } from 'react'
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler'
import Animated, { interpolate, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming, type SharedValue } from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'
import { haptics, springs, timings } from '../motion'
import { useTheme } from '../theme'
import { FLING_SECONDS, flyDuration, flyTarget, leanFor, ratingForSwipe, tiltFor } from './swipe'

export interface SwipeCardHandle {
  /** Sends the card off for this rating, then runs `then`. */
  fly: (grade: Grade, then: () => void) => void
}

/** The drag's pull toward each side, 0..1, for the counters beside the card. */
export interface SwipePull {
  again: SharedValue<number>
  good: SharedValue<number>
}

/** Room under the card for the two ghost cards of the stack. */
const STACK_ROOM = 24
/** The ghost cards: a little smaller, lower and fainter each. */
const GHOSTS = [
  { scale: 0.95, drop: 12, opacity: 0.75 },
  { scale: 0.9, drop: 24, opacity: 0.45 },
]
/** A drag this far up or down activates (or, with scrolling content, cancels) the swipe. */
const VERTICAL: [number, number] = [-14, 14]
/** Before the flip, a drag this far turns the card over instead of rating it. */
const FLIP_DRAG = 28
const RADIUS = 32

/**
 * The practice card. It springs up from the stack when it arrives and turns over in 3D when
 * `flipped` becomes true. Before that a swipe only turns it (when `onFlip` is given), so every
 * rating comes after seeing the answer. Once turned it follows the finger, tilts up to 12°, its
 * edge tints and a stamp ("Good", "Again", "Easy") fades in; past the threshold it flies off with
 * the fling's speed and rates, short of it it springs back. With "remove animations" on it
 * cross-fades instead.
 */
export const SwipeCard = forwardRef<
  SwipeCardHandle,
  { front: ReactNode; back: ReactNode; flipped: boolean; behind: number; onRate: (grade: Grade) => void; onFlip?: () => void; pull?: SwipePull }
>(function SwipeCard({ front, back, flipped, behind, onRate, onFlip, pull }, ref) {
  const { colors, topics, shadow, fonts } = useTheme()
  const reduced = useReducedMotion()
  const { width, height } = useWindowDimensions()
  const thresholds = { x: Math.min(120, width * 0.28), y: 110 }
  const x = useSharedValue(0)
  const y = useSharedValue(0)
  const turn = useSharedValue(flipped ? 180 : 0)
  const open = useSharedValue(flipped ? 1 : 0)
  const enter = useSharedValue(reduced ? 1 : 0)
  const gone = useSharedValue(0)
  const armed = useSharedValue(0)
  const [boxes, setBoxes] = useState({ front: false, back: false })
  // Long content scrolls inside the face; then only sideways swipes rate.
  const scrollable = flipped ? boxes.back : boxes.front

  useEffect(() => {
    enter.value = reduced ? withTiming(1, timings.fade) : withSpring(1, springs.card)
  }, [reduced, enter])

  useEffect(() => {
    open.value = flipped ? 1 : 0
    const to = flipped ? 180 : 0
    turn.value = reduced ? withTiming(to, timings.fade) : withSpring(to, springs.flip)
  }, [flipped, reduced, turn, open])

  const settle = () => {
    'worklet'
    if (pull) {
      pull.again.set(withTiming(0, timings.fade))
      pull.good.set(withTiming(0, timings.fade))
    }
  }

  const send = (grade: Grade, velocity: number, then: (grade: Grade) => void) => {
    'worklet'
    settle()
    if (reduced) {
      gone.value = withTiming(1, timings.fade, (done) => {
        if (done) scheduleOnRN(then, grade)
      })
      return
    }
    const to = flyTarget(grade, width, height)
    const duration = flyDuration(Math.hypot(to.x - x.value, to.y - y.value), velocity)
    x.set(withTiming(to.x, { duration }))
    y.value = withTiming(to.y, { duration }, (done) => {
      if (done) scheduleOnRN(then, grade)
    })
  }

  useImperativeHandle(ref, () => ({ fly: (grade, then) => send(grade, 0, () => then()) }))

  const buzz = () => haptics.select()
  const rate = (grade: Grade) => onRate(grade)
  const flip = () => onFlip?.()
  const canFlip = !!onFlip

  const pan = usePanGesture({
    activeOffsetX: [-14, 14],
    activeOffsetY: scrollable ? undefined : VERTICAL,
    failOffsetY: scrollable ? VERTICAL : undefined,
    onUpdate: (e) => {
      'worklet'
      if (!open.value) {
        // Not turned yet: the card gives a little, then turns over when let go.
        x.set(e.translationX * 0.3)
        y.set(e.translationY * 0.2)
        return
      }
      x.set(e.translationX)
      // Down rates nothing: the card only gives a little that way.
      y.set(e.translationY > 0 ? e.translationY * 0.25 : e.translationY)
      const lean = leanFor(x.value, y.value, thresholds)
      if (pull) {
        pull.again.set(lean.again)
        pull.good.set(Math.max(lean.good, lean.easy))
      }
      const r = ratingForSwipe(x.value, y.value, thresholds) ?? 0
      if (r !== armed.value) {
        armed.value = r
        if (r) scheduleOnRN(buzz)
      }
    },
    onDeactivate: (e) => {
      'worklet'
      armed.value = 0
      if (!open.value) {
        x.set(withSpring(0, springs.card))
        y.set(withSpring(0, springs.card))
        if (canFlip && Math.max(Math.abs(e.translationX), Math.abs(e.translationY)) > FLIP_DRAG) scheduleOnRN(flip)
        return
      }
      const r = ratingForSwipe(x.value + e.velocityX * FLING_SECONDS, y.value + Math.min(0, e.velocityY) * FLING_SECONDS, thresholds)
      if (r === null) {
        settle()
        x.set(withSpring(0, springs.card))
        y.set(withSpring(0, springs.card))
        return
      }
      send(r, Math.hypot(e.velocityX, e.velocityY), rate)
    },
  })

  const card = useAnimatedStyle(() => ({
    opacity: interpolate(enter.value, [0, 1], [GHOSTS[0]!.opacity, 1]) * (1 - gone.value),
    transform: [
      { translateX: x.value },
      { translateY: y.value + (1 - enter.value) * GHOSTS[0]!.drop },
      { scale: interpolate(enter.value, [0, 1], [GHOSTS[0]!.scale, 1]) },
      { rotateZ: `${reduced ? 0 : tiltFor(x.value, width)}deg` },
    ],
  }))
  // A real flip: each face turns on its own, its back hidden; the opacity switch at the edge keeps Android honest.
  const frontFace = useAnimatedStyle(() =>
    reduced ? { opacity: 1 - turn.value / 180 } : { opacity: turn.value < 90 ? 1 : 0, transform: [{ perspective: 1200 }, { rotateY: `${turn.value}deg` }] },
  )
  const backFace = useAnimatedStyle(() =>
    reduced ? { opacity: turn.value / 180 } : { opacity: turn.value >= 90 ? 1 : 0, transform: [{ perspective: 1200 }, { rotateY: `${turn.value - 180}deg` }] },
  )
  const lean = (pick: 'good' | 'again' | 'easy') => {
    'worklet'
    return leanFor(x.value, y.value, thresholds)[pick]
  }
  const goodEdge = useAnimatedStyle(() => ({ opacity: lean('good') }))
  const againEdge = useAnimatedStyle(() => ({ opacity: lean('again') }))
  const easyEdge = useAnimatedStyle(() => ({ opacity: lean('easy') }))
  const stamp = (pick: 'good' | 'again' | 'easy', tilt: number) => {
    'worklet'
    const v = lean(pick)
    return { opacity: v, transform: [{ rotateZ: `${tilt}deg` }, { scale: interpolate(v, [0, 1], [0.8, 1]) }] }
  }
  const goodStamp = useAnimatedStyle(() => stamp('good', -10))
  const againStamp = useAnimatedStyle(() => stamp('again', 10))
  const easyStamp = useAnimatedStyle(() => stamp('easy', 0))
  // The card behind comes forward as this one is dragged away.
  const next = useAnimatedStyle(() => {
    const p = Math.min(1, Math.max(Math.abs(x.value) / thresholds.x, -y.value / thresholds.y, gone.value, 0))
    const g = GHOSTS[0]!
    return { opacity: interpolate(p, [0, 1], [g.opacity, 1]), transform: [{ translateY: g.drop * (1 - p) }, { scale: interpolate(p, [0, 1], [g.scale, 1]) }] }
  })

  const green = topics.sage
  const edge = (color: string, wash: string, style: object) => (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.edge, { borderColor: color, backgroundColor: wash }, style]} />
  )
  const stampView = (label: string, color: string, style: object, place: object) => (
    <Animated.View pointerEvents="none" style={[styles.stamp, { borderColor: color, backgroundColor: colors.card }, place, style]}>
      <Text style={{ fontFamily: fonts.semibold, fontSize: 22, lineHeight: 28, color }}>{label}</Text>
    </Animated.View>
  )
  const face = (which: 'front' | 'back', children: ReactNode, style: object) => (
    <Animated.View style={[StyleSheet.absoluteFill, styles.face, { backgroundColor: colors.card }, shadow.float, style]} pointerEvents={(which === 'back') === flipped ? 'auto' : 'none'} importantForAccessibility={(which === 'back') === flipped ? 'auto' : 'no-hide-descendants'}>
      <Face onScrollable={(s) => setBoxes((b) => (b[which] === s ? b : { ...b, [which]: s }))}>{children}</Face>
      {which === 'back' ? (
        <>
          {edge(green.dot, 'rgba(95, 143, 78, 0.06)', goodEdge)}
          {edge(colors.danger, 'rgba(229, 72, 77, 0.06)', againEdge)}
          {edge(colors.accent, 'rgba(212, 242, 74, 0.14)', easyEdge)}
          {stampView('Good', green.ink, goodStamp, styles.stampLeft)}
          {stampView('Again', colors.dangerInk, againStamp, styles.stampRight)}
          {stampView('Easy', colors.accentInk, easyStamp, styles.stampCenter)}
        </>
      ) : null}
    </Animated.View>
  )

  return (
    <View style={styles.area}>
      {GHOSTS.slice(0, Math.min(2, behind))
        .map((g, i) => (
          <Animated.View
            key={i}
            pointerEvents="none"
            style={[styles.ghost, { backgroundColor: colors.card, opacity: g.opacity, transform: [{ translateY: g.drop }, { scale: g.scale }] }, shadow.card, i === 0 ? next : null]}
          />
        ))
        .reverse()}
      <GestureDetector gesture={pan}>
        <Animated.View style={[styles.card, card]}>
          {face('front', front, frontFace)}
          {face('back', back, backFace)}
        </Animated.View>
      </GestureDetector>
    </View>
  )
})

/** One side of the card: its content scrolls when it is longer than the card. */
function Face({ children, onScrollable }: { children: ReactNode; onScrollable: (scrollable: boolean) => void }) {
  const [box, setBox] = useState({ view: 0, content: 0 })
  const scrollable = box.content > box.view + 1
  useEffect(() => onScrollable(scrollable), [scrollable, onScrollable])
  return (
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
  )
}

const styles = StyleSheet.create({
  area: { flex: 1, marginBottom: STACK_ROOM },
  ghost: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: RADIUS, transformOrigin: 'bottom' },
  card: { flex: 1 },
  face: { borderRadius: RADIUS, overflow: 'hidden', backfaceVisibility: 'hidden' },
  content: { flexGrow: 1, padding: 20 },
  edge: { borderRadius: RADIUS, borderWidth: 4, opacity: 0 },
  stamp: { position: 'absolute', top: 22, borderWidth: 2.5, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 4, opacity: 0 },
  stampLeft: { left: 22 },
  stampRight: { right: 22 },
  stampCenter: { alignSelf: 'center' },
})
