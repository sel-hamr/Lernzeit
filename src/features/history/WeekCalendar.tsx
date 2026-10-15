import { useEffect, useLayoutEffect, useRef } from 'react'
import clsx from 'clsx'
import { Check } from 'lucide-react'
import type { Session, Topic } from '@/db/types'
import type { DayResult } from '@/lib/goals'
import { topicVars } from '@/lib/colors'
import { formatHours, parseDateKey, weekdayOf, WEEKDAY_SHORT } from '@/lib/time'
import { WHEEL_STEP, ZOOM_PX } from './weekZoom'

/** One column per day with each session drawn as a block on a time axis. */
export function WeekCalendar({
  days,
  results,
  sessions,
  topics,
  today,
  zoom,
  onZoom,
  onOpenDay,
}: {
  days: string[]
  results: DayResult[]
  sessions: Session[]
  topics: Topic[]
  today: string
  zoom: number
  onZoom: (zoom: number) => void
  onOpenDay: (day: string) => void
}) {
  const topicMap = new Map(topics.map((t) => [t.id, t]))
  const hourPx = ZOOM_PX[zoom]
  const scrollRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)

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
  const height = (endHour - startHour) * hourPx
  // Zoomed in, the body scrolls inside the height of the unzoomed week.
  const viewHeight = (endHour - startHour) * ZOOM_PX[0]
  const step = hourPx >= 60 ? 1 : 2
  const labels: number[] = []
  for (let h = startHour; h <= endHour; h += step) labels.push(h)

  // Keep the same hour in place while zooming: the one under the pointer for Ctrl + wheel, else the middle of the view.
  const anchor = useRef<{ hour: number; y: number } | null>(null)
  const prevPx = useRef(hourPx)
  const view = useRef({ startHour, hourPx, zoom, onZoom })
  useLayoutEffect(() => {
    view.current = { startHour, hourPx, zoom, onZoom }
  })

  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el || prevPx.current === hourPx) return
    const top = bodyRef.current?.offsetTop ?? 0
    const mid = (el.clientHeight - top) / 2
    const { hour, y } = anchor.current ?? { hour: (el.scrollTop + mid) / prevPx.current + startHour, y: top + mid }
    el.scrollTop = (hour - startHour) * hourPx + top - y
    anchor.current = null
    prevPx.current = hourPx
  }, [hourPx, startHour])

  // Ctrl + wheel (and trackpad pinch, which browsers report the same way) zooms instead of zooming the page.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    let sum = 0
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      sum += e.deltaY
      if (Math.abs(sum) < WHEEL_STEP) return
      const { startHour, hourPx, zoom, onZoom } = view.current
      const next = zoom + (sum < 0 ? 1 : -1)
      sum = 0
      if (next < 0 || next >= ZOOM_PX.length) return
      const y = e.clientY - el.getBoundingClientRect().top
      const top = bodyRef.current?.offsetTop ?? 0
      anchor.current = { hour: (el.scrollTop + y - top) / hourPx + startHour, y }
      onZoom(next)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  // Click and drag pans the calendar with a mouse; touch already scrolls natively. A drag doesn't count as a click on a day.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    let drag: { id: number; x: number; y: number; left: number; top: number; moved: boolean } | null = null
    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop, moved: false }
    }
    const onMove = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return
      const dx = e.clientX - drag.x
      const dy = e.clientY - drag.y
      if (!drag.moved) {
        if (Math.hypot(dx, dy) < 4) return
        drag.moved = true
        el.setPointerCapture(e.pointerId)
        el.dataset.dragging = ''
      }
      el.scrollLeft = drag.left - dx
      el.scrollTop = drag.top - dy
    }
    const onUp = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return
      if (drag.moved) {
        delete el.dataset.dragging
        const swallow = (c: MouseEvent) => {
          c.stopPropagation()
          c.preventDefault()
        }
        el.addEventListener('click', swallow, { capture: true, once: true })
        setTimeout(() => el.removeEventListener('click', swallow, { capture: true }))
      }
      drag = null
    }
    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointercancel', onUp)
    return () => {
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointercancel', onUp)
    }
  }, [])

  return (
    <div
      ref={scrollRef}
      className={clsx('relative -mx-6 overflow-x-auto px-6 pb-2 select-none data-dragging:cursor-grabbing data-dragging:**:cursor-grabbing', zoom > 0 ? 'overflow-y-auto' : 'overflow-y-hidden')}
      style={zoom > 0 ? { maxHeight: viewHeight + 40 } : undefined}
    >
      <div className="grid min-w-170 grid-cols-[48px_repeat(7,minmax(0,1fr))] gap-x-2">
        {/* Covers the hour labels as they scroll under the sticky day row. */}
        <div className={clsx(zoom > 0 && 'sticky top-0 z-10 bg-main')} />
        {days.map((day, i) => {
          const r = results[i]
          const isToday = day === today
          return (
            <button
              key={day}
              type="button"
              onClick={() => onOpenDay(day)}
              className="sticky top-0 z-10 flex items-baseline gap-1.5 rounded-md bg-main pb-2.5 text-left text-small hover:text-sage-ink"
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

        <div ref={bodyRef} className="relative text-chip text-muted tabular-nums" style={{ height }}>
          {labels.map((h) => (
            <span key={h} className="absolute left-0" style={{ top: (h - startHour) * hourPx - (h === startHour && zoom > 0 ? 0 : 7) }}>
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
                backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent ${hourPx * step - 1}px, var(--color-track) ${hourPx * step - 1}px, var(--color-track) ${hourPx * step}px)`,
              }}
            >
              {daySessions.map((s) => {
                const topic = topicMap.get(s.topicId)
                const top = ((s.start - midnight) / 3_600_000 - startHour) * hourPx
                const blockHeight = Math.max(18, ((s.end - s.start) / 3_600_000) * hourPx)
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
