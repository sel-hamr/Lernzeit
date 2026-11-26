import { dayResult, indexMinutes, topicStreak } from '@lernzeit/core/goals'
import { dayHeat, heatmapWeeks, topicWeek, weekSummary, type HeatLevel } from '@lernzeit/core/history'
import { addDays, formatClock, formatDayMonth, formatHM, formatLongDate, startOfWeek, weekDays, WEEKDAY_SHORT, weekdayOf } from '@lernzeit/core/time'
import { count } from '@lernzeit/core/text'
import type { Session, Topic } from '@lernzeit/core/types'
import { CalendarDays, Check, ChevronLeft, ChevronRight, Clock3 } from 'lucide-react-native'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSpring, withTiming } from 'react-native-reanimated'
import { Screen } from '../components/Screen'
import { useToday } from '../data/useToday'
import { AnimatedBar, FadeInUp, RollingNumber, springs, timings } from '../motion'
import { useLiveQuery } from '../store/live'
import { numbers, useTheme } from '../theme'
import { Badge, EmptyState, GroupedList, IconButton, Row, SectionHeader } from '../ui'
import { sessionsByDay } from './sessionsByDay'

const WEEKS = 16
const GAP = 4

/** History: the week as a hero with its days, the topics and streaks, 16 weeks as a heatmap and the week's sessions by day. */
export function HistoryScreen() {
  const { colors, type, spacing, radius, shadow, fonts, topics: topicColors } = useTheme()
  const topics = useLiveQuery(['topics'], (l) => l.list<Topic>('topics').sort((a, b) => a.order - b.order), [])
  const sessions = useLiveQuery(['sessions'], (l) => l.list<Session>('sessions'), [])
  const today = useToday()
  const active = useMemo(() => topics.filter((t) => !t.archived), [topics])
  const index = useMemo(() => indexMinutes(sessions), [sessions])
  const [monday, setMonday] = useState(() => startOfWeek(today))
  const days = weekDays(monday)
  const summary = weekSummary(active, index, days, today)
  const isThisWeek = monday === startOfWeek(today)
  const grouped = useMemo(() => sessionsByDay(sessions, weekDays(monday)), [sessions, monday])
  const topicName = (id: string) => topics.find((t) => t.id === id)?.name ?? 'Study'
  const topicDot = (id: string) => {
    const t = topics.find((x) => x.id === id)
    return (t ? (topicColors[t.color] ?? topicColors.stone) : topicColors.stone).dot
  }
  const maxDay = Math.max(1, ...days.map((d) => dayResult(active, index, d).totalMinutes))

  return (
    <Screen title="History">
      <FadeInUp index={0}>
        <View style={[{ backgroundColor: colors.card, borderRadius: radius.card, padding: spacing.xl, gap: spacing.md }, shadow.card]}>
          <View style={styles.between}>
            <IconButton icon={ChevronLeft} label="Previous week" variant="raised" size={40} haptic="select" onPress={() => setMonday(addDays(monday, -7))} />
            <View style={{ alignItems: 'center', flex: 1 }}>
              <Text style={[type.bodyMedium, { color: colors.ink }]}>{isThisWeek ? 'This week' : `Week of ${formatDayMonth(days[0])}`}</Text>
              <Text style={[type.small, { color: colors.muted }]}>{`${formatDayMonth(days[0])} to ${formatDayMonth(days[6])}`}</Text>
            </View>
            <IconButton icon={ChevronRight} label="Next week" variant="raised" size={40} haptic="select" disabled={isThisWeek} onPress={() => setMonday(addDays(monday, 7))} />
          </View>
          <View style={{ gap: 2 }}>
            <RollingNumber value={`${formatHM(summary.totalMinutes)} h`} style={[type.hero, { color: colors.ink }]} />
            <Text style={[type.small, numbers, { color: colors.muted }]}>{summary.totalGoal ? `studied of ${formatHM(summary.totalGoal)} h` : 'studied, no goals this week'}</Text>
          </View>
          <AnimatedBar value={summary.totalGoal ? summary.totalMinutes / summary.totalGoal : 0} height={10} label="Week's goals progress" />
          <Badge label={summary.countedDays ? `All goals hit on ${summary.allHitDays} of ${count(summary.countedDays, 'day')}` : 'No goals counted yet this week'} tone={summary.countedDays && summary.allHitDays === summary.countedDays ? 'lime' : 'accent'} />
          <View style={[styles.days, { gap: spacing.xs, paddingTop: spacing.xs }]}>
            {days.map((day) => {
              const r = dayResult(active, index, day)
              const future = day > today
              const share = future ? 0 : r.totalMinutes / maxDay
              return (
                <View key={day} style={styles.dayCol} accessible accessibilityLabel={`${formatDayMonth(day)}, ${formatHM(r.totalMinutes)} hours${r.allHit && r.goalCount > 0 ? ', goals hit' : ''}`}>
                  <DayBar share={share} hit={r.allHit && r.goalCount > 0} index={days.indexOf(day)} />
                  <Text style={[type.chip, { color: day === today ? colors.ink : colors.muted, fontFamily: day === today ? fonts.semibold : fonts.medium }]}>{WEEKDAY_SHORT[weekdayOf(day)]}</Text>
                </View>
              )
            })}
          </View>
        </View>
      </FadeInUp>

      <FadeInUp index={1} style={{ gap: spacing.md }}>
        <SectionHeader title="Topics" detail="Week and streak" />
        {active.length === 0 ? (
          <EmptyState icon={CalendarDays} title="No topics yet" body="Add a topic in Settings and its week shows up here." />
        ) : (
          <GroupedList>
            {active.map((t) => {
              const w = topicWeek(t, index, days, today)
              const s = topicStreak(t, index, today)
              return (
                <Row
                  key={t.id}
                  title={t.name}
                  subtitle={`Hit ${w.hits} of ${w.counted} · ${w.note}`}
                  left={<View style={[styles.dot, { backgroundColor: topicDot(t.id) }]} />}
                  right={
                    <View style={{ alignItems: 'flex-end', gap: 2 }}>
                      <Text style={[type.bodyMedium, numbers, { color: colors.ink }]}>{count(s.current, 'day')}</Text>
                      <Text style={[type.chip, numbers, { color: colors.muted }]}>{`Best ${s.longest}`}</Text>
                    </View>
                  }
                  accessibilityLabel={`${t.name}: hit ${w.hits} of ${w.counted}. ${w.note}. Streak ${count(s.current, 'day')}, best ${s.longest}`}
                />
              )
            })}
          </GroupedList>
        )}
      </FadeInUp>

      <FadeInUp index={2} style={{ gap: spacing.md }}>
        <SectionHeader title="Last 16 weeks" />
        <View style={[{ backgroundColor: colors.card, borderRadius: radius.card, padding: spacing.xl, gap: spacing.md }, shadow.card]}>
          <Heatmap today={today} topics={active} index={index} />
          <View style={[styles.between, { gap: spacing.sm }]}>
            <Text style={[type.small, { color: colors.muted, flex: 1 }]}>Darker is closer to the goal</Text>
            <Text style={[type.chip, { color: colors.muted }]}>Less</Text>
            {([0, 1, 2, 3, 4] as HeatLevel[]).map((l) => (
              <View key={l} style={[styles.swatch, { backgroundColor: colors.heat[l] }]} />
            ))}
            <Text style={[type.chip, { color: colors.muted }]}>Hit</Text>
          </View>
        </View>
      </FadeInUp>

      <FadeInUp index={3} style={{ gap: spacing.md }}>
        <SectionHeader title="Sessions" detail={grouped.length ? `${grouped.reduce((n, d) => n + d.sessions.length, 0)}` : undefined} />
        {grouped.length === 0 ? (
          <EmptyState icon={Clock3} title="No sessions this week" body="Time you log with the timer or by practising shows up here, day by day." />
        ) : (
          grouped.map((group) => (
            <View key={group.day} style={{ gap: spacing.sm }}>
              <View style={[styles.between, { paddingHorizontal: 4 }]}>
                <Text style={[type.small, { color: colors.ink2, fontFamily: fonts.semibold }]}>{group.day === today ? 'Today' : formatLongDate(group.day)}</Text>
                <Text style={[type.small, numbers, { color: colors.muted }]}>{`${formatHM(group.minutes)} h`}</Text>
              </View>
              <GroupedList>
                {group.sessions.map((s) => (
                  <Row
                    key={s.id}
                    title={topicName(s.topicId)}
                    subtitle={[`${formatClock(s.start)} to ${formatClock(s.end)}`, s.note].filter(Boolean).join(' · ')}
                    left={<View style={[styles.dot, { backgroundColor: topicDot(s.topicId) }]} />}
                    right={<Text style={[type.bodyMedium, numbers, { color: colors.ink }]}>{`${formatHM(s.minutes)} h`}</Text>}
                  />
                ))}
              </GroupedList>
            </View>
          ))
        )}
      </FadeInUp>
    </Screen>
  )
}

