import { memo } from 'react'

const C = 100

function point(r: number, deg: number) {
  const rad = (deg * Math.PI) / 180
  return { x: C + r * Math.sin(rad), y: C - r * Math.cos(rad) }
}

function arcPath(r: number, from: number, sweep: number): string {
  const s = Math.min(sweep, 359.99)
  const a = point(r, from)
  const b = point(r, from + s)
  return `M${a.x.toFixed(2)} ${a.y.toFixed(2)} A${r} ${r} 0 ${s > 180 ? 1 : 0} 1 ${b.x.toFixed(2)} ${b.y.toFixed(2)}`
}

const minuteTicks = Array.from({ length: 60 }, (_, i) => i).filter((i) => i % 5 !== 0)
const hourTicks = Array.from({ length: 12 }, (_, i) => i * 30)

/**
 * Station-clock style session dial. The dark hand shows elapsed minutes, the
 * red hand elapsed seconds, and the soft arc the time left in the session
 * (up to one full turn).
 */
export const StationClock = memo(function StationClock({
  elapsedMs,
  remainingMs,
  tone = 'focus',
  size = 300,
  label,
}: {
  elapsedMs: number
  /** Omit in free mode: the arc then shows time studied this hour. */
  remainingMs?: number
  tone?: 'focus' | 'break'
  size?: number
  label: string
}) {
  const totalSeconds = Math.floor(elapsedMs / 1000)
  const minuteAngle = ((elapsedMs / 60_000) % 60) * 6
  const secondAngle = (totalSeconds % 60) * 6

  let arc: string | null = null
  if (remainingMs !== undefined) {
    const sweep = (remainingMs / 60_000) * 6
    if (sweep > 0.5) arc = arcPath(68, minuteAngle, sweep)
  } else if (minuteAngle > 0.5) {
    arc = arcPath(68, 0, minuteAngle)
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 200 200"
      role="img"
      aria-label={label}
      className="h-auto max-w-full"
    >
      <circle cx={C} cy={C} r={97} fill="var(--color-main)" stroke="var(--clock-rim)" strokeWidth={2} />
      {arc && (
        <path
          d={arc}
          fill="none"
          stroke={tone === 'break' ? 'var(--clock-arc-break)' : 'var(--clock-arc)'}
          strokeOpacity={remainingMs === undefined ? 0.45 : 0.75}
          strokeWidth={16}
          strokeLinecap="round"
        />
      )}
      {minuteTicks.map((i) => {
        const a = point(83.6, i * 6)
        const b = point(88.4, i * 6)
        return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--clock-tick)" strokeWidth={1.2} />
      })}
      {hourTicks.map((deg) => {
        const a = point(79, deg)
        const b = point(89, deg)
        return <line key={deg} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--color-ink)" strokeWidth={3.6} />
      })}
      <rect x={97} y={26} width={6} height={88} rx={3} fill="var(--color-ink)" transform={`rotate(${minuteAngle.toFixed(2)} ${C} ${C})`} />
      <g transform={`rotate(${secondAngle} ${C} ${C})`}>
        <rect x={99.1} y={40} width={1.8} height={78} fill="var(--color-clock-red)" />
        <circle cx={C} cy={42} r={8} fill="var(--color-clock-red)" />
      </g>
      <circle cx={C} cy={C} r={3.2} fill="var(--color-clock-red)" />
    </svg>
  )
})
