/*
 * Practising questions, as the web's: one question at a time, oldest answered first. Type your
 * answer (it is kept, so you see how your answers change) or show the answer, then compare with
 * your own and the suggested one. Hint words and the English help; everything can be heard.
 */
import { compareWithAnswer, hintWords, lastAnswered, practiceOrder } from '@lernzeit/core/questions'
import { formatDayMonthShort } from '@lernzeit/core/time'
import { dayKeyAt } from '@lernzeit/core/today'
import type { Question, QuestionResponse } from '@lernzeit/core/types'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { ArrowRight, Languages, Lightbulb, MessageCircleQuestionMark, Pencil, Volume2 } from 'lucide-react-native'
import { useMemo, useRef, useState, type ComponentRef, type ReactNode } from 'react'
import { KeyboardAvoidingView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { DiffText, RoundDone, RoundEmpty, RoundTop } from '../components/RoundParts'
import { useSettings } from '../data/settings'
import { FadeInUp, haptics } from '../motion'
import { useSay } from '../speech'
import { defaultStoryTopicId } from '../stories/data'
import { useLocalLibrary } from '../store/live'
import { useActiveStudyTime } from '../study/studyTime'
import { useTheme } from '../theme'
import { Badge, Button, Chip, IconButton } from '../ui'
import { saveResponse, useQuestions, useResponses } from './data'
import { addHint, comparisonLabel, hintUsed, tallyLine, type Tally } from './model'
import { QuestionSheet } from './QuestionSheet'

type Phase = 'ask' | 'answered' | 'shown'

export function QuestionPracticePage() {
  const { set } = useLocalSearchParams<{ set?: string }>()
  const questions = useQuestions()
  const responses = useResponses()
  const [round, setRound] = useState(0)
  return <Practice key={`${set ?? ''}:${round}`} set={set || undefined} questions={questions} responses={responses} onAgain={() => setRound((r) => r + 1)} />
}

function Practice({ set, questions, responses, onAgain }: { set?: string; questions: Question[]; responses: QuestionResponse[]; onAgain: () => void }) {
  const { colors, type, spacing, radius, shadow } = useTheme()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const library = useLocalLibrary()
  const settings = useSettings()
  const say = useSay()
  // The order is fixed when the round starts; edits still show, because questions are looked up live.
  const [order] = useState(() => practiceOrder(set ? questions.filter((q) => q.set === set) : questions, lastAnswered(responses)).map((q) => q.id))
  const [index, setIndex] = useState(0)
  const [phase, setPhase] = useState<Phase>('ask')
  const [typed, setTyped] = useState('')
  const [response, setResponse] = useState<QuestionResponse | null>(null)
  const [tally, setTally] = useState<Tally>({ answered: 0, shown: 0, skipped: 0 })
  const [showEnglish, setShowEnglish] = useState(false)
  const [showWords, setShowWords] = useState(false)
  const [editing, setEditing] = useState(false)
  const inputRef = useRef<ComponentRef<typeof TextInput>>(null)
  const byId = useMemo(() => new Map(questions.map((q) => [q.id, q])), [questions])
  const title = set ?? 'All questions'
  const touch = useActiveStudyTime({ kind: 'questions', id: set ?? 'all', topicId: defaultStoryTopicId(library), enabled: settings.countQuestionTime, source: 'questions', note: set ? `Questions: ${set}` : 'Questions' })
  const leave = () => (router.canGoBack() ? router.back() : router.replace('/more/questions'))

  // A question deleted during the round is passed over.
  let at = index
  while (at < order.length && !byId.has(order[at])) at++
  const question = byId.get(order[at] ?? '')
  const hints = useMemo(() => (question ? hintWords(question) : []), [question])
  const old = useMemo(() => (question ? responses.filter((r) => r.questionId === question.id && r.id !== response?.id).sort((a, b) => b.at - a.at) : []), [responses, question, response])

  const reset = () => {
    setPhase('ask')
    setTyped('')
    setResponse(null)
    setShowWords(false)
  }
  const next = (counted?: keyof Tally) => {
    if (counted) setTally((t) => ({ ...t, [counted]: t[counted] + 1 }))
    setIndex(at + 1)
    reset()
  }
  const answer = () => {
    if (!question || !typed.trim()) return
    setResponse(saveResponse(library, question.id, typed) ?? null)
    setTally((t) => ({ ...t, answered: t.answered + 1 }))
    haptics.tap()
    setPhase('answered')
  }
  const show = () => {
    setTally((t) => ({ ...t, shown: t.shown + 1 }))
    setPhase('shown')
  }

  if (!order.length) {
    return (
      <View style={[styles.grow, { backgroundColor: colors.canvas }]}>
        <RoundTop title={title} done={0} total={0} onEnd={leave} />
        <RoundEmpty icon={MessageCircleQuestionMark} title="No questions here" body={set ? `The set "${set}" has no questions.` : 'Add a question or the starter questions first.'} actionLabel="Back to questions" onAction={leave} />
      </View>
    )
  }
  if (!question) {
    return (
      <View style={[styles.grow, { backgroundColor: colors.canvas }]}>
        <RoundTop title={title} done={order.length} total={order.length} onEnd={leave} />
        <RoundDone title="Round done" body={tallyLine(tally)} leaveLabel="Questions" onLeave={leave} onAgain={onAgain} />
      </View>
    )
  }

  const comparison = phase === 'answered' && question.myAnswer && response ? compareWithAnswer(response.text, question.myAnswer) : undefined
  const zone = library.get<{ value?: unknown }>('kv', 'timeZone')?.value
  return (
    <View style={[styles.grow, { backgroundColor: colors.canvas }]} onTouchStart={touch}>
      <RoundTop title={title} done={at} total={order.length} onEnd={leave} />
      <KeyboardAvoidingView style={styles.grow} behavior="padding">
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: spacing.pageX, paddingTop: spacing.md, paddingBottom: spacing.lg }}>
          <FadeInUp key={question.id + at} style={[{ backgroundColor: colors.card, borderRadius: radius.card, padding: spacing.lg, gap: spacing.lg }, shadow.card]}>
            <View style={[styles.row, { gap: spacing.sm }]}>
              <Text style={[type.chip, styles.grow, { color: colors.muted }]} numberOfLines={1}>
                {[question.set, question.level].filter(Boolean).join(' · ')}
              </Text>
              <IconButton icon={Volume2} label="Play the question" variant="raised" size={36} onPress={() => say(question.question)} />
              <IconButton icon={Pencil} label="Edit question" variant="raised" size={36} onPress={() => setEditing(true)} />
            </View>
            <View style={{ gap: spacing.xs }}>
              <Text style={[type.title, styles.center, { fontSize: 26, lineHeight: 33, color: colors.ink }]}>{question.question}</Text>
              {phase === 'ask' && showEnglish && question.english ? <Text style={[type.body, styles.center, { color: colors.muted }]}>{question.english}</Text> : null}
            </View>
            {phase === 'ask' ? (
              <View style={{ gap: spacing.md }}>
                {question.english || hints.length ? (
                  <View style={[styles.row, { justifyContent: 'center', gap: spacing.sm }]}>
                    {question.english ? <Chip label="English" icon={<Languages size={14} strokeWidth={1.8} color={showEnglish ? colors.onPrimary : colors.ink2} />} selected={showEnglish} onPress={() => setShowEnglish(!showEnglish)} /> : null}
                    {hints.length ? <Chip label="Words" icon={<Lightbulb size={14} strokeWidth={1.8} color={showWords ? colors.onPrimary : colors.ink2} />} selected={showWords} onPress={() => setShowWords(!showWords)} /> : null}
                  </View>
                ) : null}
                {showWords ? (
                  <FadeInUp style={[styles.row, { flexWrap: 'wrap', justifyContent: 'center', gap: spacing.xs }]}>
                    {hints.map((word) => (
                      <HintChip key={word} word={word} used={hintUsed(word, typed)} onPress={() => (setTyped((t) => addHint(t, word)), inputRef.current?.focus())} />
                    ))}
                  </FadeInUp>
                ) : null}
                <TextInput
                  ref={inputRef}
                  value={typed}
                  onChangeText={setTyped}
                  multiline
                  placeholder="Type your answer…"
                  placeholderTextColor={colors.muted}
                  accessibilityLabel="Your answer"
                  autoCapitalize="sentences"
                  autoCorrect={false}
                  selectionColor={colors.ink}
                  cursorColor={colors.ink}
                  style={[type.body, styles.input, { color: colors.ink, backgroundColor: colors.raised, borderRadius: radius.row, padding: spacing.lg }]}
                />
                <View style={[styles.row, { justifyContent: 'center', gap: spacing.sm }]}>
                  {['ä', 'ö', 'ü', 'ß'].map((ch) => (
                    <Chip key={ch} label={ch} onPress={() => (setTyped((t) => t + ch), inputRef.current?.focus())} />
                  ))}
                </View>
              </View>
            ) : (
              <FadeInUp style={{ gap: spacing.lg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, paddingTop: spacing.lg }}>
                {phase === 'answered' && response ? (
                  <Line label="You">
                    {comparison?.kind === 'close' ? <DiffText parts={comparison.diff} /> : <Text style={[type.body, { color: colors.ink }]}>{response.text}</Text>}
                    {comparison ? <Badge label={comparisonLabel(comparison).label} tone={comparisonLabel(comparison).tone} /> : null}
                  </Line>
                ) : null}
                <Line label="Your answer">
                  {question.myAnswer ? (
                    <Spoken text={question.myAnswer} onPlay={say} />
                  ) : (
                    <View style={[styles.row, { gap: spacing.sm }]}>
                      <Text style={[type.body, { color: colors.muted }]}>None yet.</Text>
                      <Button label="Write your answer" variant="ghost" size="sm" onPress={() => setEditing(true)} />
                    </View>
                  )}
                </Line>
                {question.suggested ? (
                  <Line label="Suggested">
                    <Spoken text={question.suggested} onPlay={say} />
                  </Line>
                ) : null}
                {question.english ? (
                  <Line label="English">
                    <Text style={[type.body, { color: colors.muted }]}>{question.english}</Text>
                  </Line>
                ) : null}
                {old.length ? (
                  <Line label="Before">
                    {old.slice(0, 3).map((r) => (
                      <View key={r.id} style={{ gap: 2 }}>
                        <Text style={[type.chip, { color: colors.muted }]}>{formatDayMonthShort(dayKeyAt(r.at, typeof zone === 'string' ? zone : undefined))}</Text>
                        <Text style={[type.body, { color: colors.ink2 }]}>{r.text}</Text>
                      </View>
                    ))}
                    {old.length > 3 ? <Text style={[type.chip, { color: colors.muted }]}>{`and ${old.length - 3} more`}</Text> : null}
                  </Line>
                ) : null}
              </FadeInUp>
            )}
          </FadeInUp>
        </ScrollView>
        <View style={{ paddingHorizontal: spacing.pageX, paddingTop: spacing.sm, paddingBottom: Math.max(insets.bottom, spacing.md) + spacing.xs }}>
          {phase === 'ask' ? (
            <View style={[styles.row, { gap: spacing.sm }]}>
              <Button label="Answer" size="lg" disabled={!typed.trim()} onPress={answer} style={{ flex: 1.4 }} />
              <Button label="Show answer" variant="soft" size="lg" onPress={show} style={{ flex: 1.4 }} />
              <Button label="Skip" variant="ghost" size="lg" onPress={() => next('skipped')} style={styles.grow} />
            </View>
          ) : (
            <Button label={at + 1 < order.length ? 'Next' : 'Finish'} size="lg" icon={<ArrowRight size={17} strokeWidth={2} color={colors.onPrimary} />} onPress={() => next()} />
          )}
        </View>
      </KeyboardAvoidingView>
      <QuestionSheet open={editing} question={question} sets={[]} onClose={() => setEditing(false)} onDeleted={reset} />
    </View>
  )
}

function Line({ label, children }: { label: string; children: ReactNode }) {
  const { colors, type, spacing } = useTheme()
  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={[type.chip, { color: colors.muted }]}>{label}</Text>
      <View style={{ gap: spacing.sm, alignItems: 'flex-start' }}>{children}</View>
    </View>
  )
}

function Spoken({ text, onPlay }: { text: string; onPlay: (text: string) => void }) {
  const { colors, type, spacing } = useTheme()
  return (
    <View style={[styles.row, { gap: spacing.sm, alignItems: 'flex-start' }]}>
      <Text style={[type.body, styles.grow, { color: colors.ink }]}>{text}</Text>
      <IconButton icon={Volume2} label="Listen" variant="ghost" size={32} onPress={() => onPlay(text)} />
    </View>
  )
}

function HintChip({ word, used, onPress }: { word: string; used: boolean; onPress: () => void }) {
  const { colors } = useTheme()
  // Words not in your answer yet carry a lime dot.
  return <Chip label={word} onPress={onPress} icon={used ? undefined : <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accentInk }} />} />
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center' },
  center: { textAlign: 'center' },
  input: { minHeight: 96, textAlignVertical: 'top' },
})
