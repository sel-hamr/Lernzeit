/*
 * A grammar round, as the web's Round: one topic's exercises with questions about your own cards,
 * or the review of what is due from every topic. One question at a time: pick a choice, type, tap
 * the wrong word or build the sentence from words. A wrong answer comes back later in the round;
 * every answer updates its score. The end shows what to work on.
 */
import { buildReviewRound, buildTopicRound, checkQuestion, claudeChatUrl, askClaudePrompt, filledSentence, questionKey, spokenQuestion, topicProgress, type ExerciseQuestion, type RoundItem, type RoundQuestion } from '@lernzeit/core/grammar'
import { requeue, TENSE_LABEL, type DrillResult } from '@lernzeit/core/drills'
import { germanText } from '@lernzeit/core/german'
import type { Card, GrammarTopic } from '@lernzeit/core/types'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { ArrowRight, BookA, Check, Delete, Lightbulb, MessageCircle, Volume2 } from 'lucide-react-native'
import { useMemo, useRef, useState, type ComponentRef } from 'react'
import { KeyboardAvoidingView, Linking, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { CardPicture, GermanLine } from '../cards/CardPicture'
import { useCards } from '../cards/data'
import { DiffText, RoundDone, RoundEmpty, RoundTop } from '../components/RoundParts'
import { useSettings } from '../data/settings'
import { AnimatedBar, FadeInUp, haptics, Pressable } from '../motion'
import { useSay } from '../speech'
import { defaultStoryTopicId } from '../stories/data'
import { useLocalLibrary } from '../store/live'
import { useActiveStudyTime } from '../study/studyTime'
import { numbers, useTheme } from '../theme'
import { Badge, Button, Chip, IconButton } from '../ui'
import { saveDrillAnswer, saveExerciseAnswer, useDrillStats, useExerciseStats, useGrammarTopics } from './data'
import { articleOf, choicesOf, modeOf, otherAnswers, placeholderOf, pronounOf, questionLabel, wrongLabel } from './model'

const NO_TILES: string[] = []

export function GrammarRoundPage() {
  const params = useLocalSearchParams<{ topic?: string; review?: string }>()
  const topics = useGrammarTopics()
  const [round, setRound] = useState(0)
  const topic = params.topic ? topics.find((t) => t.id === params.topic) : undefined
  return <Round key={`${params.topic ?? 'review'}:${round}`} topic={topic} review={!params.topic} topics={topics} onAgain={() => setRound((r) => r + 1)} />
}

function Round({ topic, review, topics, onAgain }: { topic?: GrammarTopic; review: boolean; topics: GrammarTopic[]; onAgain: () => void }) {
  const { colors, type, spacing, radius, shadow } = useTheme()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const library = useLocalLibrary()
  const settings = useSettings()
  const cardList = useCards()
  const exerciseStats = useExerciseStats()
  const drillStats = useDrillStats()
  const say = useSay()
  const cards = useMemo(() => new Map(cardList.map((c) => [c.id, c])), [cardList])
  const topicsById = useMemo(() => new Map(topics.map((t) => [t.id, t])), [topics])
  const statsMap = () => new Map(exerciseStats.map((s) => [s.id, s]))
  const [items, setItems] = useState<RoundItem[]>(() => (review ? buildReviewRound(topics, exerciseStats, Date.now()) : topic ? buildTopicRound({ topic, exerciseStats: statsMap(), cards: cardList, drillStats }) : []))
  const [before] = useState(() => (topic ? topicProgress(topic, statsMap()) : undefined))
  const [index, setIndex] = useState(0)
  const [typed, setTyped] = useState('')
  const [built, setBuilt] = useState<number[]>([])
  const [given, setGiven] = useState<string | null>(null)
  const [result, setResult] = useState<DrillResult | null>(null)
  const [firstTry, setFirstTry] = useState<Map<string, { question: RoundQuestion; correct: boolean }>>(() => new Map())
  const inputRef = useRef<ComponentRef<typeof TextInput>>(null)
  const title = review ? 'Review' : (topic?.title ?? 'Grammar')

  const touch = useActiveStudyTime({ kind: 'grammar', id: topic?.id ?? 'review', topicId: defaultStoryTopicId(library), enabled: settings.countGrammarTime, source: 'grammar', note: `Grammar: ${title}` })

  // A card deleted during the round is passed over.
  const gone = (q: RoundQuestion) => q.kind !== 'exercise' && !cards.has(q.cardId)
  let at = index
  while (at < items.length && gone(items[at].question)) at++
  const item = items[at]
  const question = item?.question
  const card = question && question.kind !== 'exercise' ? cards.get(question.cardId) : undefined
  const questionTopic = question?.kind === 'exercise' ? topicsById.get(question.topicId) : undefined
  const choices = question ? choicesOf(question) : undefined
  const mode = question ? modeOf(question) : 'type'
  const tiles = question?.kind === 'exercise' && question.form.type === 'order' ? question.form.words : NO_TILES
  const spoken = question ? (question.kind === 'gender' && card ? germanText(card) : spokenQuestion(question)) : ''
  const leave = () => (router.canGoBack() ? router.back() : router.replace('/more/grammar'))

  const answer = (value: string) => {
    if (!question || result) return
    const checked = checkQuestion(question, value)
    setResult(checked)
    setGiven(value)
    if (checked.correct) haptics.tap()
    else haptics.warning()
    if (item.attempt === 0) setFirstTry((m) => new Map(m).set(questionKey(question), { question, correct: checked.correct }))
    if (!checked.correct) setItems((list) => requeue(list, at))
    if (question.kind === 'exercise') saveExerciseAnswer(library, question.topicId, question.exerciseId, checked.correct)
    else saveDrillAnswer(library, question.cardId, question.kind, checked.correct)
    if (settings.autoPlayAudio) say(spoken)
  }
  const next = () => {
    setIndex(at + 1)
    setTyped('')
    setBuilt([])
    setGiven(null)
    setResult(null)
  }

  if (!items.length) {
    return (
      <View style={[styles.grow, { backgroundColor: colors.canvas }]}>
        <RoundTop title={title} done={0} total={0} onEnd={leave} />
        <RoundEmpty
          icon={BookA}
          title={review ? 'Nothing to review right now' : 'Nothing to practise here'}
          body={review ? 'Exercises you have practised come back here: soon after a mistake, and days later after right answers.' : 'This topic has no exercises yet. Add some in the editor.'}
          actionLabel={review ? 'Grammar' : 'Back to the topic'}
          onAction={leave}
        />
      </View>
    )
  }

  if (!question) {
    const answers = [...firstTry.values()]
    const missed = answers.filter((a) => !a.correct).map((a) => a.question)
    const after = topic ? topicProgress(topic, statsMap()) : undefined
    return (
      <View style={[styles.grow, { backgroundColor: colors.canvas }]}>
        <RoundTop title={title} done={items.length} total={items.length} onEnd={leave} />
        <RoundDone title="Round done" body={`${answers.length - missed.length} of ${answers.length} right the first time`} leaveLabel={review ? 'Grammar' : 'Topic'} onLeave={leave} onAgain={onAgain}>
          <View style={{ gap: spacing.md }}>
            {topic && before && after && after.total > 0 ? (
              <View style={{ backgroundColor: colors.card, borderRadius: radius.block, padding: spacing.lg, gap: spacing.sm }}>
                <View style={[styles.row, { justifyContent: 'space-between', gap: spacing.md }]}>
                  <Text style={[type.bodyMedium, styles.grow, { color: colors.ink }]} numberOfLines={1}>
                    {topic.title}
                  </Text>
                  <Text style={[type.small, numbers, { color: colors.muted }]}>{`${Math.round(before.share * 100)}% → ${Math.round(after.share * 100)}% known`}</Text>
                </View>
                <AnimatedBar value={after.share} label={`${topic.title}: how much you know`} />
                {after.status === 'mastered' && before.status !== 'mastered' ? <Text style={[type.small, { color: colors.accentInk }]}>Mastered. The review keeps it fresh from now on.</Text> : null}
              </View>
            ) : null}
            {missed.length ? (
              <ScrollView style={{ maxHeight: 220 }} contentContainerStyle={{ backgroundColor: colors.card, borderRadius: radius.block, padding: spacing.lg, gap: spacing.sm }}>
                <Text style={[type.small, { color: colors.muted }]}>To work on · they come back in your review</Text>
                {missed.map((q) => (
                  <MissedRow key={questionKey(q)} question={q} card={q.kind === 'exercise' ? undefined : cards.get(q.cardId)} />
                ))}
              </ScrollView>
            ) : null}
          </View>
        </RoundDone>
      </View>
    )
  }

  const blocked = mode === 'order' ? built.length < tiles.length : !typed.trim()
  return (
    <View style={[styles.grow, { backgroundColor: colors.canvas }]} onTouchStart={touch}>
      <RoundTop title={title} done={at} total={items.length} onEnd={leave} />
      <KeyboardAvoidingView style={styles.grow} behavior="padding">
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, paddingHorizontal: spacing.pageX, paddingTop: spacing.md, paddingBottom: spacing.lg }}>
          <FadeInUp key={`${questionKey(question)}:${at}`} style={[styles.card, { backgroundColor: colors.card, borderRadius: radius.card, padding: spacing.lg, gap: spacing.lg }, shadow.card]}>
            <View style={[styles.row, { gap: spacing.sm }]}>
              <Text style={[type.chip, styles.grow, { color: colors.muted }]} numberOfLines={1}>
                {questionLabel(question, card, questionTopic, review)}
              </Text>
              {result ? <IconButton icon={Volume2} label="Play the answer" variant="raised" size={36} onPress={() => say(spoken)} /> : <View style={{ height: 36 }} />}
            </View>
            {card && question.kind !== 'verbs' ? <CardPicture card={card} height={150} emojiSize={60} style={{ borderRadius: radius.block }} /> : null}
            {question.kind === 'exercise' ? <ExercisePrompt question={question} answered={!!result} given={given} built={built.map((i) => tiles[i])} onTap={(i) => answer(String(i))} /> : <CardPrompt question={question} card={card} answered={!!result} />}
            {mode === 'order' && !result ? <WordBank tiles={tiles} used={built} onPick={(i) => (haptics.select(), setBuilt((b) => [...b, i]))} onUndo={() => setBuilt((b) => b.slice(0, -1))} onClear={() => setBuilt([])} /> : null}
            {result ? <Feedback question={question} result={result} given={given} typed={typed} /> : null}
            {result && question.kind === 'exercise' ? <Explain question={question} topic={questionTopic} given={given ?? ''} correct={result.correct} /> : null}
            {mode === 'type' && !result ? (
              <View style={{ gap: spacing.sm }}>
                <TextInput
                  ref={inputRef}
                  value={typed}
                  onChangeText={setTyped}
                  onSubmitEditing={() => typed.trim() && answer(typed)}
                  placeholder={placeholderOf(question)}
                  placeholderTextColor={colors.muted}
                  accessibilityLabel="Your answer"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoFocus
                  returnKeyType="done"
                  selectionColor={colors.ink}
                  cursorColor={colors.ink}
                  style={[type.section, styles.input, { color: colors.ink, backgroundColor: colors.raised, borderRadius: radius.row }]}
                />
                <View style={[styles.row, { justifyContent: 'center', gap: spacing.sm }]}>
                  {['ä', 'ö', 'ü', 'ß'].map((ch) => (
                    <Chip key={ch} label={ch} onPress={() => (setTyped((t) => t + ch), inputRef.current?.focus())} />
                  ))}
                </View>
              </View>
            ) : null}
          </FadeInUp>
        </ScrollView>
        <View style={{ paddingHorizontal: spacing.pageX, paddingTop: spacing.sm, paddingBottom: Math.max(insets.bottom, spacing.md) + spacing.xs }}>
          {result ? (
            <Button label={at + 1 < items.length ? 'Next' : 'Finish'} size="lg" icon={<ArrowRight size={17} strokeWidth={2} color={colors.onPrimary} />} onPress={next} />
          ) : mode === 'choose' ? (
            <View style={[styles.row, { gap: spacing.sm, flexWrap: 'wrap' }]}>
              {choices!.map((choice) => (
                <ChoiceTile key={choice} choice={choice} wide={choices!.length === 4} onPress={() => answer(choice)} />
              ))}
            </View>
          ) : mode === 'tap' ? (
            <Button label="Don’t know" variant="soft" size="lg" onPress={() => answer('')} />
          ) : (
            <View style={[styles.row, { gap: spacing.sm }]}>
              <Button label="Check" size="lg" disabled={blocked} onPress={() => answer(mode === 'order' ? built.map((i) => tiles[i]).join(' ') : typed)} style={{ flex: 2 }} />
              <Button label="Don’t know" variant="soft" size="lg" onPress={() => answer('')} style={styles.grow} />
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </View>
  )
}

/** A choice button; articles take their colour. */
function ChoiceTile({ choice, wide, onPress }: { choice: string; wide: boolean; onPress: () => void }) {
  const { colors, type, radius, shadow, fonts } = useTheme()
  const article = articleOf(choice)
  return (
    <Pressable
      onPress={onPress}
      haptic="tap"
      scaleTo={0.95}
      accessibilityRole="button"
      accessibilityLabel={choice}
      style={[styles.choice, { flexBasis: wide ? '47%' : '30%', backgroundColor: colors.card, borderRadius: radius.block }, shadow.card]}
    >
      <Text style={[type.section, { fontFamily: fonts.semibold, fontSize: article ? 20 : 17, color: article ? colors[article] : colors.ink }]}>{choice}</Text>
    </Pressable>
  )
}

const BIG = { fontSize: 26, lineHeight: 34, textAlign: 'center' as const }

function ExercisePrompt({ question, answered, given, built, onTap }: { question: ExerciseQuestion; answered: boolean; given: string | null; built: string[]; onTap: (i: number) => void }) {
  const { colors, type, spacing, radius, fonts } = useTheme()
  const { form } = question
  const big = [type.title, BIG, { color: colors.ink }]
  const english = question.english ? <Text style={[type.body, styles.center, { color: colors.muted }]}>{question.english}</Text> : null
  if (form.type === 'gap') {
    return (
      <View style={{ gap: spacing.xs }}>
        <Text style={big}>
          {form.before}
          <Text style={{ color: answered ? colors.accentInk : colors.muted }}>{answered ? form.answers[0] : '___'}</Text>
          {form.after}
        </Text>
        {english}
      </View>
    )
  }
  if (form.type === 'mistake') {
    if (answered) {
      const tapped = given ? form.words[Number(given)] : undefined
      return (
        <View style={{ gap: spacing.xs }}>
          <Text style={big}>
            {form.before}
            <Text style={{ color: colors.accentInk }}>{form.answers[0]}</Text>
            {form.after}
          </Text>
          <Text style={[type.body, styles.center, { color: colors.muted }]}>
            {'The mistake was '}
            <Text style={{ color: colors.dangerInk, textDecorationLine: 'line-through' }}>{form.words[form.wrongIndex]}</Text>
            {tapped && Number(given) !== form.wrongIndex ? ` · you tapped “${tapped}”` : ''}
          </Text>
          {english}
        </View>
      )
    }
    return (
      <View style={{ gap: spacing.md }}>
        <Text style={[type.body, styles.center, { color: colors.muted }]}>Tap the wrong word.</Text>
        <View style={[styles.row, { flexWrap: 'wrap', justifyContent: 'center', gap: spacing.sm }]}>
          {form.words.map((word, i) => (
            <Pressable key={i} onPress={() => onTap(i)} haptic="select" scaleTo={0.94} accessibilityRole="button" accessibilityLabel={word} style={[styles.word, { backgroundColor: colors.raised, borderRadius: radius.row }]}>
              <Text style={[type.section, { fontSize: 20, lineHeight: 26, fontFamily: fonts.semibold, color: colors.ink }]}>{word}</Text>
            </Pressable>
          ))}
        </View>
        {english}
      </View>
    )
  }
  if (form.type === 'order') {
    return (
      <View style={{ gap: spacing.sm }}>
        {english ?? <Text style={[type.body, styles.center, { color: colors.muted }]}>Build the sentence.</Text>}
        <View accessibilityLabel="Your sentence" style={[styles.built, { borderColor: answered ? 'transparent' : colors.lineStrong, borderRadius: radius.row, padding: spacing.md }]}>
          {answered ? (
            <Text style={[type.section, styles.center, { fontSize: 21, lineHeight: 28, color: colors.accentInk }]}>{form.answers[0]}</Text>
          ) : built.length ? (
            <Text style={[type.section, styles.center, { fontSize: 21, lineHeight: 28, color: colors.ink }]}>{`${built.join(' ')}${built.length === form.words.length ? form.end : ''}`}</Text>
          ) : (
            <Text style={[type.body, { color: colors.muted }]}>Tap the words in order</Text>
          )}
        </View>
      </View>
    )
  }
  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={[type.title, BIG, { fontSize: 22, lineHeight: 30, color: colors.ink }]}>{form.prompt}</Text>
      {answered ? <Text style={[type.section, styles.center, { fontSize: 20, lineHeight: 27, color: colors.accentInk }]}>{form.answers[0]}</Text> : null}
      {english}
    </View>
  )
}

