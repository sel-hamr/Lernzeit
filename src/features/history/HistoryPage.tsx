import { useMemo, useState } from 'react'
import clsx from 'clsx'
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Flame } from 'lucide-react'
import { Chip, Dot, EmptyState, PageHeader, Section, SectionHeader, StatStrip } from '@/components/ui/primitives'
import { TextSelect } from '@/components/ui/form'
import { useAllReviews, useAllSessions, useCards, useLogsSince, useStudyQueue, useToday, useTopics } from '@/data/hooks'
import { useStreaks } from '@/data/stats'
import { describeGoals, earliestDay, indexMinutes } from '@/lib/goals'
import { allGoalsStreak, topicWeek, weekSummary } from '@/lib/history'
import { State } from '@/lib/srs'
import { TOPIC_COLOR_NAME } from '@/lib/colors'
import { addDays, formatDayMonth, formatHM, formatHours, startOfWeek, weekDays } from '@/lib/time'
import { WeekCalendar } from './WeekCalendar'
import { useWeekZoom } from './weekZoom'
import { Heatmap } from './Heatmap'
import { HoursChart, ReviewsChart } from './Charts'
import { DayDialog } from './DayDialog'

function weekLabel(monday: string, thisMonday: string): string {
  if (monday === thisMonday) return 'This week'
  if (monday === addDays(thisMonday, -7)) return 'Last week'
  return `Week of ${formatDayMonth(monday)}`
}

function WeekPicker({ monday, thisMonday, onChange }: { monday: string; thisMonday: string; onChange: (m: string) => void }) {
  const options = Array.from({ length: 26 }, (_, i) => addDays(thisMonday, -7 * i))
  if (!options.includes(monday)) options.push(monday)
  return (
    <div className="flex items-center gap-1.5">
      <button type="button" aria-label="Previous week" onClick={() => onChange(addDays(monday, -7))} className="flex size-10 items-center justify-center rounded-row border border-line-strong bg-main hover:bg-soft">
        <ChevronLeft size={16} strokeWidth={1.8} />
      </button>
      <div className="relative flex h-10 items-center gap-2 rounded-row border border-line-strong bg-main px-3.5 text-body hover:bg-soft">
        <CalendarDays size={16} strokeWidth={1.7} aria-hidden />
        <span className="whitespace-nowrap">{weekLabel(monday, thisMonday)}</span>
        <ChevronDown size={14} strokeWidth={2} aria-hidden />
        <select aria-label="Choose week" value={monday} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 cursor-pointer appearance-none opacity-0">
          {options.map((m) => (
            <option key={m} value={m}>
              {weekLabel(m, thisMonday)}
            </option>
          ))}
        </select>
      </div>
      <button
        type="button"
        aria-label="Next week"
        disabled={monday >= thisMonday}
        onClick={() => onChange(addDays(monday, 7))}
        className="flex size-10 items-center justify-center rounded-row border border-line-strong bg-main hover:bg-soft disabled:opacity-40"
      >
        <ChevronRight size={16} strokeWidth={1.8} />
      </button>
    </div>
  )
}

function FlashcardStats({ today }: { today: string }) {
  const cards = useCards()
  const reviews = useAllReviews()
  const logs = useLogsSince(addDays(today, -29))
  const queue = useStudyQueue()
  const learned = useMemo(() => new Set((reviews ?? []).filter((r) => r.state === State.Review).map((r) => r.cardId)).size, [reviews])
  const reviewLogs = logs.filter((l) => l.prevState === State.Review)
  const retention = reviewLogs.length ? Math.round((reviewLogs.filter((l) => l.rating > 1).length / reviewLogs.length) * 100) : null
  const reviewsToday = logs.filter((l) => l.day === today).length

  const tiles = [
    { value: cards?.length ?? 0, label: 'total cards' },
    { value: learned, label: 'cards learned' },
    { value: queue.total, label: 'due today' },
    { value: retention === null ? '—' : `${retention}%`, label: 'retention, 30 days' },
  ]
  return (
    <Section className="flex flex-col gap-5 px-6 pt-5 pb-4">
      <SectionHeader title="Flashcards" subtitle={`${reviewsToday} ${reviewsToday === 1 ? 'review' : 'reviews'} today · ${logs.length} in the last 30 days`} />
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-row border border-line bg-line sm:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className="flex flex-col gap-1 bg-main px-4 py-3.5">
            <span className="text-[26px] leading-none tracking-[-0.02em] tabular-nums">{t.value}</span>
            <span className="text-small text-muted">{t.label}</span>
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-2">
        <div className="text-small font-medium text-ink-2">Reviews per day</div>
        <ReviewsChart logs={logs} today={today} />
      </div>
    </Section>
  )
}

