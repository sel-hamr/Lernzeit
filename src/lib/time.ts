import type { WeekdayKey } from '@/db/types'

export const MINUTE = 60_000
export const HOUR = 60 * MINUTE
export const DAY = 24 * HOUR

export const WEEKDAYS: WeekdayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
export const WEEKDAY_SHORT: Record<WeekdayKey, string> = {
  mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun',
}
export const WEEKDAY_LONG: Record<WeekdayKey, string> = {
  mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday',
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Local calendar date as YYYY-MM-DD. */
export function dateKey(input: Date | number = Date.now()): string {
  const d = typeof input === 'number' ? new Date(input) : input
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Local midnight of a YYYY-MM-DD key. */
export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function addDays(key: string, days: number): string {
  const d = parseDateKey(key)
  d.setDate(d.getDate() + days)
  return dateKey(d)
}

/** Whole days from a to b (b - a). DST safe because it rounds. */
export function daysBetween(a: string, b: string): number {
  return Math.round((parseDateKey(b).getTime() - parseDateKey(a).getTime()) / DAY)
}

export function weekdayOf(key: string): WeekdayKey {
  const js = parseDateKey(key).getDay() // 0 = Sunday
  return WEEKDAYS[(js + 6) % 7]
}

/** Monday of the week that contains `key`. */
export function startOfWeek(key: string): string {
  const offset = WEEKDAYS.indexOf(weekdayOf(key))
  return addDays(key, -offset)
}

export function weekDays(monday: string): string[] {
  return WEEKDAYS.map((_, i) => addDays(monday, i))
}

export function startOfDayMs(ts: number): number {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

export function nextMidnightMs(ts: number): number {
  const d = new Date(ts)
  d.setHours(24, 0, 0, 0)
  return d.getTime()
}

/** 70 -> "1:10", 5 -> "0:05". Fractions are dropped. */
export function formatHM(minutes: number): string {
  const total = Math.max(0, Math.floor(minutes + 1e-6))
  return `${Math.floor(total / 60)}:${pad(total % 60)}`
}

/** Hours with at most one decimal: 270 -> "4.5", 180 -> "3". */
export function formatHours(minutes: number): string {
  const h = Math.round((minutes / 60) * 10) / 10
  return Number.isInteger(h) ? String(h) : h.toFixed(1)
}

/** 45 -> "45 min", 90 -> "1:30 h" */
export function formatMinutesShort(minutes: number): string {
  const m = Math.floor(minutes + 1e-6)
  return m < 60 ? `${m} min` : `${formatHM(m)} h`
}

/** "14:02" */
export function formatClock(ts: number): string {
  const d = new Date(ts)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Timer readout: "24:13", or "1:02:03" past an hour. */
export function formatTimer(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const MONTHS_SHORT = MONTHS.map((m) => m.slice(0, 3))

/** "Wednesday, 14 October" */
export function formatLongDate(key: string): string {
  const d = parseDateKey(key)
  return `${WEEKDAY_LONG[weekdayOf(key)]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`
}

/** "5 October" */
export function formatDayMonth(key: string): string {
  const d = parseDateKey(key)
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`
}

/** "5 Oct" */
export function formatDayMonthShort(key: string): string {
  const d = parseDateKey(key)
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`
}

/** "Oct 2026" */
export function formatMonthYear(key: string): string {
  const d = parseDateKey(key)
  return `${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`
}

/** "Due today", "tomorrow", "in 3 days", "in 2 months" */
export function formatDueLabel(due: number, now: number = Date.now()): { label: string; isDue: boolean } {
  if (due <= now) return { label: 'Due today', isDue: true }
  const days = daysBetween(dateKey(now), dateKey(due))
  if (days <= 0) return { label: 'Due today', isDue: true }
  if (days === 1) return { label: 'tomorrow', isDue: false }
  if (days < 31) return { label: `in ${days} days`, isDue: false }
  const months = Math.round(days / 30)
  if (months < 12) return { label: `in ${months} month${months === 1 ? '' : 's'}`, isDue: false }
  const years = Math.round((days / 365) * 10) / 10
  return { label: `in ${years} year${years === 1 ? '' : 's'}`, isDue: false }
}

/** "Today", "Tomorrow", "in 4 days", or "12 Oct" */
export function formatNextReview(due: number, now: number = Date.now()): string {
  const days = daysBetween(dateKey(now), dateKey(due))
  if (due <= now || days <= 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  if (days < 14) return `in ${days} days`
  return formatDayMonthShort(dateKey(due))
}

/** "1m", "10m", "3h", "4d", "2mo", "1.3y" — for the rating buttons. */
export function formatInterval(ms: number): string {
  const min = ms / MINUTE
  if (min < 60) return `${Math.max(1, Math.round(min))}m`
  const h = min / 60
  if (h < 24) return `${Math.round(h)}h`
  const d = h / 24
  if (d < 31) return `${Math.round(d)}d`
  const mo = d / 30
  if (mo < 12) return `${Math.round(mo)}mo`
  return `${Math.round((d / 365) * 10) / 10}y`
}

/** "HH:MM" -> minutes since midnight */
export function parseTimeOfDay(value: string): number {
  const [h, m] = value.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}
