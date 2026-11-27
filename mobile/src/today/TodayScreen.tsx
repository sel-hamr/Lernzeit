import { germanText } from '@lernzeit/core/german'
import { count } from '@lernzeit/core/text'
import { elapsedMs, isPaused, remainingMs } from '@lernzeit/core/timer'
import { formatHM, formatTimer } from '@lernzeit/core/time'
import { pastelIndex, type TodaySession, type TodayView, type TopicProgress } from '@lernzeit/core/today'
import type { Card, TopicColor } from '@lernzeit/core/types'
import { useRouter } from 'expo-router'
import { BookOpen, Check, Clock3, Flame, Layers, Play, Target } from 'lucide-react-native'
import { useEffect, useMemo, useRef } from 'react'
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import Animated, { interpolate, useAnimatedScrollHandler, useAnimatedStyle, useReducedMotion, useSharedValue, type SharedValue } from 'react-native-reanimated'
import { CardPicture, germanWrap } from '../cards/CardPicture'
import { useCards, useDecks } from '../cards/data'
import { useHiddenFeatures } from '../features'
import { useTabBarSpace } from '../components/BottomBar'
import { AnimatedBar, AnimatedRing, FadeInUp, haptics, Pressable, RollingNumber } from '../motion'
import { numbers, useTheme } from '../theme'
import { useActiveTimer, useNow } from '../timer/hooks'
import { Badge, Button, EmptyState, GroupedList, Row, SectionHeader, Tile } from '../ui'
import { deckCarousel, type CarouselDeck } from './decks'
import { heroLine, practisedLabel, type WeekBar } from './hero'
import { useTodayView, type TodayScreenView } from './useTodayView'

/** Today: the hero with today's time, your decks, the goals, the sessions and the word, live from the local store. */
export function TodayScreen() {
  const view = useTodayView()
  const { colors, spacing } = useTheme()
  const barSpace = useTabBarSpace()
  return (
    <ScrollView style={{ backgroundColor: colors.canvas }} contentContainerStyle={{ paddingHorizontal: spacing.pageX, paddingTop: spacing.xs, paddingBottom: barSpace, gap: spacing.cardGap }}>
      <RunningTimer view={view} />
      <FadeInUp index={0}>
        <Hero view={view} />
      </FadeInUp>
      <FadeInUp index={1}>
        <Decks today={view.today} lastPractised={view.lastPractised} />
      </FadeInUp>
      <FadeInUp index={2}>
        <DailyGoals rows={view.progress.topics} />
      </FadeInUp>
      <FadeInUp index={3}>
        <TodaysSessions sessions={view.sessions} />
      </FadeInUp>
      <FadeInUp index={4}>
        <WordOfTheDay card={view.word} />
      </FadeInUp>
    </ScrollView>
  )
}

/** The running timer, a tap away from the Timer tab. */
function RunningTimer({ view }: { view: TodayView }) {
  const timer = useActiveTimer()
  const now = useNow(!!timer && !isPaused(timer))
  const router = useRouter()
  const { colors, type, spacing, radius } = useTheme()
  if (!timer) return null
  const name = view.progress.topics.find((r) => r.topic.id === timer.topicId)?.topic.name ?? 'Study'
  const shown = formatTimer(remainingMs(timer, now) ?? elapsedMs(timer, now))
  const state = timer.phase === 'break' ? 'Break' : isPaused(timer) ? 'Paused' : 'Running'
  return (
    <FadeInUp>
      <Pressable
        onPress={() => router.navigate('/timer')}
        accessibilityRole="button"
        accessibilityLabel={`Timer ${state}, ${shown}, ${name}`}
        style={[styles.between, { backgroundColor: colors.inverse, borderRadius: radius.card, paddingHorizontal: spacing.xl, paddingVertical: spacing.lg }]}
      >
        <View style={{ gap: 6, flex: 1 }}>
          <Badge label={`Timer ${state.toLowerCase()}`} tone="lime" />
          <Text style={[type.bodyMedium, { color: colors.onInverse }]} numberOfLines={1}>
            {name}
          </Text>
        </View>
        <Text style={[type.title, numbers, { color: colors.onInverse }]}>{shown}</Text>
      </Pressable>
    </FadeInUp>
  )
}

