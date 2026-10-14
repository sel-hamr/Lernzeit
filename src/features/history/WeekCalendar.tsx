import clsx from 'clsx'
import { Check } from 'lucide-react'
import type { Session, Topic } from '@/db/types'
import type { DayResult } from '@/lib/goals'
import { topicVars } from '@/lib/colors'
import { formatHours, parseDateKey, weekdayOf, WEEKDAY_SHORT } from '@/lib/time'

const HOUR_PX = 34

/** One column per day with each session drawn as a block on a time axis. */
export function WeekCalendar({ days, results, sessions, topics, today, onOpenDay }: { days: string[]; results: DayResult[]; sessions: Session[]; topics: Topic[]; today: string; onOpenDay: (day: string) => void }) {
  const topicMap = new Map(topics.map((t) => [t.id, t]))

  // 08:00–20:00 by default, widened to fit early or late sessions.
  let startHour = 8
  let endHour = 20
  for (const s of sessions) {
    const midnight = parseDateKey(s.date).getTime()
    const from = (s.start - midnight) / 3_600_000
    const to = (s.end - midnight) / 3_600_000
    startHour = Math.min(startHour, Math.floor(from / 2) * 2)
    endHour = Math.max(endHour, Math.ceil(to / 2) * 2)
  }
  startHour = Math.max(0, startHour)
  endHour = Math.min(24, endHour)
  const height = (endHour - startHour) * HOUR_PX
  const labels: number[] = []
  for (let h = startHour; h <= endHour; h += 2) labels.push(h)

  return (
    <div className="-mx-6 overflow-x-auto overflow-y-hidden px-6 pb-2">
      <div className="grid min-w-170 grid-cols-[48px_repeat(7,minmax(0,1fr))] gap-x-2">
        <div />
        {days.map((day, i) => {
          const r = results[i]
          const isToday = day === today
          return (
            <button
              key={day}
              type="button"
              onClick={() => onOpenDay(day)}
              className="flex items-baseline gap-1.5 rounded-md pb-2.5 text-left text-small hover:text-sage-ink"
              aria-label={`Open ${WEEKDAY_SHORT[weekdayOf(day)]}`}
            >
              <strong className={clsx('font-semibold', isToday && 'text-sage-ink')}>{WEEKDAY_SHORT[weekdayOf(day)]}</strong>
              <span className="flex items-center gap-0.5 text-chip text-muted tabular-nums">
                {formatHours(r.totalMinutes)} h
                {r.allHit && <Check size={12} strokeWidth={2.2} aria-label="every goal hit" />}
              </span>
            </button>
          )
        })}

        <div className="relative text-chip text-muted tabular-nums" style={{ height }}>
          {labels.map((h) => (
            <span key={h} className="absolute left-0" style={{ top: (h - startHour) * HOUR_PX - 7 }}>
              {String(h).padStart(2, '0')}:00
            </span>
          ))}
        </div>

        {days.map((day) => {
          const midnight = parseDateKey(day).getTime()
          const daySessions = sessions.filter((s) => s.date === day)
          return (
            <div
              key={day}
              role="button"
              tabIndex={-1}
              onClick={() => onOpenDay(day)}
              className={clsx('relative cursor-pointer border-t border-line', day === today && 'bg-sage/25')}
              style={{
                height,
                backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent ${HOUR_PX * 2 - 1}px, var(--color-track) ${HOUR_PX * 2 - 1}px, var(--color-track) ${HOUR_PX * 2}px)`,
              }}
            >
              {daySessions.map((s) => {
                const topic = topicMap.get(s.topicId)
                const top = ((s.start - midnight) / 3_600_000 - startHour) * HOUR_PX
                const blockHeight = Math.max(18, ((s.end - s.start) / 3_600_000) * HOUR_PX)
                const minutes = Math.max(1, Math.round(s.minutes))
                const tall = blockHeight >= 44
                return (
                  <div
                    key={s.id}
                    title={`${topic?.name ?? 'Deleted topic'} · ${minutes} min${s.note ? ` · ${s.note}` : ''}`}
                    className="absolute inset-x-0 overflow-hidden rounded-lg border border-(--t-border) bg-(--t-soft) px-2 py-0.75 text-chip leading-tight text-(--t-ink)"
                    style={{ ...topicVars(topic?.color), top, height: blockHeight }}
                  >
                    {tall ? (
                      <>
                        <div className="truncate font-medium">{topic?.name}</div>
                        <div className="tabular-nums">{minutes} min</div>
                      </>
                    ) : (
                      <div className="truncate font-medium tabular-nums">
                        {topic?.name} · {minutes} min
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}