function WordBank({ tiles, used, onPick, onUndo, onClear }: { tiles: string[]; used: number[]; onPick: (i: number) => void; onUndo: () => void; onClear: () => void }) {
  const { colors, type, spacing, radius, shadow } = useTheme()
  return (
    <View style={{ gap: spacing.md }}>
      <View style={[styles.row, { flexWrap: 'wrap', justifyContent: 'center', gap: spacing.sm }]} accessibilityLabel="Words">
        {tiles.map((word, i) =>
          used.includes(i) ? (
            <View key={i} style={[styles.word, { borderRadius: radius.row, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.line }]}>
              <Text style={[type.bodyMedium, { fontSize: 18, color: 'transparent' }]}>{word}</Text>
            </View>
          ) : (
            <Pressable key={i} onPress={() => onPick(i)} scaleTo={0.94} accessibilityRole="button" accessibilityLabel={word} style={[styles.word, { backgroundColor: colors.card, borderRadius: radius.row, borderWidth: 1, borderColor: colors.lineStrong }, shadow.card]}>
              <Text style={[type.bodyMedium, { fontSize: 18, color: colors.ink }]}>{word}</Text>
            </Pressable>
          ),
        )}
      </View>
      {used.length ? (
        <View style={[styles.row, { justifyContent: 'center', gap: spacing.sm }]}>
          <Button label="Take back" variant="ghost" size="sm" icon={<Delete size={14} strokeWidth={1.8} color={colors.ink} />} onPress={onUndo} />
          <Button label="Start over" variant="ghost" size="sm" onPress={onClear} />
        </View>
      ) : null}
    </View>
  )
}

