import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Section, SectionHeader } from '@/components/ui/primitives'
import { Segmented } from '@/components/ui/form'
import type { ReviewLog, Session, Topic } from '@/db/types'
import { dotColor } from '@/lib/colors'
import { hoursByPeriod } from '@/lib/history'
import { addDays, formatDayMonthShort } from '@/lib/time'

const axisTick = { fill: 'var(--color-muted)', fontSize: 11 }

interface TooltipEntry {
  value?: unknown
  name?: unknown
  color?: string
  dataKey?: unknown
}

function ChartTooltip({ active, payload, label, unit }: { active?: boolean; payload?: readonly TooltipEntry[]; label?: unknown; unit: string }) {
  if (!active || !payload?.length) return null
  const rows = payload.filter((p) => Number(p.value) > 0)
  const total = payload.reduce((s, p) => s + Number(p.value ?? 0), 0)
  return (
    <div className="min-w-35 rounded-row border border-line bg-main px-3 py-2.5 text-chip shadow-popup">
      <div className="pb-1.5 font-medium text-ink">{String(label ?? '')}</div>
      {rows.length === 0 && <div className="text-muted">Nothing</div>}
      {rows.map((p) => (
        <div key={String(p.dataKey)} className="flex items-center justify-between gap-4 py-0.5">
          <span className="flex items-center gap-1.5 text-ink-2">
            <span className="size-2 rounded-full" style={{ background: p.color }} />
            {String(p.name)}
          </span>
          <span className="text-ink tabular-nums">
            {Number(p.value).toFixed(unit === 'h' ? 1 : 0)} {unit}
          </span>
        </div>
      ))}
      {rows.length > 1 && (
        <div className="mt-1 flex justify-between border-t border-line pt-1 text-ink tabular-nums">
          <span>Total</span>
          <span>
            {total.toFixed(1)} {unit}
          </span>
        </div>
      )}
    </div>
  )
}

/** Stacked bars: hours per topic per week or month. */
export function HoursChart({ sessions, topics, today }: { sessions: Session[]; topics: Topic[]; today: string }) {
  const [mode, setMode] = useState<'week' | 'month'>('week')
  const data = useMemo(() => hoursByPeriod(sessions, topics, mode, today, mode === 'week' ? 12 : 12), [sessions, topics, mode, today])
  const hasData = data.some((b) => topics.some((t) => Number(b[t.id]) > 0))
  return (
    <Section className="flex flex-col gap-4 px-6 pt-5 pb-4">
      <SectionHeader
        title="Hours per topic"
        subtitle={mode === 'week' ? 'Last 12 weeks' : 'Last 12 months'}
        action={
          <Segmented
            label="Period"
            size="sm"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'week', label: 'Weeks' },
              { value: 'month', label: 'Months' },
            ]}
          />
        }
      />
      {topics.length > 1 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-chip text-muted">
          {topics.map((t) => (
            <span key={t.id} className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-[3px]" style={{ background: dotColor(t.color) }} />
              {t.name}
            </span>
          ))}
        </div>
      )}
      <div className="h-55" aria-hidden={!hasData}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -18 }} barCategoryGap="28%">
            <CartesianGrid vertical={false} stroke="var(--color-line)" />
            <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={12} />
            <YAxis tick={axisTick} tickLine={false} axisLine={false} allowDecimals={false} width={44} unit=" h" />
            <Tooltip cursor={{ fill: 'var(--color-field)' }} content={(props) => <ChartTooltip active={props.active} payload={props.payload} label={props.label} unit="h" />} />
            {topics.map((t, i) => (
              <Bar
                key={t.id}
                dataKey={t.id}
                name={t.name}
                stackId="hours"
                fill={dotColor(t.color)}
                stroke="var(--color-main)"
                strokeWidth={1}
                radius={i === topics.length - 1 ? [4, 4, 0, 0] : 0}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <table className="sr-only">
        <caption>Hours per topic</caption>
        <thead>
          <tr>
            <th>Period</th>
            {topics.map((t) => (
              <th key={t.id}>{t.name}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((b) => (
            <tr key={b.key}>
              <td>{b.label}</td>
              {topics.map((t) => (
                <td key={t.id}>{Number(b[t.id]).toFixed(1)} h</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  )
}

/** Reviews per day over the last 30 days. */
export function ReviewsChart({ logs, today }: { logs: ReviewLog[]; today: string }) {
  const data = useMemo(() => {
    const counts = new Map<string, number>()
    for (const l of logs) counts.set(l.day, (counts.get(l.day) ?? 0) + 1)
    return Array.from({ length: 30 }, (_, i) => {
      const day = addDays(today, i - 29)
      return { day, label: formatDayMonthShort(day), reviews: counts.get(day) ?? 0 }
    })
  }, [logs, today])
  return (
    <div className="h-37.5">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -24 }} barCategoryGap="22%">
          <CartesianGrid vertical={false} stroke="var(--color-line)" />
          <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={24} />
          <YAxis tick={axisTick} tickLine={false} axisLine={false} allowDecimals={false} width={40} />
          <Tooltip cursor={{ fill: 'var(--color-field)' }} content={(props) => <ChartTooltip active={props.active} payload={props.payload} label={props.label} unit="reviews" />} />
          <Bar dataKey="reviews" name="Reviews" fill="var(--color-sage-dot)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
