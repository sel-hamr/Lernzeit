import { dayResult, indexMinutes, topicStreak } from '@lernzeit/core/goals'
import { dayHeat, heatmapWeeks, topicWeek, weekSummary } from '@lernzeit/core/history'
import { addDays, formatDayMonth, formatHM, startOfWeek, weekDays, WEEKDAY_SHORT, weekdayOf } from '@lernzeit/core/time'
import type { Session, Topic } from '@lernzeit/core/types'
import { Check, ChevronLeft, ChevronRight } from 'lucide-react-native'
import { useMemo, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import Svg, { Rect } from 'react-native-svg'
import { useToday } from '../data/useToday'
import { Screen } from '../components/Screen'
import { useLiveQuery } from '../store/live'
import { numbers, useTheme } from '../theme'
import { Card } from '../ui'

const WEEKS = 16
const CELL = 14
const GAP = 3

/** History: a week at a time with goals hit, 16 weeks as a heatmap, a streak per topic. */
export function HistoryScreen() {
  const { colors, type, spacing } = useTheme()
  const topics = useLiveQuery(['topics'], (l) => l.list<Topic>('topics').sort((a, b) => a.order - b.order), [])
  const sessions = useLiveQuery(['sessions'], (l) => l.list<Session>('sessions'), [])
  const today = useToday()
  const active = useMemo(() => topics.filter((t) => !t.archived), [topics])
  const index = useMemo(() => indexMinutes(sessions), [sessions])
  const [monday, setMonday] = useState(() => startOfWeek(today))
  const days = weekDays(monday)
  const summary = weekSummary(active, index, days, today)
  const isThisWeek = monday === startOfWeek(today)

  return (
    <Screen title="History">
      <Card title="Week" hint={`${formatDayMonth(days[0])} to ${formatDayMonth(days[6])}`}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Pressable accessibilityRole="button" accessibilityLabel="Previous week" hitSlop={8} onPress={() => setMonday(addDays(monday, -7))} style={{ padding: 8 }}>
            <ChevronLeft size={20} strokeWidth={1.7} color={colors.ink2} />
          </Pressable>
          <Text style={[type.bodyMedium, numbers, { color: colors.ink }]}>{`${formatHM(summary.totalMinutes)} h of ${formatHM(summary.totalGoal)} h`}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Next week" disabled={isThisWeek} hitSlop={8} onPress={() => setMonday(addDays(monday, 7))} style={{ padding: 8, opacity: isThisWeek ? 0.3 : 1 }}>
            <ChevronRight size={20} strokeWidth={1.7} color={colors.ink2} />
          </Pressable>
        </View>
        {days.map((day) => {
          const r = dayResult(active, index, day)
          const future = day > today
          return (
            <View key={day} accessible accessibilityLabel={`${formatDayMonth(day)}, ${formatHM(r.totalMinutes)} hours${r.allHit ? ', goals hit' : ''}`} style={{ flexDirection: 'row', alignItems: 'center', minHeight: 40, gap: spacing.md, borderTopWidth: 1, borderTopColor: colors.line }}>
              <Text style={[type.bodyMedium, { color: day === today ? colors.ink : colors.ink2, width: 36 }]}>{WEEKDAY_SHORT[weekdayOf(day)]}</Text>
              <Text style={[type.small, { color: colors.muted, flex: 1 }]}>{formatDayMonth(day)}</Text>
              <Text style={[type.body, numbers, { color: future ? colors.muted : colors.ink }]}>{future ? '' : r.totalGoal ? `${formatHM(r.totalMinutes)} of ${formatHM(r.totalGoal)} h` : `${formatHM(r.totalMinutes)} h`}</Text>
              <View style={{ width: 18 }}>{r.allHit && r.goalCount > 0 ? <Check size={16} strokeWidth={2.2} color={colors.sageInk} /> : null}</View>
            </View>
          )
        })}
      </Card>

      <Card title="This week in short">
        <Text style={[type.body, { color: colors.ink }]}>
          {summary.countedDays ? `All goals hit on ${summary.allHitDays} of ${summary.countedDays} days.` : 'No goals counted yet this week.'}
        </Text>
        {active.map((t) => {
          const w = topicWeek(t, index, days, today)
          return (
            <View key={t.id} style={{ gap: 2 }}>
              <Text style={[type.bodyMedium, { color: colors.ink }]}>{`${t.name}: hit ${w.hits} of ${w.counted}`}</Text>
              <Text style={[type.small, { color: colors.muted }]}>{w.note}</Text>
            </View>
          )
        })}
      </Card>

      <Card title="Last 16 weeks" hint="Darker means closer to the goal; the darkest is a goal hit.">
        <Heatmap today={today} topics={active} index={index} />
      </Card>

      <Card title="Streaks">
        {active.length === 0 ? <Text style={[type.body, { color: colors.muted }]}>No topics yet.</Text> : null}
        {active.map((t) => {
          const s = topicStreak(t, index, today)
          return (
            <View key={t.id} style={{ flexDirection: 'row', justifyContent: 'space-between', minHeight: 32, alignItems: 'center' }}>
              <Text style={[type.bodyMedium, { color: colors.ink }]}>{t.name}</Text>
              <Text style={[type.body, numbers, { color: colors.muted }]}>{`${s.current} ${s.current === 1 ? 'day' : 'days'} · best ${s.longest}`}</Text>
            </View>
          )
        })}
      </Card>
    </Screen>
  )
}

function Heatmap({ today, topics, index }: { today: string; topics: Topic[]; index: ReturnType<typeof indexMinutes> }) {
  const { colors } = useTheme()
  const weeks = heatmapWeeks(today, WEEKS)
  const width = WEEKS * (CELL + GAP)
  const height = 7 * (CELL + GAP)
  return (
    <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} accessibilityLabel="Study heatmap of the last 16 weeks">
      {weeks.map((week, x) =>
        week.map((day, y) => {
          const future = day > today
          const level = future ? 0 : dayHeat(topics, index, day).level
          return <Rect key={day} x={x * (CELL + GAP)} y={y * (CELL + GAP)} width={CELL} height={CELL} rx={3} fill={colors.heat[level]} opacity={future ? 0.35 : 1} />
        }),
      )}
    </Svg>
  )
}