function CardPrompt({ question, card, answered }: { question: Exclude<RoundQuestion, ExerciseQuestion>; card?: Card; answered: boolean }) {
  const { colors, type, spacing } = useTheme()
  if (!card) return null
  const big = [type.title, BIG, { color: colors.ink }]
  if (question.kind === 'gender') return answered ? <GermanLine card={card} style={big} /> : <Text style={big}>{`___ ${card.german}`}</Text>
  if (question.kind === 'plural') {
    return (
      <View style={{ gap: spacing.xs }}>
        <GermanLine card={card} style={big} />
        <Text style={[type.body, styles.center, { color: colors.muted }]}>Plural?</Text>
      </View>
    )
  }
  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={big}>
        {`${pronounOf(question)} `}
        <Text style={{ color: answered ? colors.accentInk : colors.muted }}>{answered ? question.answers[0] : '___'}</Text>
      </Text>
      <Text style={[type.body, styles.center, { color: colors.muted }]}>
        <Text style={{ color: colors.ink2 }}>{question.infinitive}</Text>
        {card.english ? ` · ${card.english}` : ''}
      </Text>
      {answered && card.conjugation?.[question.tense] ? <Text style={[type.small, styles.center, { color: colors.muted }]}>{`${TENSE_LABEL[question.tense]}: ${card.conjugation[question.tense]}`}</Text> : null}
    </View>
  )
}

