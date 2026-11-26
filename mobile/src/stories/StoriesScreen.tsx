import type { Story } from '@lernzeit/core/types'
import { count } from '@lernzeit/core/text'
import { useRouter } from 'expo-router'
import { BookOpen, Ellipsis, Plus, Sparkles, WandSparkles } from 'lucide-react-native'
import { useMemo, useState } from 'react'
import { FlatList, StyleSheet, Text, View } from 'react-native'
import { FadeInUp, Pressable } from '../motion'
import { useTabBarSpace } from '../components/BottomBar'
import { useStarterPart } from '../starter/useStarterPart'
import { useTheme } from '../theme'
import { Badge, Button, EmptyState, IconButton, OptionRow, Sheet, Tile } from '../ui'
import { AiStorySheet } from './AiStorySheet'
import { useStories, useVocabulary } from './data'
import { storyTile, type Vocabulary } from './model'
import { CoverageBar, StoryCover } from './parts'

/** The Stories tab: every story with its cover, how much of it your decks cover, and how hard it reads now. */
export function StoriesScreen() {
  const { colors, type, spacing } = useTheme()
  const router = useRouter()
  const stories = useStories()
  const vocabulary = useVocabulary()
  const [ai, setAi] = useState(false)
  const [menu, setMenu] = useState(false)
  const starter = useStarterPart('stories', ['story', 'stories'])
  const barSpace = useTabBarSpace()
  const read = stories.filter((s) => s.readCount > 0).length

  const header = (
    <View style={{ gap: spacing.md, paddingBottom: spacing.sm }}>
      <View style={[styles.row, { gap: spacing.sm }]}>
        <Text style={[type.small, styles.grow, { color: colors.muted, paddingHorizontal: 4 }]} numberOfLines={1}>
          {`${count(stories.length, 'story', 'stories')} · ${read} read · tap any word while you read`}
        </Text>
        <IconButton icon={Ellipsis} label="More" onPress={() => setMenu(true)} />
      </View>
      <View style={[styles.row, { gap: spacing.sm }]}>
        <Button label="Write with AI" icon={<WandSparkles size={16} strokeWidth={1.9} color={colors.onPrimary} />} onPress={() => setAi(true)} style={styles.grow} />
        <Button label="New story" variant="soft" icon={<Plus size={17} strokeWidth={2} color={colors.ink} />} onPress={() => router.push('/story/edit')} style={styles.grow} />
      </View>
    </View>
  )

  return (
    <View style={[styles.grow, { backgroundColor: colors.canvas }]}>
      <FlatList
        data={stories}
        keyExtractor={(s) => s.id}
        ListHeaderComponent={stories.length ? header : undefined}
        ListEmptyComponent={
          <FadeInUp>
            <EmptyState
              icon={BookOpen}
              title="No stories yet"
              body="Read short German stories with your decks. Words you are learning light up, and any word can become a card."
              action={
                <View style={{ gap: spacing.sm, alignItems: 'center' }}>
                  <Button label="Add starter stories" icon={<Sparkles size={15} strokeWidth={1.9} color={colors.onPrimary} />} busy={starter.busy} onPress={starter.install} />
                  <View style={[styles.row, { gap: spacing.sm }]}>
                    <Button label="Write with AI" variant="soft" size="sm" onPress={() => setAi(true)} />
                    <Button label="Write a story" variant="soft" size="sm" onPress={() => router.push('/story/edit')} />
                  </View>
                </View>
              }
            />
          </FadeInUp>
        }
        contentContainerStyle={{ paddingHorizontal: spacing.pageX, paddingTop: spacing.xs, paddingBottom: barSpace, gap: spacing.cardGap }}
        renderItem={({ item, index }) => {
          const tile = <StoryTile story={item} vocabulary={vocabulary} onPress={() => router.push(`/story/${item.id}`)} />
          return index < 8 ? <FadeInUp index={index}>{tile}</FadeInUp> : tile
        }}
      />
      <Sheet open={menu} onClose={() => setMenu(false)} title="Stories">
        <OptionRow
          label={starter.busy ? 'Adding starter stories…' : 'Add starter stories'}
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
      <AiStorySheet open={ai} onClose={() => setAi(false)} onRead={(id) => router.push(`/story/${id}`)} />
    </View>
  )
}

function StoryTile({ story, vocabulary, onPress }: { story: Story; vocabulary: Vocabulary; onPress: () => void }) {
  const { colors, type, spacing, radius, shadow } = useTheme()
  const tile = useMemo(() => storyTile(story, vocabulary), [story, vocabulary])
  return (
    <Pressable
      onPress={onPress}
      scaleTo={0.98}
      accessibilityRole="button"
      accessibilityLabel={[story.title, story.level, tile.difficulty?.label, tile.meta].filter(Boolean).join(', ')}
      style={[styles.row, { alignItems: 'stretch', backgroundColor: colors.card, borderRadius: radius.block, padding: spacing.md, gap: spacing.md }, shadow.card]}
    >
      <StoryCover story={story} initial={tile.initial} />
      <View style={[styles.grow, { gap: 6, justifyContent: 'space-between' }]}>
        <View style={{ gap: 2 }}>
          <Text style={[type.section, { color: colors.ink }]} numberOfLines={1}>
            {story.title}
          </Text>
          <Text style={[type.small, { color: colors.muted }]} numberOfLines={2}>
            {tile.preview}
          </Text>
        </View>
        <View style={{ gap: 6 }}>
          <View style={[styles.row, { gap: spacing.xs, flexWrap: 'wrap' }]}>
            {tile.difficulty ? <Badge label={tile.difficulty.label} tone={tile.difficulty.tone} /> : null}
            {tile.read ? <Badge label={tile.read} tone="neutral" /> : null}
          </View>
          <CoverageBar coverage={tile.coverage} height={5} />
          <Text style={[type.chip, { color: colors.muted }]} numberOfLines={1}>{`${tile.inDecks} · ${tile.meta}`}</Text>
        </View>
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center' },
})
