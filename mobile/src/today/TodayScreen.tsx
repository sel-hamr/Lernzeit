import { germanText } from '@lernzeit/core/german'
import { formatPracticeTime } from '@lernzeit/core/practice'
import { formatHM } from '@lernzeit/core/time'
import { pastelIndex, type TodaySession, type TodayView, type TopicProgress } from '@lernzeit/core/today'
import type { Card, TopicColor } from '@lernzeit/core/types'
import { Check, Clock3 } from 'lucide-react-native'
import type { ReactNode } from 'react'
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useLiveQuery } from '../store/live'
import { numbers, useTheme } from '../theme'
import { useTodayView } from './useTodayView'

/** The Today tab: the day's goals, sessions and word, live from the local store (SPEC §11.5). */
export function TodayScreen() {
  const view = useTodayView()
  const { colors, type, spacing } = useTheme()
  return (
    <ScrollView
      style={{ backgroundColor: colors.main }}
      contentContainerStyle={{ paddingHorizontal: spacing.pageX, paddingTop: spacing.pageTop, paddingBottom: spacing.xxxl, gap: spacing.xl }}
    >
      <View style={{ gap: spacing.xs }}>
        <Text style={[type.title, { color: colors.ink }]} accessibilityRole="header">
          Today
        </Text>
        <Text style={[type.body, { color: colors.muted }]}>{view.subtitle}</Text>
      </View>
      <StatStrip view={view} />
      <DailyGoals rows={view.progress.topics} />
      <TodaysSessions sessions={view.sessions} />
      <WordOfTheDay card={view.word} />
    </ScrollView>
  )
}

function Section({ title, children, testID }: { title?: string; children: ReactNode; testID?: string }) {
  const { colors, type, spacing, radius } = useTheme()
  return (
    <View
      testID={testID}
      style={{ backgroundColor: colors.main, borderColor: colors.line, borderWidth: 1, borderRadius: radius.section, paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.xs }}
    >
      {title ? (
        <Text style={[type.section, { color: colors.ink, paddingBottom: spacing.sm }]} accessibilityRole="header">
          {title}
        </Text>
      ) : null}
      {children}
    </View>
  )
}

function Empty({ title, children, icon }: { title: string; children: string; icon?: ReactNode }) {
  const { colors, type, spacing } = useTheme()
  return (
    <View style={[styles.empty, { borderTopColor: colors.line, paddingVertical: spacing.xl, gap: spacing.xs }]}>
      {icon}
      <Text style={[type.bodyMedium, { color: colors.ink }]}>{title}</Text>
      <Text style={[type.body, { color: colors.muted, textAlign: 'center' }]}>{children}</Text>
    </View>
  )
}

function StatStrip({ view }: { view: TodayView }) {
  const { colors, type, fonts, spacing, radius } = useTheme()
  const { progress, practised, streak } = view
  const days = `${streak.days} ${streak.days === 1 ? 'day' : 'days'}`
  const items = [
    { value: `${formatHM(progress.totalDone)} h`, label: `studied of ${formatHM(progress.totalGoal)} h today` },
    { value: formatPracticeTime(practised.ms), label: `flashcards practised · ${practised.reviewed} ${practised.reviewed === 1 ? 'card' : 'cards'}` },
    { value: days, label: streak.topicName ? `${streak.topicName} streak` : 'streak' },
  ]
  return (
    <View style={[styles.strip, { borderColor: colors.line, borderRadius: radius.section, backgroundColor: colors.soft }]}>
      {items.map((item, i) => (
        <View key={item.label} style={[styles.stat, { padding: spacing.md, gap: spacing.xs, borderLeftWidth: i ? 1 : 0, borderLeftColor: colors.line }]}>
          <Text style={[{ fontFamily: fonts.regular, fontSize: 22, lineHeight: 28, color: colors.ink }, numbers]}>{item.value}</Text>
          <Text style={[type.chip, { color: colors.muted }]}>{item.label}</Text>
        </View>
      ))}
    </View>
  )
}

