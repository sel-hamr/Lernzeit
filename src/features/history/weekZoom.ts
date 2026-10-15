import { useState } from 'react'
import { storage } from '@/lib/browser'

/** Pixels per hour at each zoom level; the first is the unzoomed week. */
export const ZOOM_PX = [34, 48, 68, 96, 136]
const ZOOM_KEY = 'lernzeit-week-zoom'
/** Wheel delta (summed) that counts as one zoom step, so a trackpad pinch doesn't jump straight to the end. */
export const WHEEL_STEP = 60

/** Zoom level for the week calendar, remembered across visits. */
export function useWeekZoom() {
  const [zoom, setZoom] = useState(() => {
    const saved = Number(storage.get(ZOOM_KEY))
    return Number.isInteger(saved) && saved >= 0 && saved < ZOOM_PX.length ? saved : 0
  })
  const change = (next: number) => {
    const clamped = Math.min(ZOOM_PX.length - 1, Math.max(0, next))
    setZoom(clamped)
    storage.set(ZOOM_KEY, String(clamped))
  }
  return [zoom, change] as const
}
