import { MINUTE } from './time'

/**
 * Active time on a page where people mostly read: time counts while the page
 * is visible and the person scrolled, tapped or typed within the last
 * `idleMs`. A reader who walks away stops counting after that window.
 */
export interface Activity {
  activeMs: number
  /** Last scroll, tap or key press. */
  lastInput: number
  /** Time is counted up to here. */
  countedTo: number
  visible: boolean
}

/** Long enough to read a paragraph without touching the screen. */
export const READING_IDLE_MS = 2 * MINUTE

export function startActivity(now: number): Activity {
  return { activeMs: 0, lastInput: now, countedTo: now, visible: true }
}

/** Counts the time since the last call that falls inside the active window. */
export function tickActivity(a: Activity, now: number, idleMs = READING_IDLE_MS): Activity {
  if (!a.visible) return { ...a, countedTo: now }
  const activeUntil = Math.min(now, a.lastInput + idleMs)
  return { ...a, activeMs: a.activeMs + Math.max(0, activeUntil - a.countedTo), countedTo: now }
}

export function noteInput(a: Activity, now: number, idleMs = READING_IDLE_MS): Activity {
  return { ...tickActivity(a, now, idleMs), lastInput: now }
}

export function hideActivity(a: Activity, now: number, idleMs = READING_IDLE_MS): Activity {
  return { ...tickActivity(a, now, idleMs), visible: false }
}

/** Coming back to the page counts as input. */
export function showActivity(a: Activity, now: number): Activity {
  return { ...a, visible: true, lastInput: now, countedTo: now }
}
