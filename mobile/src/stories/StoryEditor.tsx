/*
 * Write or edit a story (the web's StoryEditor): title, level, the topic its reading time counts
 * toward, the German text (a blank line starts a paragraph), the translation and tags. Deleting
 * keeps the reading time already saved in History.
 */
import { STORY_LEVELS } from '@lernzeit/core/stories'
import type { Story, StoryLevel } from '@lernzeit/core/types'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Trash2 } from 'lucide-react-native'
import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Screen } from '../components/Screen'
import { FadeInUp } from '../motion'
import { confirmDelete, notice } from '../notice'
import { useLocalLibrary } from '../store/live'
import { useTopics } from '../timer/hooks'
import { useTheme } from '../theme'
import { Button, Card, Chip, Field, SelectRow } from '../ui'
import { defaultStoryTopicId, deleteStory, saveStory, useStory } from './data'

export function StoryEditorPage() {
  const { id } = useLocalSearchParams<{ id?: string }>()
  const story = useStory(String(id ?? ''))
  return <StoryEditor key={story?.id ?? 'new'} story={story} />
}

function StoryEditor({ story }: { story?: Story }) {
  const { colors, type, spacing } = useTheme()
  const router = useRouter()
  const library = useLocalLibrary()
  const topics = useTopics()
  const [title, setTitle] = useState(story?.title ?? '')
  const [level, setLevel] = useState<StoryLevel | undefined>(story?.level)
  const [topicId, setTopicId] = useState(story ? (story.topicId ?? '') : (defaultStoryTopicId(library) ?? ''))
  const [text, setText] = useState(story?.text ?? '')
  const [translation, setTranslation] = useState(story?.translation ?? '')
  const [tags, setTags] = useState(story?.tags.join(', ') ?? '')
  const ready = !!title.trim() && !!text.trim()

  const save = () => {
    if (!ready) return
    try {
      const saved = saveStory(library, { title, text, translation, level, topicId: topicId || undefined, tags: tags.split(','), words: story?.words }, story?.id)
      if (story) router.back()
      else router.replace(`/story/${saved.id}`)
    } catch (err) {
      notice(err instanceof Error ? err.message : 'Could not save the story')
    }
  }

  const remove = () =>
    confirmDelete('Delete this story?', 'Reading time already saved stays in History.', () => {
      if (story) deleteStory(library, story.id)
      router.dismissTo('/stories')
    })

  return (
    <Screen
      title={story ? 'Edit story' : 'New story'}
      footer={
        <View style={[styles.row, { gap: spacing.sm }]}>
          {story ? <Button label="Delete" variant="danger" icon={<Trash2 size={16} color={colors.dangerInk} />} onPress={remove} /> : null}
          <Button label="Save story" size="lg" disabled={!ready} onPress={save} haptic="tap" style={styles.grow} />
        </View>
      }
    >
      <FadeInUp index={0}>
        <Card style={{ gap: spacing.md }}>
          <Field label="Title" value={title} onChangeText={setTitle} placeholder="Ein Tag am Meer" />
          <Text style={[type.small, { color: colors.muted, paddingHorizontal: 4 }]}>Level</Text>
          <View style={styles.wrap}>
            {STORY_LEVELS.map((l) => (
              <Chip key={l} label={l} selected={level === l} onPress={() => setLevel(level === l ? undefined : l)} />
            ))}
          </View>
          {topics.length ? (
            <SelectRow
              label="Reading time counts toward"
              value={topicId}
              options={[{ value: '', label: 'No topic' }, ...topics.map((t) => ({ value: t.id, label: t.name }))]}
              onChange={setTopicId}
            />
          ) : null}
        </Card>
      </FadeInUp>
      <FadeInUp index={1}>
        <Card style={{ gap: spacing.md }}>
          <Field label="Text (a blank line starts a new paragraph)" value={text} onChangeText={setText} multiline style={styles.long} />
          <Field label="Translation (optional, paragraph by paragraph)" value={translation} onChangeText={setTranslation} multiline style={styles.long} />
          <Field label="Tags (separate them with commas)" value={tags} onChangeText={setTags} autoCapitalize="none" />
        </Card>
      </FadeInUp>
    </Screen>
  )
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  long: { minHeight: 180 },
})
