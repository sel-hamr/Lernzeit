import { HOUR } from '@lernzeit/core/time'

/**
 * How full the timer ring is (0..1): the share of this phase done, or for a free timer the share
 * of the current hour, so it fills once an hour. Empty before a start.
 */
export function ringProgress(elapsed: number, remaining: number | undefined, started: boolean): number {
  if (!started) return 0
  if (remaining === undefined) return (elapsed % HOUR) / HOUR
  const length = elapsed + remaining
  return length > 0 ? Math.min(1, elapsed / length) : 0
}
