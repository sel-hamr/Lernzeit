import type { Grade } from '@lernzeit/core/types'

/** How far a card must be dragged before letting go rates it, in px. */
export interface SwipeThresholds {
  x: number
  y: number
}

/** A fling counts as if the card had travelled this many seconds further at its speed. */
export const FLING_SECONDS = 0.12

/**
 * The rating a swipe gives: right is Good (3), left is Again (1), up is Easy (4). Down rates
 * nothing, and neither does a drag that stays inside the thresholds. Up wins only when the card
 * went more up than sideways. Runs on the UI thread too (a worklet).
 */
export function ratingForSwipe(dx: number, dy: number, thresholds: SwipeThresholds): Grade | null {
  'worklet'
  if (-dy > thresholds.y && -dy > Math.abs(dx)) return 4
  if (dx > thresholds.x && dx >= Math.abs(dy)) return 3
  if (dx < -thresholds.x && -dx >= Math.abs(dy)) return 1
  return null
}

/** Where a rated card flies to: off the side it was swiped to, up for Easy, down for Hard. */
export function flyTarget(grade: Grade, width: number, height: number): { x: number; y: number } {
  'worklet'
  if (grade === 4) return { x: 0, y: -height * 1.2 }
  if (grade === 3) return { x: width * 1.5, y: 40 }
  if (grade === 1) return { x: -width * 1.5, y: 40 }
  return { x: 0, y: height * 1.2 }
}

/** The most a dragged card tilts, in degrees. */
export const MAX_TILT = 12

/** How far the card tilts for a sideways drag of `dx` on a screen `width` wide: ±12° at half the width. */
export function tiltFor(dx: number, width: number): number {
  'worklet'
  if (width <= 0) return 0
  return Math.max(-MAX_TILT, Math.min(MAX_TILT, (dx / (width * 0.5)) * MAX_TILT))
}

/** How strongly a drag leans toward each rating, 0..1 (1 at the threshold). Only one is ever above 0. */
export interface SwipeLean {
  good: number
  again: number
  easy: number
}

export function leanFor(dx: number, dy: number, thresholds: SwipeThresholds): SwipeLean {
  'worklet'
  const unit = (v: number) => Math.max(0, Math.min(1, v))
  if (-dy > Math.abs(dx)) return { good: 0, again: 0, easy: unit(-dy / thresholds.y) }
  return { good: unit(dx / thresholds.x), again: unit(-dx / thresholds.x), easy: 0 }
}

/** How long a card takes to fly `distance` px when let go at `velocity` px/s: faster flings leave sooner. */
export function flyDuration(distance: number, velocity: number): number {
  'worklet'
  const speed = Math.max(Math.abs(velocity), 1600)
  return Math.round(Math.max(140, Math.min(260, (Math.abs(distance) / speed) * 1000)))
}

/** The haptic a rating gives: a warning for Again, a light tap for Good and Easy, a tick for Hard. */
export function ratingHaptic(grade: Grade): 'warning' | 'tap' | 'select' {
  return grade === 1 ? 'warning' : grade === 2 ? 'select' : 'tap'
}
