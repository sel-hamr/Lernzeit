import { Check, Trash2, X } from 'lucide-react'
import { Dialog } from '@/components/ui/Dialog'
import { Chip, Dot } from '@/components/ui/primitives'
import { useFeedback } from '@/components/ui/feedback'
import type { Session, Topic } from '@/db/types'
import { deleteSession } from '@/data/timer'
import { goalFor, isGoalHit } from '@/lib/goals'
import { formatClock, formatHM, formatLongDate } from '@/lib/time'

/** Day view: each topic's goal, time done, hit or missed, and that day's sessions and notes. */
export function DayDialog({ day, sessions, topics, today, onClose }: { day: string | null; sessions: Session[]; topics: Topic[]; today: string; onClose: () => void }) {
  const { confirm, toast } = useFeedback()
  const list = day ? sessions.filter((s) => s.date === day).sort((a, b) => a.start - b.start) : []
  const topicMap = new Map(topics.map((t) => [t.id, t]))

  const remove = async (s: Session) => {
    const ok = await confirm({ title: 'Delete this session?', body: `${Math.round(s.minutes)} min is removed from that day.`, confirmLabel: 'Delete', danger: true })
    if (!ok) return
    await deleteSession(s.id)
    toast('Session deleted')
  }

  return (
    <Dialog open={!!day} onClose={onClose} title={day ? formatLongDate(day) : ''} description={day === today ? 'Today so far' : undefined}>
      {day && (
        <div className="flex flex-col gap-5">
          <div className="flex flex-col">
            {topics.map((t) => {
              const goal = goalFor(t, day)
              const done = list.filter((s) => s.topicId === t.id).reduce((sum, s) => sum + s.minutes, 0)
              const hit = isGoalHit(done, goal)
              const pending = day === today && !hit
              return (
                <div key={t.id} className="flex items-center gap-3 border-b border-line py-3 text-body last:border-b-0">
                  <Dot color={t.color} />
                  <span className="flex-1 font-medium">{t.name}</span>
                  <span className="text-muted tabular-nums">
                    {formatHM(done)} {goal ? `of ${formatHM(goal)} h` : 'h · no goal'}
                  </span>
                  {goal > 0 &&
                    (hit ? (
                      <Chip tone="sage">
                        <Check size={12} strokeWidth={2.4} /> Hit
                      </Chip>
                    ) : pending ? (
                      <Chip tone="neutral">In progress</Chip>
                    ) : (
                      <Chip tone="red">
                        <X size={12} strokeWidth={2.4} /> Missed
                      </Chip>
                    ))}
                </div>
              )
            })}
          </div>

          <div className="flex flex-col gap-1">
            <div className="text-small font-medium text-ink-2">Sessions</div>
            {list.length === 0 ? (
              <div className="py-3 text-small text-muted">No sessions on this day.</div>
            ) : (
              list.map((s) => {
                const topic = topicMap.get(s.topicId)
                return (
                  <div key={s.id} className="group flex items-center gap-3 border-t border-line py-2.5">
                    <div className="w-23 shrink-0 text-small text-muted tabular-nums">
                      {formatClock(s.start)}–{formatClock(s.end)}
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="text-body font-medium">{topic?.name ?? 'Deleted topic'}</span>
                      {s.note && <span className="text-small text-muted">{s.note}</span>}
                    </div>
                    <Chip tone="topic" color={topic?.color}>
                      {Math.max(1, Math.round(s.minutes))} min
                    </Chip>
                    <button
                      type="button"
                      aria-label="Delete session"
                      onClick={() => void remove(s)}
                      className="flex size-8 items-center justify-center rounded-full text-muted opacity-60 hover:bg-red-soft hover:text-red-ink hover:opacity-100 focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                    >
                      <Trash2 size={15} strokeWidth={1.8} />
                    </button>
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}
    </Dialog>
  )
}
