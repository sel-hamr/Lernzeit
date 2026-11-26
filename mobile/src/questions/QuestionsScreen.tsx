/*
 * The Questions page, as the web's: questions in sets, like the speaking part of an exam. Write
 * your own answer once, then answer from memory and compare. Practise one set or all of them.
 */
import { count } from '@lernzeit/core/text'
import type { Question } from '@lernzeit/core/types'
import { useRouter } from 'expo-router'
import { ChevronDown, Ellipsis, MessageCircleQuestionMark, Play, Plus, Sparkles } from 'lucide-react-native'
import { useMemo, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Screen } from '../components/Screen'
import { FadeInUp, Pressable } from '../motion'
import { useStarterPart } from '../starter/useStarterPart'
import { numbers, useTheme } from '../theme'
import { Badge, Button, Card, EmptyState, GroupedList, IconButton, OptionRow, Row, Sheet, Tile } from '../ui'
import { useQuestions, useResponses } from './data'
import { answerCounts, questionSets } from './model'
import { QuestionSheet } from './QuestionSheet'

export function QuestionsScreen() {
  const { colors, type, spacing } = useTheme()
  const router = useRouter()
  const questions = useQuestions()
  const responses = useResponses()
  const [editing, setEditing] = useState<{ question?: Question; set?: string } | null>(null)
  const [expanded, setExpanded] = useState<string[]>([])
  const [menu, setMenu] = useState(false)
  const starter = useStarterPart('questions', ['question', 'questions'])
  const sets = useMemo(() => questionSets(questions), [questions])
  const answers = useMemo(() => answerCounts(responses), [responses])
  const prepared = questions.filter((q) => q.myAnswer).length
  const practise = (set?: string) => router.push({ pathname: '/questions/practice', params: set ? { set } : {} })

  return (
    <Screen
      title="Questions"
      right={
        <View style={[styles.row, { gap: spacing.sm }]}>
          <IconButton icon={Plus} label="New question" onPress={() => setEditing({})} />
          <IconButton icon={Ellipsis} label="More" onPress={() => setMenu(true)} />
        </View>
      }
    >
      {!questions.length ? (
        <FadeInUp>
          <EmptyState
            icon={MessageCircleQuestionMark}
            title="No questions yet"
            body="Practise answering German questions, like in the speaking part of an exam. Write your own answer once, then answer from memory and compare."
            action={
              <View style={{ gap: spacing.sm, alignItems: 'center' }}>
                <Button label="Add starter questions" icon={<Sparkles size={15} strokeWidth={1.9} color={colors.onPrimary} />} busy={starter.busy} onPress={starter.install} />
                <Button label="Write a question" variant="soft" size="sm" onPress={() => setEditing({})} />
              </View>
            }
          />
        </FadeInUp>
      ) : (
        <>
          <FadeInUp index={0}>
            <Card style={{ gap: spacing.md }}>
              <Text style={[type.small, { color: colors.muted }]}>Your questions</Text>
              <View style={[styles.row, { gap: spacing.sm, alignItems: 'baseline' }]}>
                <Text style={[type.hero, { color: colors.ink }]}>{String(questions.length)}</Text>
                <Text style={[type.body, numbers, { color: colors.muted }]}>{`${count(sets.length, 'set')} · ${prepared} with your answer`}</Text>
              </View>
              <Button label="Practise all" icon={<Play size={14} color={colors.onPrimary} fill={colors.onPrimary} />} onPress={() => practise()} haptic="tap" />
            </Card>
          </FadeInUp>
          {sets.map(({ set, questions: items, line }, i) => {
            const open = expanded.includes(set)
            return (
              <FadeInUp key={set} index={1 + i} style={{ gap: spacing.sm }}>
                <Card style={{ gap: spacing.md }}>
                  <View style={[styles.row, { gap: spacing.md }]}>
                    <View style={[styles.grow, { gap: 2 }]}>
                      <Text style={[type.section, { color: colors.ink }]}>{set}</Text>
                      <Text style={[type.small, numbers, { color: colors.muted }]}>{line}</Text>
                    </View>
                    <IconButton icon={Plus} label={`Add a question to ${set}`} variant="raised" size={40} onPress={() => setEditing({ set })} />
                  </View>
                  <View style={[styles.row, { gap: spacing.sm }]}>
                    <Button label="Practise" size="sm" icon={<Play size={13} color={colors.onPrimary} fill={colors.onPrimary} />} onPress={() => practise(set)} style={styles.grow} />
                    <Pressable
                      onPress={() => setExpanded(open ? expanded.filter((s) => s !== set) : [...expanded, set])}
                      accessibilityRole="button"
                      accessibilityLabel={open ? 'Hide questions' : 'Show questions'}
                      style={[styles.row, styles.toggle, { gap: 4, backgroundColor: colors.chip, borderRadius: 999, paddingHorizontal: spacing.lg }]}
                    >
                      <Text style={[type.small, { color: colors.ink }]}>{open ? 'Hide' : 'Show'}</Text>
                      <ChevronDown size={15} strokeWidth={1.8} color={colors.ink} style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }} />
                    </Pressable>
                  </View>
                </Card>
                {open ? (
                  <FadeInUp>
                    <GroupedList>
                      {items.map((q) => (
                        <Row
                          key={q.id}
                          onPress={() => setEditing({ question: q })}
                          title={
                            <Text style={[type.bodyMedium, { color: colors.ink }]} numberOfLines={2}>
                              {q.question}
                            </Text>
                          }
                          subtitle={[q.english, answers.get(q.id) && count(answers.get(q.id)!, 'answer')].filter(Boolean).join(' · ') || undefined}
                          right={<Badge label={q.myAnswer ? 'Your answer' : 'No answer yet'} tone={q.myAnswer ? 'accent' : 'neutral'} />}
                        />
                      ))}
                    </GroupedList>
                  </FadeInUp>
                ) : null}
              </FadeInUp>
            )
          })}
        </>
      )}
      <QuestionSheet open={!!editing} question={editing?.question} set={editing?.set} sets={sets.map((s) => s.set)} onClose={() => setEditing(null)} />
      <Sheet open={menu} onClose={() => setMenu(false)} title="Questions">
        <OptionRow
          label={starter.busy ? 'Adding starter questions…' : 'Add starter questions'}
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

const styles = StyleSheet.create({
  grow: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center' },
  toggle: { height: 40 },
})