/** Time studied today: the big number, a ring for the goals, a line of encouragement, this week and the way to the timer. */
function Hero({ view }: { view: TodayScreenView }) {
  const { colors, type, spacing, radius, shadow, fonts } = useTheme()
  const router = useRouter()
  const timer = useActiveTimer()
  const timerOn = !useHiddenFeatures().includes('timer')
  const { totalDone, totalGoal, totalLeft } = view.progress
  const ratio = totalGoal ? Math.min(1, totalDone / totalGoal) : 0
  return (
    <View style={[{ backgroundColor: colors.card, borderRadius: radius.card, padding: spacing.xl, gap: spacing.lg }, shadow.card]}>
      <View style={styles.between}>
        <Text style={[type.small, { color: colors.muted }]}>Studied today</Text>
        <StreakChip days={view.streak.days} />
      </View>
      <View style={styles.between}>
        <View style={{ gap: 2, flex: 1 }}>
          <View style={[styles.rowEnd, { gap: 4 }]}>
            <RollingNumber value={formatHM(totalDone)} style={[type.hero, styles.big, { color: colors.ink }]} />
            <Text style={[type.section, { color: colors.muted, marginBottom: 9 }]}>h</Text>
          </View>
          <Text style={[type.small, numbers, { color: colors.muted }]}>{totalGoal ? `of ${formatHM(totalGoal)} h goal` : 'No goals today'}</Text>
        </View>
        {totalGoal ? (
          <AnimatedRing value={ratio} size={68} stroke={7} label="Today's goals progress">
            {totalLeft === 0 ? <Check size={22} strokeWidth={2.4} color={colors.accentInk} /> : <Text style={[type.small, numbers, { color: colors.ink, fontFamily: fonts.semibold }]}>{`${Math.floor(ratio * 100)}%`}</Text>}
          </AnimatedRing>
        ) : null}
      </View>
      <Text style={[type.body, { color: colors.ink2 }]}>{heroLine(totalDone, totalGoal, totalLeft)}</Text>
      <WeekStrip bars={view.week} />
      {timerOn ? <Button label={timer ? 'Open the timer' : 'Start studying'} icon={<Play size={15} color={colors.onPrimary} fill={colors.onPrimary} />} onPress={() => router.navigate('/timer')} /> : null}
    </View>
  )
}

/** "3-day streak" on a warm chip; nothing before the first day. */
function StreakChip({ days }: { days: number }) {
  const { topics, type, radius, fonts } = useTheme()
  if (days <= 0) return null
  return (
    <View style={[styles.chip, { backgroundColor: topics.clay.soft, borderRadius: radius.pill }]} accessibilityLabel={`${count(days, 'day')} streak`}>
      <Flame size={13} strokeWidth={2} color={topics.clay.ink} />
      <Text style={[type.chip, numbers, { color: topics.clay.ink, fontFamily: fonts.semibold }]}>{`${days}-day streak`}</Text>
    </View>
  )
}

const STRIP_HEIGHT = 52

/** Monday to Sunday: a bar per day against its goal tick, today in lime. */
function WeekStrip({ bars }: { bars: WeekBar[] }) {
  const { colors, type, spacing, fonts } = useTheme()
  const total = bars.reduce((sum, b) => sum + b.minutes, 0)
  return (
    <View testID="week-strip" style={{ gap: spacing.sm }}>
      <View style={styles.between}>
        <Text style={[type.chip, { color: colors.muted }]}>This week</Text>
        <Text style={[type.chip, numbers, { color: colors.ink2, fontFamily: fonts.semibold }]}>{`${formatHM(total)} h`}</Text>
      </View>
      <View style={[styles.row, { gap: spacing.sm }]}>
        {bars.map((b) => {
          const fill = b.minutes >= 1 ? Math.max(6, b.fill * STRIP_HEIGHT) : 0
          const color = b.today ? colors.accent : b.hit ? colors.heat[3] : colors.meter
          return (
            <View key={b.day} style={styles.day} accessible accessibilityLabel={`${b.short}: ${formatHM(b.minutes)} h${b.goal ? ` of ${formatHM(b.goal)} h` : ''}`}>
              <View style={[styles.dayTrack, { backgroundColor: b.today ? colors.accentSoft : colors.raised }]}>
                {b.goal > 0 && b.goalAt < 1 ? <View style={[styles.goalTick, { bottom: b.goalAt * STRIP_HEIGHT, backgroundColor: colors.lineStrong }]} /> : null}
                {fill ? <View style={{ height: fill, borderRadius: 8, backgroundColor: color, opacity: b.today || b.hit ? 1 : 0.78 }} /> : null}
              </View>
              <Text style={[type.chip, { color: b.today ? colors.ink : colors.muted, fontFamily: b.today ? fonts.semibold : fonts.medium }]}>{b.letter}</Text>
            </View>
          )
        })}
      </View>
    </View>
  )
}

