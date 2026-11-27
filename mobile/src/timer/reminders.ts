import { formatHM, parseTimeOfDay } from '@lernzeit/core/time'

export interface PlannedReminder {
  id: string
  at: number
  title: string
  body: string
}

const pad = (n: number) => String(n).padStart(2, '0')

/**
 * The reminders to schedule: each set time of the next `days` days, on this phone's clock. Today's are
 * left out when every goal is met (`open` is empty) and say what is left when not. Later days cannot
 * know, so they stay general; they are planned again whenever the app comes to the front or today changes.
 */
export function planReminders(opts: { times: string[]; now: number; open: { name: string; left: number }[]; days?: number }): PlannedReminder[] {
  const { times, now, open, days = 7 } = opts
  const out: PlannedReminder[] = []
  const start = new Date(now)
  for (let d = 0; d < days; d++) {
    for (const time of times) {
      const minutes = parseTimeOfDay(time)
      if (Number.isNaN(minutes)) continue
      const at = new Date(start.getFullYear(), start.getMonth(), start.getDate() + d, Math.floor(minutes / 60), minutes % 60).getTime()
      if (at <= now) continue
      if (d === 0 && open.length === 0) continue
      const key = `lz-reminder-${at}`
      out.push({
        id: key,
        at,
        title: 'Lernzeit',
        body:
          d === 0
            ? `You still have ${open
                .slice(0, 3)
                .map((r) => `${formatHM(r.left)} h of ${r.name}`)
                .join(', ')} today.`
            : 'Time for your daily study.',
      })
    }
  }
  return out
}

export const isTime = (text: string) => /^([01]?\d|2[0-3]):[0-5]\d$/.test(text.trim())
export const normalTime = (text: string) => {
  const [h, m] = text.trim().split(':')
  return `${pad(Number(h))}:${m}`
}
