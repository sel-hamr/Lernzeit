import clsx from 'clsx'
import type { Topic } from '@/db/types'
import type { MinutesIndex } from '@/lib/goals'
import { dayHeat, heatmapWeeks } from '@/lib/history'
import { formatDayMonthShort, formatHM, parseDateKey } from '@/lib/time'

const LEVEL_BG = ['bg-heat-0', 'bg-heat-1', 'bg-heat-2', 'bg-heat-3', 'bg-heat-4']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** GitHub-style grid: one column per week, darker = more study, darkest = goal hit. */
export function Heatmap({ topics, index, today, topicId, weeks = 16, onOpenDay }: { topics: Topic[]; index: MinutesIndex; today: string; topicId?: string; weeks?: number; onOpenDay: (day: string) => void }) {
  const grid = heatmapWeeks(today, weeks)
  // Label a column when a new month starts, but never closer than 3 columns to the last label.
  const monthLabels: (string | null)[] = []
  let lastLabelled = -10
  let lastMonth = -1
  grid.forEach((week, w) => {
    const month = parseDateKey(week[6]).getMonth()
    if (month !== lastMonth && w - lastLabelled >= 3) {
      monthLabels.push(MONTHS[month])
      lastLabelled = w
    } else monthLabels.push(null)
    lastMonth = month
  })
  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto scrollbar-none">
        <div className="inline-flex flex-col gap-1.5">
          <div className="grid grid-flow-col gap-1 text-[10px] text-muted" style={{ gridAutoColumns: '13px' }}>
            {monthLabels.map((label, w) => (
              <span key={w} className="overflow-visible whitespace-nowrap">
                {label ?? ''}
              </span>
            ))}
          </div>
          <div className="grid grid-flow-col grid-rows-[repeat(7,13px)] gap-1" style={{ gridAutoColumns: '13px' }} role="grid" aria-label="Study time per day, last 16 weeks">
            {grid.flat().map((day) => {
              if (day > today) return <span key={day} className="size-3.25" aria-hidden />
              const heat = dayHeat(topics, index, day, topicId)
              const label = `${formatDayMonthShort(day)} · ${formatHM(heat.minutes)} h${heat.goal ? (heat.hit ? ' · goal hit' : ` of ${formatHM(heat.goal)} h`) : ''}`
              return (
                <button
                  key={day}
                  type="button"
                  title={label}
                  aria-label={label}
                  onClick={() => onOpenDay(day)}
                  className={clsx('size-3.25 rounded-[3px] transition-transform hover:scale-125 focus-visible:scale-125', LEVEL_BG[heat.level], day === today && 'ring-1 ring-ink/40 ring-offset-1 ring-offset-main')}
                />
              )
            })}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1.5 text-chip text-muted">
        Less
        {LEVEL_BG.map((bg) => (
          <span key={bg} className={clsx('size-2.75 rounded-[3px]', bg)} />
        ))}
        Goal hit
      </div>
    </div>
  )
}