/** "Your decks": a snapping carousel of compact deck cards, the next one peeking in; the one in front is full size. */
function Decks({ today, lastPractised }: { today: string; lastPractised: Map<string, string> }) {
  const decks = useDecks()
  const cards = useCards()
  const router = useRouter()
  const { spacing } = useTheme()
  const { width } = useWindowDimensions()
  const items = useMemo(() => deckCarousel(decks, cards), [decks, cards])
  const scrollX = useSharedValue(0)
  const onScroll = useAnimatedScrollHandler((e) => {
    scrollX.value = e.contentOffset.x
  })
  // Each deck card takes 85 % of the screen width, so the next one peeks in at the edge.
  const cardWidth = Math.round(width * 0.85)
  const step = cardWidth + spacing.md
  return (
    <View style={{ gap: spacing.md }}>
      <SectionHeader title="Your decks" action={{ label: 'See all', onPress: () => router.navigate('/flashcards') }} />
      {items.length === 0 ? (
        <EmptyState icon={Layers} title="No decks yet" body="Make a deck on the web, then add cards in the Cards tab." />
      ) : (
        <Animated.ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={step}
          decelerationRate="fast"
          disableIntervalMomentum
          onScroll={onScroll}
          scrollEventThrottle={16}
          style={{ marginHorizontal: -spacing.pageX }}
          contentContainerStyle={{ paddingHorizontal: spacing.pageX, gap: spacing.md, paddingVertical: 6 }}
        >
          {items.map((item, i) => (
            <DeckCard
              key={item.deck.id}
              item={item}
              index={i}
              step={step}
              width={cardWidth}
              scrollX={scrollX}
              practised={practisedLabel(lastPractised.get(item.deck.id), today)}
              onPress={() => router.push({ pathname: '/practice', params: { cards: 'all', decks: item.deck.id } })}
            />
          ))}
        </Animated.ScrollView>
      )}
    </View>
  )
}