function Feedback({ question, result, given, typed }: { question: RoundQuestion; result: DrillResult; given: string | null; typed: string }) {
  const { colors, type, spacing } = useTheme()
  const { check } = result
  const exact = check ? check.verdict === 'exact' : result.correct
  const label = result.correct ? (exact ? 'Right' : 'Almost') : wrongLabel(question, given)
  const others = otherAnswers(question)
  const yourOrder = question.kind === 'exercise' && question.form.type === 'order' && !result.correct && !!given?.trim()
  return (
    <View style={{ alignItems: 'center', gap: spacing.sm }}>
      <Badge label={[label, ...(check?.notes ?? [])].join(' · ')} tone={result.correct ? (exact ? 'lime' : 'neutral') : 'danger'} icon={result.correct ? <Check size={12} strokeWidth={2.6} color={exact ? colors.onAccent : colors.ink2} /> : undefined} />
      {check && typed.trim() && check.verdict !== 'exact' ? <DiffText parts={check.diff} prefix="You typed " /> : null}
      {yourOrder ? (
        <Text style={[type.body, styles.center, { color: colors.muted }]}>
          {'You built '}
          <Text style={{ color: colors.dangerInk }}>{given}</Text>
        </Text>
      ) : null}
      {question.kind === 'plural' ? <Text style={[type.title, { fontSize: 22, color: colors.ink }]}>{question.answer}</Text> : null}
      {others.length ? <Text style={[type.small, styles.center, { color: colors.muted }]}>{`Also right: ${others.join(' · ')}`}</Text> : null}
    </View>
  )
}

