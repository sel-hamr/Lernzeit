/*
 * A grammar topic, as the web's TopicPage: how well you know it, the rule, examples to hear, your
 * own words it practises too, and its exercises with their answers.
 */
import { drillQuestions, TENSE_LABEL } from '@lernzeit/core/drills'
import { EXERCISE_KIND, parseExercise, topicProgress, type ExerciseForm } from '@lernzeit/core/grammar'
import { count } from '@lernzeit/core/text'
import type { Card as CardType, GrammarTopic, TopicDrill } from '@lernzeit/core/types'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { BookA, ChevronDown, Pencil, Play, Volume2 } from 'lucide-react-native'
import { Fragment, useMemo, useState, type ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useCards } from '../cards/data'
import { RuleText } from '../components/RuleText'
import { Screen } from '../components/Screen'
import { AnimatedBar, FadeInUp, Pressable } from '../motion'
import { useSay } from '../speech'
import { numbers, useTheme } from '../theme'
import { Badge, Button, Card, EmptyState, IconButton } from '../ui'
import { useExerciseStats, useGrammarTopic } from './data'
import { progressLine } from './model'

const DRILL_ABOUT: Record<TopicDrill['kind'], { unit: string; none: string }> = {
  gender: { unit: 'noun', none: 'None of your cards has a gender yet. Add nouns with der, die or das.' },
  plural: { unit: 'noun', none: 'None of your nouns has a plural yet. Add it in the card editor, such as "die Hunde".' },
  verbs: { unit: 'verb', none: 'None of your verbs has its conjugation yet. Add it in the card editor.' },
}

export function TopicPage() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const topic = useGrammarTopic(String(id))
  const router = useRouter()
  if (!topic) {
    return (
      <Screen title="Grammar">
        <EmptyState icon={BookA} title="This topic does not exist" body="It may have been deleted." action={<Button label="Back to grammar" onPress={() => router.back()} />} />
      </Screen>
    )
  }
  return <Topic topic={topic} />
}

function Topic({ topic }: { topic: GrammarTopic }) {
  const { colors, type, spacing } = useTheme()
  const router = useRouter()
  const cards = useCards()
  const stats = useExerciseStats()
  const say = useSay()
  const [showExercises, setShowExercises] = useState(false)
  const fitting = useMemo(() => (topic.drill ? cards.filter((c) => drillQuestions(c, topic.drill!.kind, topic.drill!.tense).length) : []), [cards, topic.drill])
  const progress = useMemo(() => topicProgress(topic, new Map(stats.map((s) => [s.id, s]))), [topic, stats])
  const canPractise = topic.exercises.length > 0 || fitting.length > 0

  return (
    <Screen
      title={topic.title}
      right={<IconButton icon={Pencil} label="Edit topic" onPress={() => router.push({ pathname: '/grammar/edit', params: { id: topic.id } })} />}
      footer={<Button label="Practise" size="lg" icon={<Play size={15} color={colors.onPrimary} fill={colors.onPrimary} />} disabled={!canPractise} haptic="tap" onPress={() => router.push({ pathname: '/grammar/practice', params: { topic: topic.id } })} />}
    >
      <FadeInUp index={0}>
        <Card style={{ gap: spacing.md }}>
          <View style={{ gap: 2 }}>
            <Text style={[type.title, { color: colors.ink }]} accessibilityRole="header">
              {topic.title}
            </Text>
            <View style={[styles.row, { gap: spacing.xs, flexWrap: 'wrap' }]}>
              {topic.english ? <Text style={[type.body, { color: colors.muted, marginRight: spacing.xs }]}>{topic.english}</Text> : null}
              {topic.level ? <Badge label={topic.level} tone="accent" /> : null}
              <Badge label={topic.group} tone="neutral" />
            </View>
          </View>
          {topic.summary ? <Text style={[type.body, { color: colors.ink2 }]}>{topic.summary}</Text> : null}
          {progress.total > 0 ? (
            <View style={{ gap: spacing.xs }}>
              <AnimatedBar value={progress.share} label="How well you know this topic" />
              <Text style={[type.small, numbers, { color: colors.muted }]}>{progressLine(progress)}</Text>
            </View>
          ) : null}
        </Card>
      </FadeInUp>

      {topic.rule ? (
        <FadeInUp index={1}>
          <Card title="The rule">
            <RuleText text={topic.rule} />
          </Card>
        </FadeInUp>
      ) : null}

      {topic.examples.length ? (
        <FadeInUp index={2}>
          <Card title="Examples" style={{ gap: spacing.sm }}>
            {topic.examples.map((ex, i) => (
              <View key={i} style={[styles.row, { gap: spacing.sm, alignItems: 'flex-start' }]}>
                <IconButton icon={Volume2} label={`Play: ${ex.de}`} variant="ghost" size={36} onPress={() => say(ex.de)} />
                <View style={[styles.grow, { gap: 2, paddingTop: 7 }]}>
                  <Text style={[type.bodyMedium, { color: colors.ink }]}>{ex.de}</Text>
                  {ex.en ? <Text style={[type.small, { color: colors.muted }]}>{ex.en}</Text> : null}
                </View>
              </View>
            ))}
          </Card>
        </FadeInUp>
      ) : null}

      {topic.drill ? (
        <FadeInUp index={3}>
          <FromYourCards drill={topic.drill} cards={fitting} />
        </FadeInUp>
      ) : null}

      <FadeInUp index={4}>
        <Card
          title="Exercises"
          right={
            topic.exercises.length ? (
              <Pressable onPress={() => setShowExercises(!showExercises)} accessibilityRole="button" accessibilityLabel={showExercises ? 'Hide exercises' : 'Show all exercises'} hitSlop={10} style={[styles.row, { gap: 4 }]}>
                <Text style={[type.small, { color: colors.muted }]}>{showExercises ? 'Hide' : 'Show all'}</Text>
                <ChevronDown size={15} strokeWidth={1.8} color={colors.muted} style={{ transform: [{ rotate: showExercises ? '180deg' : '0deg' }] }} />
              </Pressable>
            ) : undefined
          }
        >
          <Text style={[type.body, { color: colors.muted }]}>
            {[topic.exercises.length ? count(topic.exercises.length, 'exercise') : 'No exercises of its own', fitting.length > 0 && `${count(fitting.length, 'word')} from your cards`, progress.weak > 0 && `${progress.weak} to work on`].filter(Boolean).join(' · ')}
          </Text>
          {showExercises
            ? topic.exercises.map((e, i) => {
                const form = parseExercise(e.text)
                return (
                  <View key={e.id} style={[styles.row, { gap: spacing.sm, alignItems: 'flex-start' }]}>
                    <Text style={[type.small, numbers, { color: colors.muted, width: 22, paddingTop: 1 }]}>{`${i + 1}.`}</Text>
                    <View style={[styles.grow, { gap: 2 }]}>
                      {form ? <Solved form={form} /> : <Text style={[type.body, { color: colors.ink }]}>{e.text}</Text>}
                      {e.en ? <Text style={[type.small, { color: colors.muted }]}>{e.en}</Text> : null}
                      {e.why ? <Text style={[type.small, { color: colors.ink2 }]}>{e.why}</Text> : null}
                    </View>
                  </View>
                )
              })
            : null}
        </Card>
      </FadeInUp>
    </Screen>
  )
}