/** A compact deck card: its initial on a soft tile, a round play button, the name and when you last practised it. */
function DeckCard({ item, index, step, width, scrollX, practised, onPress }: { item: CarouselDeck; index: number; step: number; width: number; scrollX: SharedValue<number>; practised: string; onPress: () => void }) {
  const { colors, type, spacing, radius, shadow, fonts, pastels } = useTheme()
  const reduced = useReducedMotion()
  const lime = item.tone === 'accent'
  const scale = useAnimatedStyle(() => {
    if (reduced) return {}
    const distance = Math.abs(scrollX.value - index * step) / step
    return { transform: [{ scale: interpolate(Math.min(distance, 1), [0, 1], [1, 0.95]) }] }
  })
  const initial = (item.deck.name.match(/[A-Za-zÄÖÜäöüß0-9]/)?.[0] ?? '·').toLocaleUpperCase('de-DE')
  const empty = item.count === 0
  return (
    <Animated.View style={[{ width }, scale]}>
      <Pressable
        onPress={onPress}
        disabled={empty}
        accessibilityRole="button"
        accessibilityLabel={empty ? `${item.deck.name}, no cards yet` : `Practise ${item.deck.name}, ${count(item.count, 'card')}, ${practised.toLowerCase()}`}
        style={[styles.deck, { backgroundColor: lime ? colors.accent : colors.card, borderRadius: radius.block + 4, padding: spacing.lg }, !lime && shadow.card]}
      >
        <View style={[styles.between, { alignItems: 'flex-start' }]}>
          <View style={[styles.initial, { backgroundColor: lime ? 'rgba(22, 24, 26, 0.08)' : pastels[pastelIndex(item.deck.id)] }]}>
            <Text importantForAccessibility="no" style={{ fontFamily: fonts.semibold, fontSize: 20, lineHeight: 24, color: lime ? colors.onAccent : colors.onPastel }}>
              {initial}
            </Text>
          </View>
          {empty ? null : (
            <View style={[styles.play, { backgroundColor: lime ? '#16181A' : colors.accent }]}>
              <Play size={14} color={lime ? colors.accent : colors.onAccent} fill={lime ? colors.accent : colors.onAccent} style={{ marginLeft: 2 }} />
            </View>
          )}
        </View>
        <View style={{ gap: 2 }}>
          <Text style={[type.section, { color: lime ? colors.onAccent : colors.ink }]} numberOfLines={2}>
            {item.deck.name}
          </Text>
          <Text style={[type.chip, numbers, lime ? { color: colors.onAccent, opacity: 0.7 } : { color: colors.muted }]} numberOfLines={1}>
            {empty ? 'No cards yet' : `${count(item.count, 'card')} · ${practised}`}
          </Text>
        </View>
      </Pressable>
    </Animated.View>
  )
}

function useTopicColors(color: TopicColor | undefined) {
  const { topics } = useTheme()
  return topics[color ?? 'stone'] ?? topics.stone
}

/** Two letters for a topic tile: "German" -> "Ge", "Machine learning" -> "ML". */
function abbreviation(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length > 1) return (words[0]![0]! + words[1]![0]!).toUpperCase()
  const [a = '', b = ''] = [...(words[0] ?? '')]
  return (a.toUpperCase() + b.toLowerCase()) || '·'
}

function GoalRow({ row }: { row: TopicProgress }) {
  const { colors, type, fonts } = useTheme()
  const palette = useTopicColors(row.topic.color)
  const { goal, done, left, hit } = row
  // A goal reached while you look: a little success buzz.
  const wasHit = useRef(hit)
  useEffect(() => {
    if (hit && !wasHit.current) haptics.success()
    wasHit.current = hit
  }, [hit])
  return (
    <Row
      left={
        <Tile bg={palette.soft}>
          <Text style={{ fontFamily: fonts.semibold, fontSize: 13, color: palette.ink }}>{abbreviation(row.topic.name)}</Text>
        </Tile>
      }
      title={row.topic.name}
      subtitle={<Text style={[type.small, numbers, { color: colors.muted }]}>{`${formatHM(done)} of ${formatHM(goal)} h`}</Text>}
      right={
        goal === 0 ? (
          <Text style={[type.small, { color: colors.muted }]}>No goal</Text>
        ) : hit ? (
          <Badge label="Done" tone="accent" />
        ) : (
          <View style={styles.mini}>
            <AnimatedBar value={done / goal} height={6} label={`${row.topic.name} progress`} />
            <Text style={[type.chip, numbers, { color: colors.ink2, textAlign: 'right' }]}>{`${formatHM(left)} left`}</Text>
          </View>
        )
      }
    />
  )
}

function DailyGoals({ rows }: { rows: TopicProgress[] }) {
  const { colors, type, spacing } = useTheme()
  const withGoal = rows.filter((r) => r.goal > 0)
  return (
    <View style={{ gap: spacing.md }}>
      <SectionHeader title="Daily goals" detail={withGoal.length ? `${withGoal.filter((r) => r.hit).length} of ${withGoal.length} done` : undefined} />
      {rows.length === 0 ? (
        <EmptyState icon={Target} title="No topics yet" body="Topics hold your daily goals. Add one in Settings and it shows up here." />
      ) : (
        <>
          <GroupedList>
            {rows.map((row) => (
              <GoalRow key={row.topic.id} row={row} />
            ))}
          </GroupedList>
          <Text style={[type.chip, { color: colors.muted, paddingHorizontal: 4 }]}>Resets at midnight</Text>
        </>
      )}
    </View>
  )
}

