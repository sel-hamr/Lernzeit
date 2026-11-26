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