/** One day's column in the week: it grows from the bottom on a spring, lime when every goal was hit. */
function DayBar({ share, hit, index }: { share: number; hit: boolean; index: number }) {
  const { colors } = useTheme()
  const reduced = useReducedMotion()
  const fill = useSharedValue(0)
  useEffect(() => {
    const to = Math.max(0, Math.min(1, share))
    fill.value = reduced ? withTiming(to, timings.fade) : withDelay(index * 40, withSpring(to, { ...springs.gentle, overshootClamping: true }))
  }, [share, reduced, index, fill])
  const animated = useAnimatedStyle(() => ({ height: `${Math.max(fill.value > 0 ? 8 : 0, fill.value * 100)}%` }))
  return (
    <View style={[styles.dayTrack, { backgroundColor: colors.track }]}>
      <Animated.View style={[styles.dayFill, { backgroundColor: hit ? colors.accent : colors.meter }, animated]} />
      {hit ? (
        <View style={styles.dayCheck}>
          <Check size={12} strokeWidth={2.6} color={colors.onAccent} />
        </View>
      ) : null}
    </View>
  )
}

/** 16 weeks of days, a column a week; the columns pop in one after another. */
function Heatmap({ today, topics, index }: { today: string; topics: Topic[]; index: ReturnType<typeof indexMinutes> }) {
  const { colors, spacing } = useTheme()
  const { width } = useWindowDimensions()
  const weeks = heatmapWeeks(today, WEEKS)
  const inner = width - spacing.pageX * 2 - spacing.xl * 2
  const cell = Math.max(8, Math.floor((inner - GAP * (WEEKS - 1)) / WEEKS))
  return (
    <View style={[styles.heat, { gap: GAP }]} accessible accessibilityRole="image" accessibilityLabel="Study heatmap of the last 16 weeks">
      {weeks.map((week, x) => (
        <HeatColumn key={week[0]} index={x}>
          {week.map((day) => {
            const future = day > today
            const level = future ? 0 : dayHeat(topics, index, day).level
            return <View key={day} style={{ width: cell, height: cell, borderRadius: Math.round(cell * 0.28), backgroundColor: colors.heat[level], opacity: future ? 0.35 : 1, borderWidth: day === today ? 1.5 : 0, borderColor: colors.ink }} />
          })}
        </HeatColumn>
      ))}
    </View>
  )
}