function ProgressBar({ value, color, label }: { value: number; color: string; label: string }) {
  const { colors } = useTheme()
  const percent = Math.round(Math.max(0, Math.min(1, value)) * 100)
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: percent }}
      style={[styles.track, { backgroundColor: colors.track }]}
    >
      <View style={{ width: `${percent}%`, height: '100%', borderRadius: 4, backgroundColor: color }} />
    </View>
  )
}

function useTopicColors(color: TopicColor | undefined) {
  const { topics } = useTheme()
  return topics[color ?? 'stone'] ?? topics.stone
}

function GoalRow({ row }: { row: TopicProgress }) {
  const { colors, type, spacing } = useTheme()
  const palette = useTopicColors(row.topic.color)
  const { goal, done, left, hit } = row
  return (
    <View style={[styles.goal, { borderTopColor: colors.line, paddingVertical: spacing.md, gap: spacing.sm }]}>
      <View style={styles.between}>
        <View style={[styles.inline, { gap: spacing.sm, flex: 1 }]}>
          <View style={[styles.dot, { backgroundColor: palette.dot }]} />
          <Text style={[type.bodyMedium, { color: colors.ink, flexShrink: 1 }]} numberOfLines={1}>
            {row.topic.name}
          </Text>
        </View>
        <Text style={[type.body, numbers, { color: colors.muted }]}>
          {`${formatHM(done)} of ${formatHM(goal)} h`}
        </Text>
      </View>
      <ProgressBar value={goal ? done / goal : 0} color={palette.bar} label={`${row.topic.name} progress`} />
      <View style={styles.end}>
        {goal === 0 ? (
          <Text style={[type.bodyMedium, { color: colors.muted }]}>No goal</Text>
        ) : hit ? (
          <View style={[styles.inline, { gap: 4 }]}>
            <Check size={15} strokeWidth={2.2} color={colors.sageInk} />
            <Text style={[type.bodyMedium, { color: colors.sageInk }]}>Done</Text>
          </View>
        ) : (
          <Text style={[type.bodyMedium, numbers, { color: colors.ink }]}>{formatHM(left)} left</Text>
        )}
      </View>
    </View>
  )
}

function DailyGoals({ rows }: { rows: TopicProgress[] }) {
  const { colors, type } = useTheme()
  return (
    <Section title="Daily goals">
      {rows.length === 0 ? (
        <Empty title="No topics yet">Topics hold your daily goals. Add one in Lernzeit on the web and it shows up here.</Empty>
      ) : (
        <>
          {rows.map((row) => (
            <GoalRow key={row.topic.id} row={row} />
          ))}
          <Text style={[type.small, { color: colors.muted, paddingBottom: 12 }]}>Resets at midnight</Text>
        </>
      )}
    </Section>
  )
}

function SessionRow({ session }: { session: TodaySession }) {
  const { colors, type, spacing, radius } = useTheme()
  const palette = useTopicColors(session.topicColor)
  return (
    <View testID="session-row" style={[styles.session, { borderTopColor: colors.line, paddingVertical: spacing.md, gap: spacing.md }]}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[type.small, numbers, { color: colors.muted }]}>
          {session.startClock}–{session.endClock}
        </Text>
        <Text style={[type.bodyMedium, { color: colors.ink }]}>{session.topicName ?? 'Deleted topic'}</Text>
        {session.note ? (
          <Text style={[type.small, { color: colors.muted }]} numberOfLines={2}>
            {session.note}
          </Text>
        ) : null}
      </View>
      <View style={{ backgroundColor: session.topicColor ? palette.soft : colors.neutralChip, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 3 }}>
        <Text style={[type.chip, numbers, { color: session.topicColor ? palette.ink : colors.neutralInk }]}>{session.minutes} min</Text>
      </View>
    </View>
  )
}