function SessionRow({ session }: { session: TodaySession }) {
  const { colors, type } = useTheme()
  const palette = useTopicColors(session.topicColor)
  return (
    <Row
      testID="session-row"
      left={
        <Tile bg={session.topicColor ? palette.soft : colors.raised}>
          <Clock3 size={18} strokeWidth={1.9} color={session.topicColor ? palette.ink : colors.ink2} />
        </Tile>
      }
      title={session.topicName ?? 'Deleted topic'}
      subtitle={
        <View style={{ gap: 1 }}>
          <Text style={[type.small, numbers, { color: colors.muted }]}>
            {session.startClock}–{session.endClock}
          </Text>
          {session.note ? (
            <Text style={[type.small, { color: colors.ink2 }]} numberOfLines={2}>
              {session.note}
            </Text>
          ) : null}
        </View>
      }
      right={<Badge label={`${session.minutes} min`} tone="neutral" />}
    />
  )
}

function TodaysSessions({ sessions }: { sessions: TodaySession[] }) {
  const { spacing } = useTheme()
  return (
    <View testID="today-sessions" style={{ gap: spacing.md }}>
      <SectionHeader title="Today's sessions" detail={sessions.length ? `${sessions.length}` : undefined} />
      {sessions.length === 0 ? (
        <EmptyState icon={Clock3} title="No sessions yet today" body="Time you log with the timer shows up here." />
      ) : (
        <GroupedList>
          {sessions.map((s) => (
            <SessionRow key={s.id} session={s} />
          ))}
        </GroupedList>
      )}
    </View>
  )
}

function WordOfTheDay({ card }: { card: Card | undefined }) {
  const { colors, type, spacing, radius, shadow } = useTheme()
  if (!card) {
    return (
      <View testID="word-of-the-day">
        <EmptyState icon={BookOpen} title="Word of the day" body="Add flashcards and a learned word will show up here every day." />
      </View>
    )
  }
  const title = { ...type.title, color: colors.ink }
  return (
    <View testID="word-of-the-day" style={[{ backgroundColor: colors.card, borderRadius: radius.card, padding: spacing.md, gap: spacing.md }, shadow.card]}>
      <CardPicture card={card} height={168} style={{ borderRadius: radius.block }} />
      <View style={{ paddingHorizontal: spacing.sm, paddingBottom: spacing.sm, gap: spacing.xs }}>
        <Text style={[type.small, { color: colors.muted }]}>Word of the day</Text>
        {card.type === 'word' && card.gender ? (
          <Text style={title} {...germanWrap}>
            <Text style={{ color: colors[card.gender] }}>{card.gender}</Text> <Text>{card.german}</Text>
          </Text>
        ) : (
          <Text style={title} {...germanWrap}>
            {germanText(card)}
          </Text>
        )}
        <Text style={[type.body, { color: colors.muted }]}>
          {card.gender ? 'the ' : ''}
          {card.english}
          {card.plural ? ` · plural ${card.plural}` : ''}
        </Text>
        {card.exampleDe ? (
          <View style={{ backgroundColor: colors.raised, borderRadius: radius.row, padding: spacing.md, marginTop: spacing.xs }}>
            <Text style={[type.body, { color: colors.ink }]}>{card.exampleDe}</Text>
          </View>
        ) : null}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center' },
  rowEnd: { flexDirection: 'row', alignItems: 'flex-end' },
  big: { fontSize: 52, lineHeight: 58, letterSpacing: -2.2 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5 },
  day: { flex: 1, alignItems: 'center', gap: 6 },
  dayTrack: { width: '100%', maxWidth: 28, height: 52, borderRadius: 8, overflow: 'hidden', justifyContent: 'flex-end' },
  goalTick: { position: 'absolute', left: 4, right: 4, height: 2, borderRadius: 1 },
  deck: { height: 150, justifyContent: 'space-between' },
  initial: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  play: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  mini: { width: 84, gap: 6 },
})
