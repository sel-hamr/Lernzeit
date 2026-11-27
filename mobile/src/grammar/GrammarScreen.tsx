/*
 * The Grammar page, as the web's: the next topic on your path and today's review on top, then
 * every topic by level (your path) or by section, each with a ring that fills as you learn it.
 */
import { dueExercises, groupTopics, levelGroups, nextTopic, topicProgress, type TopicProgress } from '@lernzeit/core/grammar'
import { count } from '@lernzeit/core/text'
import { formatNextReview, MINUTE } from '@lernzeit/core/time'
import type { ExerciseStat, GrammarTopic } from '@lernzeit/core/types'
import { useRouter } from 'expo-router'
import { ArrowRight, BookA, Check, Ellipsis, Plus, RotateCcw, Sparkles } from 'lucide-react-native'
import { useMemo, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Screen } from '../components/Screen'
import { AnimatedBar, AnimatedRing, FadeInUp, RollingNumber } from '../motion'
import { useStarterPart } from '../starter/useStarterPart'
import { useNow } from '../timer/hooks'
import { numbers, useTheme } from '../theme'
import { Badge, Button, Card, EmptyState, GroupedList, IconButton, OptionRow, Row, SectionHeader, Segmented, Sheet, Tile } from '../ui'
import { useExerciseStats, useGrammarTopics } from './data'

export function GrammarScreen() {
  const { colors, spacing } = useTheme()
  const router = useRouter()
  const topics = useGrammarTopics()
  const stats = useExerciseStats()
  const [bySection, setBySection] = useState(false)
  const [menu, setMenu] = useState(false)
  const starter = useStarterPart('grammarTopics', ['topic', 'topics'])
  const statsById = useMemo(() => new Map(stats.map((s) => [s.id, s])), [stats])
  const progress = useMemo(() => new Map(topics.map((t) => [t.id, topicProgress(t, statsById)])), [topics, statsById])
  const progressOf = (t: GrammarTopic) => progress.get(t.id) ?? topicProgress(t, statsById)
  const groups = useMemo(() => (bySection ? groupTopics(topics) : levelGroups(topics)), [topics, bySection])
  const mastered = [...progress.values()].filter((p) => p.status === 'mastered').length

  const right = (
    <View style={[styles.row, { gap: spacing.sm }]}>
      <IconButton icon={Plus} label="New topic" onPress={() => router.push('/grammar/edit')} />
      <IconButton icon={Ellipsis} label="More" onPress={() => setMenu(true)} />
    </View>
  )

  return (
    <Screen title="Grammar" right={right}>
      {!topics.length ? (
        <FadeInUp>
          <EmptyState
            icon={BookA}
            title="No grammar topics yet"
            body="Each topic has the rule, examples and exercises. The starter topics cover A1 to B1."
            action={
              <View style={{ gap: spacing.sm, alignItems: 'center' }}>
                <Button label="Add starter topics" icon={<Sparkles size={15} strokeWidth={1.8} color={colors.onPrimary} />} busy={starter.busy} onPress={starter.install} />
                <Button label="Write a topic" variant="soft" size="sm" onPress={() => router.push('/grammar/edit')} />
              </View>
            }
          />
        </FadeInUp>
      ) : (
        <>
          <Course topics={topics} progressOf={progressOf} statsById={statsById} mastered={mastered} />
          <FadeInUp index={2}>
            <Segmented
              options={[
                ['path', 'Your path'],
                ['section', 'By section'],
              ]}
              value={bySection ? 'section' : 'path'}
              onChange={(v) => setBySection(v === 'section')}
            />
          </FadeInUp>
          {groups.map(({ group, topics: items }, i) => (
            <FadeInUp key={group} index={3 + i} style={{ gap: spacing.sm }}>
              <SectionHeader title={group} detail={`${items.filter((t) => progressOf(t).status === 'mastered').length} of ${items.length} mastered`} />
              <GroupedList>
                {items.map((t) => (
                  <TopicRow key={t.id} topic={t} progress={progressOf(t)} onPress={() => router.push(`/grammar/${t.id}`)} />
                ))}
              </GroupedList>
            </FadeInUp>
          ))}
        </>
      )}
      <Sheet open={menu} onClose={() => setMenu(false)} title="Grammar">
        <OptionRow
          label={starter.busy ? 'Adding starter topics…' : 'Add starter topics'}
          detail="The ones you do not have yet"
          icon={
            <Tile bg={colors.raised}>
              <Sparkles size={20} strokeWidth={1.8} color={colors.ink} />
            </Tile>
          }
          onPress={() => {
            setMenu(false)
            starter.install()
          }}
        />
      </Sheet>
    </Screen>
  )
}