function TodaysSessions({ sessions }: { sessions: TodaySession[] }) {
  const { colors } = useTheme()
  return (
    <Section title="Today's sessions" testID="today-sessions">
      {sessions.length === 0 ? (
        <Empty title="No sessions yet today" icon={<Clock3 size={20} strokeWidth={1.6} color={colors.muted} />}>
          Time you log with the timer shows up here.
        </Empty>
      ) : (
        sessions.map((s) => <SessionRow key={s.id} session={s} />)
      )}
    </Section>
  )
}

/** First letter of the word, skipping articles: "der Hund" -> "H". */
function initial(text: string): string {
  const word = text.replace(/^(der|die|das)\s+/i, '').trim()
  return [...word][0]?.toUpperCase() ?? ''
}

/** The card's file on this phone if it has one, else its emoji, else the word's first letter, on its soft pastel. */
function CardPicture({ card }: { card: Card }) {
  const { pastels, colors } = useTheme()
  const file = useLiveQuery(['imageFiles'], (library) => (card.imageId ? library.imageFile(card.imageId) : undefined), [card.imageId])
  const background = pastels[pastelIndex(card.id)]
  return (
    <View style={[styles.picture, { backgroundColor: background }]}>
      {file ? (
        <Image
          source={{ uri: file.path }}
          accessibilityLabel={card.english}
          resizeMode="contain"
          style={file.fit === 'cover' ? styles.fill : [styles.fill, { padding: 8 }]}
        />
      ) : card.emoji && !card.imageId ? (
        <Text accessibilityRole="image" accessibilityLabel={card.english} style={styles.emoji}>
          {card.emoji}
        </Text>
      ) : (
        <Text importantForAccessibility="no" style={[styles.initial, { color: colors.onPastel }]}>
          {initial(card.german)}
        </Text>
      )}
    </View>
  )
}

function WordOfTheDay({ card }: { card: Card | undefined }) {
  const { colors, type, fonts, spacing } = useTheme()
  if (!card) {
    return (
      <Section testID="word-of-the-day">
        <Empty title="Word of the day">Add flashcards and a learned word will show up here every day.</Empty>
      </Section>
    )
  }
  const title = { fontFamily: fonts.semibold, fontSize: 24, lineHeight: 30, letterSpacing: -0.24, color: colors.ink }
  return (
    <View testID="word-of-the-day" style={[styles.word, { borderColor: colors.line, backgroundColor: colors.main, padding: spacing.md, gap: spacing.md }]}>
      <CardPicture card={card} />
      <View style={{ paddingHorizontal: spacing.sm, paddingBottom: spacing.sm, gap: spacing.xs }}>
        <Text style={[type.chip, { color: colors.muted }]}>Word of the day</Text>
        {card.type === 'word' && card.gender ? (
          <Text style={title}>
            <Text style={{ color: colors[card.gender] }}>{card.gender}</Text>
            {' '}
            <Text>{card.german}</Text>
          </Text>
        ) : (
          <Text style={title}>{germanText(card)}</Text>
        )}
        <Text style={[type.body, { color: colors.muted }]}>
          {card.gender ? 'the ' : ''}
          {card.english}
          {card.plural ? ` · plural ${card.plural}` : ''}
        </Text>
        {card.exampleDe ? <Text style={[type.body, { color: colors.ink, paddingTop: spacing.xs }]}>{card.exampleDe}</Text> : null}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  strip: { flexDirection: 'row', borderWidth: 1, overflow: 'hidden' },
  stat: { flex: 1 },
  empty: { alignItems: 'center', borderTopWidth: 1 },
  goal: { borderTopWidth: 1 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  inline: { flexDirection: 'row', alignItems: 'center' },
  end: { alignItems: 'flex-end' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  track: { height: 8, borderRadius: 4, overflow: 'hidden' },
  session: { flexDirection: 'row', alignItems: 'center', borderTopWidth: 1 },
  word: { borderWidth: 1, borderRadius: 16 },
  picture: { height: 150, borderRadius: 10, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  fill: { width: '100%', height: '100%' },
  emoji: { fontSize: 64, lineHeight: 80 },
  initial: { fontFamily: 'Geist_600SemiBold', fontSize: 64, lineHeight: 72, opacity: 0.15 },
})
