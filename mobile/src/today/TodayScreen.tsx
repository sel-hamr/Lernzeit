import { germanText } from '@lernzeit/core/german'
import { formatPracticeTime } from '@lernzeit/core/practice'
import { count } from '@lernzeit/core/text'
import { elapsedMs, isPaused, remainingMs } from '@lernzeit/core/timer'
import { formatHM, formatTimer } from '@lernzeit/core/time'
import type { TodaySession, TodayView, TopicProgress } from '@lernzeit/core/today'
import type { Card, TopicColor } from '@lernzeit/core/types'
import { useRouter } from 'expo-router'
import { BookOpen, Clock3, Flame, Layers, Play, Target, Zap } from 'lucide-react-native'
import { useEffect, useMemo, useRef } from 'react'
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import Animated, { interpolate, useAnimatedScrollHandler, useAnimatedStyle, useReducedMotion, useSharedValue, type SharedValue } from 'react-native-reanimated'
import { CardPicture, germanWrap } from '../cards/CardPicture'
import { useCards, useDecks } from '../cards/data'
import { useHiddenFeatures } from '../features'
import { AnimatedBar, FadeInUp, haptics, Pressable, RollingNumber } from '../motion'
import { numbers, useTheme } from '../theme'
import { useActiveTimer, useNow } from '../timer/hooks'
import { Badge, Button, EmptyState, GroupedList, Row, SectionHeader, Tile } from '../ui'
import { deckCarousel, type CarouselDeck } from './decks'
import { useTodayView } from './useTodayView'

/** Today: the hero with today's time, your decks, the goals, the sessions and the word, live from the local store. */
export function TodayScreen() {
  const view = useTodayView()
  const { colors, spacing } = useTheme()
  return (
    <ScrollView style={{ backgroundColor: colors.canvas }} contentContainerStyle={{ paddingHorizontal: spacing.pageX, paddingTop: spacing.xs, paddingBottom: spacing.xxl, gap: spacing.cardGap }}>
      <RunningTimer view={view} />
      <FadeInUp index={0}>
        <Hero view={view} />
      </FadeInUp>
      <FadeInUp index={1}>
        <Stats view={view} />
      </FadeInUp>
      <FadeInUp index={2}>
        <Decks />
      </FadeInUp>
      <FadeInUp index={3}>
        <DailyGoals rows={view.progress.topics} />
      </FadeInUp>
      <FadeInUp index={4}>
        <TodaysSessions sessions={view.sessions} />
      </FadeInUp>
      <FadeInUp index={5}>
        <WordOfTheDay card={view.word} />
      </FadeInUp>
    </ScrollView>
  )
}

/** "No goals today", "Every goal reached" or "1:20 h left". */
function goalStatus(view: TodayView): string {
  const { goalCount, totalLeft } = view.progress
  if (goalCount === 0) return 'No goals today'
  if (totalLeft === 0) return 'Every goal reached'
  return `${formatHM(totalLeft)} h left`
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

/** Time studied today against the goals, a big number, a bar and the way to the timer. */
function Hero({ view }: { view: TodayView }) {
  const { colors, type, spacing, radius, shadow } = useTheme()
  const router = useRouter()
  const timer = useActiveTimer()
  const timerOn = !useHiddenFeatures().includes('timer')
  const { totalDone, totalGoal } = view.progress
  return (
    <View style={[{ backgroundColor: colors.card, borderRadius: radius.card, padding: spacing.xl, gap: spacing.md }, shadow.card]}>
      <View style={styles.between}>
        <Text style={[type.small, { color: colors.muted }]}>Studied today</Text>
        <Badge label={goalStatus(view)} tone={view.progress.goalCount > 0 && view.progress.totalLeft === 0 ? 'lime' : 'neutral'} />
      </View>
      <View style={{ gap: 2 }}>
        <RollingNumber value={`${formatHM(totalDone)} h`} style={[type.hero, { color: colors.ink }]} />
        {totalGoal ? <Text style={[type.small, numbers, { color: colors.muted }]}>{`of ${formatHM(totalGoal)} h goal`}</Text> : null}
      </View>
      <AnimatedBar value={totalGoal ? totalDone / totalGoal : 0} height={10} label="Today's goals progress" />
      {timerOn ? (
        <Button
          label={timer ? 'Open the timer' : 'Start studying'}
          icon={<Play size={15} color={colors.onPrimary} fill={colors.onPrimary} />}
          onPress={() => router.navigate('/timer')}
          style={{ marginTop: spacing.xs }}
        />
      ) : null}
    </View>
  )
}

/** Flashcards practised and the streak, as two tiles. */
function Stats({ view }: { view: TodayView }) {
  const { practised, streak } = view
  return (
    <View style={styles.tiles}>
      <StatTile icon={Zap} value={formatPracticeTime(practised.ms)} label={`${count(practised.reviewed, 'card')} practised`} />
      <StatTile icon={Flame} value={count(streak.days, 'day')} label={streak.topicName ? `${streak.topicName} streak` : 'Streak'} />
    </View>
  )
}

function StatTile({ icon: Icon, value, label }: { icon: typeof Zap; value: string; label: string }) {
  const { colors, type, spacing, radius, shadow } = useTheme()
  return (
    <View style={[styles.tile, { backgroundColor: colors.card, borderRadius: radius.card, padding: spacing.lg, gap: spacing.sm }, shadow.card]}>
      <Tile bg={colors.raised} size={36}>
        <Icon size={18} strokeWidth={1.8} color={colors.ink2} />
      </Tile>
      <RollingNumber value={value} fit style={[type.figure, { color: colors.ink }]} />
      <Text style={[type.chip, { color: colors.muted }]} numberOfLines={2}>
        {label}
      </Text>
    </View>
  )
}

/** "Your decks": a snapping carousel, the next card peeking in; the one in front is full size, the rest at 0.94. */
function Decks() {
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
  const cardWidth = Math.min(300, Math.round(width - spacing.pageX * 2 - 64))
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
              onPress={() => router.push({ pathname: '/practice', params: { cards: 'all', decks: item.deck.id } })}
            />
          ))}
        </Animated.ScrollView>
      )}
    </View>
  )
}