function HeatColumn({ index, children }: { index: number; children: ReactNode }) {
  const reduced = useReducedMotion()
  const shown = useSharedValue(0)
  useEffect(() => {
    shown.value = reduced ? withTiming(1, timings.fade) : withDelay(120 + index * 28, withSpring(1, springs.gentle))
    // Only on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const animated = useAnimatedStyle(() => ({ opacity: Math.min(1, shown.value * 1.3), transform: [{ scale: reduced ? 1 : 0.6 + 0.4 * shown.value }] }))
  return <Animated.View style={[{ gap: GAP }, animated]}>{children}</Animated.View>
}

const styles = StyleSheet.create({
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  days: { flexDirection: 'row', height: 112 },
  dayCol: { flex: 1, alignItems: 'center', gap: 6 },
  dayTrack: { flex: 1, width: '72%', maxWidth: 28, borderRadius: 10, overflow: 'hidden', justifyContent: 'flex-end' },
  dayFill: { width: '100%', borderRadius: 10 },
  dayCheck: { position: 'absolute', bottom: 6, left: 0, right: 0, alignItems: 'center' },
  dot: { width: 10, height: 10, borderRadius: 5, marginHorizontal: 4 },
  swatch: { width: 12, height: 12, borderRadius: 3 },
  heat: { flexDirection: 'row', justifyContent: 'center' },
})
