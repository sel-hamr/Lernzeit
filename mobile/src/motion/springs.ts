import type { WithSpringConfig, WithTimingConfig } from 'react-native-reanimated'
import { Easing } from 'react-native-reanimated'

/**
 * The app's springs, tuned from the spec's start (damping 18, stiffness 220). Every animation in the
 * app picks one of these, so the feel stays the same across screens.
 */
export const springs = {
  /** Cards rising in, bars and rings filling. */
  gentle: { damping: 18, stiffness: 220, mass: 1 },
  /** Press feedback (scale 0.97 and back). */
  press: { damping: 18, stiffness: 420, mass: 0.6 },
  /** The tab bar's pill, chips, small moves. */
  snappy: { damping: 20, stiffness: 300, mass: 0.8 },
  /** Bottom sheets sliding up. */
  sheet: { damping: 24, stiffness: 260, mass: 1 },
  /** A flashcard springing back to the middle, or up from the stack. */
  card: { damping: 16, stiffness: 200, mass: 0.9 },
  /** A flashcard turning over: quick, with a small settle at the end. */
  flip: { damping: 20, stiffness: 170, mass: 1 },
  /** A counter bumping when it goes up. */
  bump: { damping: 9, stiffness: 420, mass: 0.6 },
} as const satisfies Record<string, WithSpringConfig>

/** Short timings for things that should not bounce (fades, the flip's first half, a card flying off). */
export const timings = {
  fade: { duration: 180, easing: Easing.out(Easing.quad) },
  flipHalf: { duration: 130, easing: Easing.in(Easing.quad) },
  flyOff: { duration: 220, easing: Easing.in(Easing.quad) },
  draw: { duration: 520, easing: Easing.out(Easing.cubic) },
  /** Something leaving: quicker than it came. */
  fadeOut: { duration: 120, easing: Easing.in(Easing.quad) },
  /** A chunky button sinking into its lip, and coming back up. */
  pressDown: { duration: 50, easing: Easing.out(Easing.quad) },
  pressUp: { duration: 110, easing: Easing.out(Easing.quad) },
  /** The first half of a counter's bump, before the spring settles it. */
  bumpUp: { duration: 90, easing: Easing.out(Easing.quad) },
  /** The end-of-round ring sweeping round. */
  sweep: { duration: 900, easing: Easing.out(Easing.cubic) },
  /** One pass of a loading shimmer. */
  shimmer: { duration: 1100, easing: Easing.inOut(Easing.quad) },
  /** Tab pages cross-fading (React Navigation runs it; see transitions.ts). */
  tab: { duration: 220, easing: Easing.out(Easing.cubic) },
} as const satisfies Record<string, WithTimingConfig>

/** Entrance stagger between cards. */
export const STAGGER_MS = 40
/** How far a card rises when it enters. */
export const RISE_PX = 12
/** How far a tab page shifts sideways while it cross-fades. */
export const TAB_SHIFT_PX = 14
/** The end-of-round ring waits this long after the page opens. */
export const SWEEP_DELAY_MS = 150