function DeckCard({ item, index, step, width, scrollX, onPress }: { item: CarouselDeck; index: number; step: number; width: number; scrollX: SharedValue<number>; onPress: () => void }) {
  const { colors, type, spacing, radius, shadow, fonts } = useTheme()
  const reduced = useReducedMotion()
  const tone = { accent: { bg: colors.accent, fg: colors.onAccent }, inverse: { bg: colors.inverse, fg: colors.onInverse }, card: { bg: colors.card, fg: colors.ink } }[item.tone]
  const scale = useAnimatedStyle(() => {
    if (reduced) return {}
    const distance = Math.abs(scrollX.value - index * step) / step
    return { transform: [{ scale: interpolate(Math.min(distance, 1), [0, 1], [1, 0.94]) }] }
  })
  const pattern = item.deck.name.replace(/[^A-Za-zÄÖÜäöüß]/g, '').slice(0, 6).toUpperCase()
  const empty = item.count === 0
  return (
    <Animated.View style={[{ width }, scale]}>
      <Pressable
        onPress={onPress}
        disabled={empty}
        accessibilityRole="button"
        accessibilityLabel={empty ? `${item.deck.name}, no cards yet` : `Practise ${item.deck.name}, ${count(item.count, 'card')}`}
        style={[styles.deck, { backgroundColor: tone.bg, borderRadius: radius.card, padding: spacing.xl }, item.tone === 'card' && shadow.card]}
      >
        <Text importantForAccessibility="no" numberOfLines={1} style={[styles.pattern, { color: tone.fg, fontFamily: fonts.semibold }]}>
          {pattern}
        </Text>
        <View style={{ gap: 2 }}>
          <Text style={[type.section, { color: tone.fg }]} numberOfLines={2}>
            {item.deck.name}
          </Text>
          <Text style={[type.small, numbers, { color: tone.fg, opacity: 0.7 }]}>{empty ? 'No cards yet' : count(item.count, 'card')}</Text>
        </View>
        {empty ? null : (
          <View style={[styles.practise, { backgroundColor: item.tone === 'card' ? colors.accent : 'rgba(255, 255, 255, 0.9)', borderRadius: radius.pill }]}>
            <Play size={11} color={colors.onAccent} fill={colors.onAccent} />
            <Text style={[type.chip, { color: colors.onAccent, fontFamily: fonts.semibold }]}>Practise</Text>
          </View>
        )}
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
  tiles: { flexDirection: 'row', gap: 12 },
  tile: { flex: 1 },
  deck: { height: 156, justifyContent: 'space-between', overflow: 'hidden' },
  pattern: { position: 'absolute', right: -6, bottom: -14, fontSize: 56, lineHeight: 64, letterSpacing: -3, opacity: 0.1 },
  practise: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 6 },
  mini: { width: 84, gap: 6 },
})
