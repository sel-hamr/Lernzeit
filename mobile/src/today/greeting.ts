/** "Guten Morgen" until 11, "Guten Tag" until 18, then "Guten Abend" (and through the night until 5). */
export function greeting(hour: number, name?: string): string {
  const h = ((Math.floor(hour) % 24) + 24) % 24
  const words = h >= 5 && h < 11 ? 'Guten Morgen' : h >= 11 && h < 18 ? 'Guten Tag' : 'Guten Abend'
  const first = name?.trim().split(/\s+/)[0]
  return first ? `${words}, ${first}` : words
}

/** The hour (0-23) at `now` in `timeZone`; the phone's own hour when the zone is unknown. */
export function hourIn(now: number, timeZone?: string): number {
  try {
    const text = new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone }).format(now)
    const hour = Number.parseInt(text, 10)
    if (Number.isFinite(hour)) return hour % 24
  } catch {
    // An unknown zone name: fall back to the phone's clock.
  }
  return new Date(now).getHours()
}