/** An exercise with its answer: the gap filled, the mistake fixed, the sentence in order. */
function Solved({ form }: { form: ExerciseForm }) {
  const { colors, type, fonts } = useTheme()
  const answer = <Text style={{ fontFamily: fonts.semibold, color: colors.accentInk }}>{form.answers.join(' / ')}</Text>
  const wrong = (
    <Text style={{ color: colors.dangerInk, textDecorationLine: 'line-through' }}>{form.type === 'mistake' ? form.shown : ''}</Text>
  )
  const parts: ReactNode[] = form.type === 'gap' ? [form.before, answer, form.after] : form.type === 'mistake' ? [form.before, wrong, ' ', answer, form.after] : form.type === 'write' ? [`${form.prompt} → `, answer] : [answer]
  return (
    <View>
      <Text style={[type.chip, { color: colors.muted }]}>{EXERCISE_KIND[form.type]}</Text>
      <Text style={[type.body, { color: colors.ink }]}>
        {parts.map((part, i) => (
          <Fragment key={i}>{part}</Fragment>
        ))}
      </Text>
    </View>
  )
}

/** Your own words this topic practises too. */
function FromYourCards({ drill, cards }: { drill: TopicDrill; cards: CardType[] }) {
  const { colors, type, spacing } = useTheme()
  const about = DRILL_ABOUT[drill.kind]
  const shown = cards.slice(0, 12)
  return (
    <Card title="From your cards" right={cards.length ? <Text style={[type.small, numbers, { color: colors.muted }]}>{count(cards.length, about.unit)}</Text> : undefined}>
      {!cards.length ? (
        <Text style={[type.body, { color: colors.muted }]}>{about.none}</Text>
      ) : drill.kind === 'verbs' ? (
        shown.slice(0, 5).map((card) => (
          <View key={card.id} style={{ gap: 2 }}>
            <Text style={[type.bodyMedium, { color: colors.ink }]}>{card.german}</Text>
            {(drill.tense ? [drill.tense] : (['present', 'past', 'perfect'] as const)).map((tense) =>
              card.conjugation?.[tense] ? <Text key={tense} style={[type.small, { color: colors.muted }]}>{`${TENSE_LABEL[tense]}: ${card.conjugation[tense]}`}</Text> : null,
            )}
          </View>
        ))
      ) : (
        <View style={[styles.row, { flexWrap: 'wrap', columnGap: spacing.lg, rowGap: spacing.xs }]}>
          {shown.map((card) => (
            <Text key={card.id} style={[type.body, { color: colors.ink }]}>
              {card.gender ? <Text style={{ color: colors[card.gender] }}>{`${card.gender} `}</Text> : null}
              {card.german}
              {drill.kind === 'plural' ? <Text style={{ color: colors.muted }}>{` → ${card.plural}`}</Text> : null}
            </Text>
          ))}
        </View>
      )}
      <Text style={[type.small, { color: colors.muted }]}>Practice mixes questions about your own words in with the exercises.</Text>
    </Card>
  )
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center' },
})
