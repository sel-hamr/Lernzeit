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
} as const satisfies Record<string, WithTimingConfig>

/** Entrance stagger between cards. */
export const STAGGER_MS = 40
/** How far a card rises when it enters. */
export const RISE_PX = 12
