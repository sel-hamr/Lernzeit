/*
 * Write or edit a grammar topic (the web's TopicEditor): title, section, level, a summary line,
 * the rule, examples and exercises one per line ("German = English // why"), and the card drill
 * it adds. Exercises keep their ids while their text stays, so their scores are kept.
 */
import { exerciseProblem, formatLines, groupTopics, mergeExercises, parseLines } from '@lernzeit/core/grammar'
import { STORY_LEVELS } from '@lernzeit/core/stories'
import type { GrammarTopic, StoryLevel } from '@lernzeit/core/types'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Trash2 } from 'lucide-react-native'
import { useMemo, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Screen } from '../components/Screen'
import { newId } from '../data/ids'
import { FadeInUp } from '../motion'
import { confirmDelete, notice } from '../notice'
import { useLocalLibrary } from '../store/live'
import { useTheme } from '../theme'
import { Button, Card, Chip, Field, SelectRow } from '../ui'
import { deleteTopic, saveTopic, useGrammarTopic, useGrammarTopics } from './data'
import { DRILLS, drillValue } from './model'

export function TopicEditorPage() {
  const { id } = useLocalSearchParams<{ id?: string }>()
  const topic = useGrammarTopic(String(id ?? ''))
  return <TopicEditor key={topic?.id ?? 'new'} topic={topic} />
}

function TopicEditor({ topic }: { topic?: GrammarTopic }) {
  const { colors, type, spacing } = useTheme()
  const router = useRouter()
  const library = useLocalLibrary()
  const topics = useGrammarTopics()
  const [title, setTitle] = useState(topic?.title ?? '')
  const [english, setEnglish] = useState(topic?.english ?? '')
  const [group, setGroup] = useState(topic?.group ?? '')
  const [level, setLevel] = useState<StoryLevel | undefined>(topic?.level)
  const [summary, setSummary] = useState(topic?.summary ?? '')
  const [rule, setRule] = useState(topic?.rule ?? '')
  const [examples, setExamples] = useState(formatLines(topic?.examples ?? []))
  const [exercises, setExercises] = useState(formatLines(topic?.exercises ?? []))
  const [drill, setDrill] = useState(drillValue(topic?.drill))
  const groups = useMemo(() => groupTopics(topics).map((g) => g.group), [topics])
  const exerciseError = useMemo(() => {
    const lines = parseLines(exercises)
    const bad = lines.findIndex((l) => exerciseProblem(l.de))
    return bad < 0 ? undefined : `Line ${bad + 1}: ${exerciseProblem(lines[bad].de)}`
  }, [exercises])
  const ready = !!title.trim() && !exerciseError

  const save = () => {
    if (!ready) return
    try {
      const saved = saveTopic(
        library,
        {
          title,
          english,
          group,
          level,
          summary,
          rule,
          examples: parseLines(examples),
          exercises: mergeExercises(topic?.exercises ?? [], parseLines(exercises), newId),
          drill: DRILLS.find((d) => d.value === drill)?.drill,
        },
        topic?.id,
      )
      if (topic) router.back()
      else router.replace(`/grammar/${saved.id}`)
    } catch (err) {
      notice(err instanceof Error ? err.message : 'Could not save the topic')
    }
  }

  const remove = () =>
    confirmDelete('Delete this topic?', 'Its exercises and their scores are deleted too.', () => {
      if (topic) deleteTopic(library, topic.id)
      router.dismissTo('/more/grammar')
    })

  return (
    <Screen
      title={topic ? 'Edit topic' : 'New topic'}
      footer={
        <View style={[styles.row, { gap: spacing.sm }]}>
          {topic ? <Button label="Delete" variant="danger" icon={<Trash2 size={16} color={colors.dangerInk} />} onPress={remove} /> : null}
          <Button label="Save topic" size="lg" disabled={!ready} onPress={save} haptic="tap" style={styles.grow} />
        </View>
      }
    >
      <FadeInUp index={0}>
        <Card style={{ gap: spacing.md }}>
          <Field label="Title" value={title} onChangeText={setTitle} placeholder="Der Dativ" />
          <Field label="English (optional)" value={english} onChangeText={setEnglish} placeholder="The dative" />
          <Field label="Section" value={group} onChangeText={setGroup} placeholder="My topics" />
          {groups.length ? (
            <View style={styles.wrap}>
              {groups.slice(0, 8).map((g) => (
                <Chip key={g} label={g} selected={group.trim() === g} onPress={() => setGroup(g)} />
              ))}
            </View>
          ) : null}
          <Text style={[type.small, { color: colors.muted, paddingHorizontal: 4 }]}>Level</Text>
          <View style={styles.wrap}>
            {STORY_LEVELS.map((l) => (
              <Chip key={l} label={l} selected={level === l} onPress={() => setLevel(level === l ? undefined : l)} />
            ))}
          </View>
          <Field label="Summary (optional, one line under the title)" value={summary} onChangeText={setSummary} />
        </Card>
      </FadeInUp>
      <FadeInUp index={1}>
        <Card style={{ gap: spacing.md }}>
          <Field label="Rule" value={rule} onChangeText={setRule} multiline style={styles.long} />
          <Text style={[type.chip, { color: colors.muted, paddingHorizontal: 4 }]}>A blank line starts a paragraph. Lines starting with - make a list, | a | b | a table, ### a heading. **bold**, *italic*.</Text>
          <Field label="Examples (one per line: German = English)" value={examples} onChangeText={setExamples} multiline autoCapitalize="none" style={styles.long} />
          <Field label="Exercises (one per line)" value={exercises} onChangeText={setExercises} multiline autoCapitalize="none" style={styles.long} />
          <Text style={[type.chip, { color: exerciseError ? colors.dangerInk : colors.muted, paddingHorizontal: 4 }]}>
            {exerciseError ?? 'Ich helfe {{dem}} Mann. · {{dem|den}} offers choices · {{den>dem}} finds the mistake · ~ puts words in order · Prompt => answer writes a sentence. Add = English and // why.'}
          </Text>
          <SelectRow label="Also practise with my cards" value={drill} options={DRILLS.map((d) => ({ value: d.value, label: d.label }))} onChange={setDrill} />
        </Card>
      </FadeInUp>
    </Screen>
  )
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  long: { minHeight: 140 },
})