export default function HistoryPage() {
  const today = useToday()
  const thisMonday = startOfWeek(today)
  const [monday, setMonday] = useState(thisMonday)
  const [openDay, setOpenDay] = useState<string | null>(null)
  const [zoom, setZoom] = useWeekZoom()
  const [heatTopic, setHeatTopic] = useState('all')
  const topics = useTopics()
  const allTopics = useTopics(true)
  const sessions = useAllSessions()
  const streaks = useStreaks()

  const days = useMemo(() => weekDays(monday), [monday])
  const index = useMemo(() => indexMinutes(sessions ?? []), [sessions])
  const summary = useMemo(() => weekSummary(topics, index, days, today), [topics, index, days, today])
  const weekSessions = useMemo(() => (sessions ?? []).filter((s) => s.date >= days[0] && s.date <= days[6]), [sessions, days])
  const firstDay = useMemo(() => earliestDay(topics, sessions ?? [], today), [topics, sessions, today])
  const heatTopicId = topics.some((t) => t.id === heatTopic) ? heatTopic : undefined
  const heatStreak = useMemo(
    () => (heatTopicId ? (streaks?.get(heatTopicId)?.current ?? 0) : allGoalsStreak(topics, index, firstDay, today)),
    [heatTopicId, streaks, topics, index, firstDay, today],
  )

  if (!sessions) return <div className="h-60" aria-busy="true" />

  const pct = summary.totalGoal ? Math.round((summary.totalMinutes / summary.totalGoal) * 100) : 0
  const colorNames = topics.map((t) => `${t.name} in ${TOPIC_COLOR_NAME[t.color].toLowerCase()}`).join(', ')
  const isPast = monday < thisMonday

  return (
    <>
      <PageHeader title="History" subtitle={`Week of ${formatDayMonth(monday)}`} inline actions={<WeekPicker monday={monday} thisMonday={thisMonday} onChange={setMonday} />} />

      <StatStrip
        items={[
          { value: `${formatHours(summary.totalMinutes)} hrs`, label: isPast ? 'studied that week' : 'studied this week' },
          { value: `${pct}%`, label: `of the ${formatHours(summary.totalGoal)} h weekly goal` },
          { value: `${summary.allHitDays} of ${monday === thisMonday ? summary.countedDays || 7 : 7}`, label: 'days with every goal hit' },
        ]}
      />

      <Section className="flex flex-col gap-4 px-6 pt-5 pb-6">
        <div className="flex flex-wrap justify-between gap-3">
          <SectionHeader title="Your week" subtitle={topics.length ? `${colorNames}. A check means every goal was hit. Tap a day for details, Ctrl + scroll to zoom.` : 'Add topics in Settings to set goals.'} />
          <div className="flex flex-wrap items-center gap-3.5 text-chip text-muted">
            {topics.map((t) => (
              <span key={t.id} className="flex items-center gap-1.5">
                <span className="size-3 rounded-[3px] border" style={{ background: `var(--t-${t.color}-soft)`, borderColor: `var(--t-${t.color}-border)` }} />
                {t.name}
              </span>
            ))}
          </div>
        </div>
        <WeekCalendar days={days} results={summary.days} sessions={weekSessions} topics={allTopics} today={today} zoom={zoom} onZoom={setZoom} onOpenDay={setOpenDay} />
      </Section>

      <div className="flex flex-wrap items-start gap-5">
        <Section className="flex min-w-0 flex-[3_1_420px] flex-col px-6 pt-5 pb-2">
          <SectionHeader title="Daily goals" subtitle={`How often you hit each goal ${isPast ? 'that week' : 'this week'}`} className="pb-3" />
          {topics.length === 0 ? (
            <EmptyState title="No goals yet">Add a topic with a daily goal in Settings.</EmptyState>
          ) : (
            topics.map((t) => {
              const week = topicWeek(t, index, days, today)
              const streak = streaks?.get(t.id)
              return (
                <div key={t.id} className="flex flex-wrap items-center gap-3 border-t border-line py-3.5">
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="flex items-center gap-2 text-body font-medium">
                      <Dot color={t.color} />
                      {t.name}, {describeGoals(t.goalMinutes, formatHM)}
                    </span>
                    <span className="text-small text-muted">
                      {week.note}
                      {streak && ` · streak ${streak.current} ${streak.current === 1 ? 'day' : 'days'}, best ${streak.longest}`}
                    </span>
                  </div>
                  <Chip tone="topic" color={t.color}>
                    Hit {week.hits} of {week.counted || 7}
                  </Chip>
                </div>
              )
            })
          )}
        </Section>

        <Section className="flex min-w-0 flex-[2_1_300px] flex-col gap-3 px-6 py-5">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-section font-semibold">Last 16 weeks</h2>
            <span className={clsx('flex items-center gap-1 text-small', heatStreak > 0 ? 'text-sage-ink' : 'text-muted')}>
              {heatStreak > 0 && <Flame size={14} strokeWidth={1.8} />}
              Streak {heatStreak} {heatStreak === 1 ? 'day' : 'days'}
            </span>
          </div>
          <TextSelect label="Heatmap topic" value={heatTopicId ?? 'all'} onChange={setHeatTopic} className="-ml-1.5 self-start">
            <option value="all">All goals</option>
            {topics.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </TextSelect>
          <Heatmap topics={topics} index={index} today={today} topicId={heatTopicId} onOpenDay={setOpenDay} />
        </Section>
      </div>

      <HoursChart sessions={sessions} topics={topics} today={today} />
      <FlashcardStats today={today} />

      <DayDialog day={openDay} sessions={sessions} topics={allTopics} today={today} onClose={() => setOpenDay(null)} />
    </>
  )
}