/** The next topic on your path, and the review of what is due. */
function Course({ topics, progressOf, statsById, mastered }: { topics: GrammarTopic[]; progressOf: (t: GrammarTopic) => TopicProgress; statsById: Map<string, ExerciseStat>; mastered: number }) {
  const { colors, type, spacing } = useTheme()
  const router = useRouter()
  const now = useNow(true, MINUTE)
  const stats = [...statsById.values()]
  const next = nextTopic(topics, statsById)
  const due = dueExercises(topics, stats, now).length
  const nextDue = stats.length ? Math.min(...stats.map((s) => s.due ?? s.lastAt)) : undefined
  const p = next && progressOf(next)
  return (
    <>
      <FadeInUp index={0}>
        <Card style={{ gap: spacing.md }}>
          <View style={[styles.row, { justifyContent: 'space-between' }]}>
            <Text style={[type.small, { color: colors.muted }]}>{p?.status === 'learning' ? 'Continue' : 'Next on your path'}</Text>
            <Text style={[type.small, numbers, { color: colors.muted }]}>{`${mastered} of ${count(topics.length, 'topic')} mastered`}</Text>
          </View>
          {next && p ? (
            <>
              <View style={{ gap: 2 }}>
                <Text style={[type.title, { color: colors.ink }]}>{next.title}</Text>
                <Text style={[type.body, { color: colors.muted }]}>{[next.english, next.level].filter(Boolean).join(' · ')}</Text>
              </View>
              <AnimatedBar value={p.share} color={colors.accent} track={colors.track} label={`${next.title} progress`} />
              <Text style={[type.small, numbers, { color: colors.muted }]}>{`${p.known} of ${count(p.total, 'exercise')} known`}</Text>
              <View style={[styles.row, { gap: spacing.sm }]}>
                {p.status === 'learning' ? (
                  <>
                    <Button label="Practise" variant="primary" icon={<ArrowRight size={16} strokeWidth={2} color={colors.onPrimary} />} onPress={() => router.push({ pathname: '/grammar/practice', params: { topic: next.id } })} style={styles.grow} />
                    <Button label="Read the rule" variant="ghost" onPress={() => router.push(`/grammar/${next.id}`)} style={styles.grow} />
                  </>
                ) : (
                  <Button label="Start: read the rule" icon={<ArrowRight size={16} strokeWidth={2} color={colors.onPrimary} />} onPress={() => router.push(`/grammar/${next.id}`)} style={styles.grow} />
                )}
              </View>
            </>
          ) : (
            <Text style={[type.body, { color: colors.ink }]}>You have mastered every topic. Keep them fresh with the review, or add your own topics.</Text>
          )}
        </Card>
      </FadeInUp>
      <FadeInUp index={1}>
        <Card style={{ gap: spacing.sm }}>
          <Text style={[type.small, { color: colors.muted }]}>Review</Text>
          <View style={[styles.row, { gap: spacing.sm, alignItems: 'baseline' }]}>
            <RollingNumber value={String(due)} style={[type.hero, { color: colors.ink }]} />
            <Text style={[type.body, { color: colors.muted }]}>{due === 1 ? 'exercise due' : 'exercises due'}</Text>
          </View>
          <Text style={[type.small, { color: colors.muted }]}>
            {due
              ? 'Exercises come back days after you get them right, and soon after a mistake, so they stay learned.'
              : nextDue
                ? `Nothing due. The next one is due ${formatNextReview(nextDue, now).toLowerCase()}.`
                : 'Practise a topic, and its exercises come back here to stay learned.'}
          </Text>
          <Button label="Start review" variant={due ? 'primary' : 'soft'} disabled={!due} icon={<RotateCcw size={15} strokeWidth={1.8} color={due ? colors.onPrimary : colors.ink} />} onPress={() => router.push({ pathname: '/grammar/practice', params: { review: '1' } })} style={{ marginTop: spacing.xs }} />
        </Card>
      </FadeInUp>
    </>
  )
}

function TopicRow({ topic, progress, onPress }: { topic: GrammarTopic; progress: TopicProgress; onPress: () => void }) {
  const { colors, type } = useTheme()
  return (
    <Row
      onPress={onPress}
      chevron
      accessibilityLabel={`${topic.title}, ${statusText(progress)}`}
      left={<StatusMark progress={progress} />}
      title={
        <Text style={[type.bodyMedium, { color: colors.ink }]} numberOfLines={1}>
          {topic.title}
          {topic.english ? <Text style={[type.small, { color: colors.muted }]}>{`  ${topic.english}`}</Text> : null}
        </Text>
      }
      subtitle={topic.summary}
      right={progress.weak > 0 ? <Badge label={`${progress.weak} to work on`} tone="danger" /> : progress.status === 'learning' ? <Text style={[type.small, numbers, { color: colors.muted }]}>{`${Math.round(progress.share * 100)}%`}</Text> : undefined}
    />
  )
}

const statusText = (p: TopicProgress) => (p.status === 'mastered' ? 'Mastered' : p.status === 'new' ? 'Not started' : `${Math.round(p.share * 100)}% known`)

/** A ring that fills as you learn a topic, with a tick once it is mastered. */
export function StatusMark({ progress, size = 30 }: { progress: TopicProgress; size?: number }) {
  const { colors } = useTheme()
  if (progress.status === 'mastered') {
    return (
      <View accessibilityLabel="Mastered" style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}>
        <Check size={size * 0.52} strokeWidth={2.6} color={colors.onAccent} />
      </View>
    )
  }
  return <AnimatedRing value={progress.share} size={size} stroke={3.5} color={colors.heat[3]} track={colors.track} label={statusText(progress)} />
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center' },
})