/** Why the answer is right, and Claude for more (opens claude.ai with the question filled in). */
function Explain({ question, topic, given, correct }: { question: ExerciseQuestion; topic?: GrammarTopic; given: string; correct: boolean }) {
  const { colors, type, spacing, radius } = useTheme()
  const href = topic ? claudeChatUrl(askClaudePrompt({ topic, question, answer: given, correct })) : undefined
  if (!question.why && !href) return null
  return (
    <View style={{ backgroundColor: colors.raised, borderRadius: radius.block, padding: spacing.lg, gap: spacing.sm }}>
      {question.why ? (
        <View style={[styles.row, { gap: spacing.sm, alignItems: 'flex-start' }]}>
          <Lightbulb size={16} strokeWidth={1.8} color={colors.accentInk} style={{ marginTop: 2 }} />
          <Text style={[type.body, styles.grow, { color: colors.ink }]}>{question.why}</Text>
        </View>
      ) : null}
      {href ? <Button label={correct ? 'Ask Claude for more examples' : 'Ask Claude why'} variant="ghost" size="sm" icon={<MessageCircle size={14} strokeWidth={1.8} color={colors.ink} />} onPress={() => void Linking.openURL(href)} style={{ alignSelf: 'flex-start' }} /> : null}
    </View>
  )
}

function MissedRow({ question, card }: { question: RoundQuestion; card?: Card }) {
  const { colors, type } = useTheme()
  const style = [type.body, { color: colors.ink }]
  if (question.kind === 'exercise') return <Text style={style}>{filledSentence(question)}</Text>
  if (!card) return null
  if (question.kind === 'gender') return <GermanLine card={card} style={style} />
  if (question.kind === 'plural') return <Text style={style}>{`${germanText(card)} → ${question.answer}`}</Text>
  return (
    <Text style={style}>
      <Text style={{ color: colors.muted }}>{`${pronounOf(question)} ___ (${question.infinitive}) → `}</Text>
      {question.answers[0]}
      <Text style={[type.chip, { color: colors.muted }]}>{`  ${TENSE_LABEL[question.tense].toLowerCase()}`}</Text>
    </Text>
  )
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center' },
  center: { textAlign: 'center' },
  card: { flexGrow: 1, justifyContent: 'center' },
  input: { height: 56, textAlign: 'center', paddingHorizontal: 16 },
  choice: { flexGrow: 1, minHeight: 64, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  word: { paddingHorizontal: 12, paddingVertical: 8 },
  built: { minHeight: 64, borderWidth: 1.5, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
})
