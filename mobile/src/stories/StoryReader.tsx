/*
 * The story reader, as the web's (ReaderPage): every word can be tapped for its note and card,
 * words from your decks light up by how well you know them and nouns take their article's colour.
 * Each paragraph can be heard, or the whole story, with expo-speech. Active reading time counts
 * toward the story's topic, and "Mark as read" counts the read.
 */
import { readingMinutes, sentenceAt, splitParagraphs, type Piece } from '@lernzeit/core/reader'
import { indexStoryWords, storyWordAt } from '@lernzeit/core/storyWords'
import { count } from '@lernzeit/core/text'
import type { Story } from '@lernzeit/core/types'
import * as Speech from 'expo-speech'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { BookOpen, Check, ChevronLeft, Ellipsis, Highlighter, Languages, Pencil, Square, Volume2 } from 'lucide-react-native'
import { useEffect, useMemo, useState } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useSettings } from '../data/settings'
import { FadeInUp, haptics } from '../motion'
import { notice } from '../notice'
import { useSay } from '../speech'
import { useLocalLibrary } from '../store/live'
import { useActiveStudyTime } from '../study/studyTime'
import { numbers, useTheme } from '../theme'
import { Badge, Button, Card, EmptyState, IconButton, OptionRow, Sheet, Tile, ToggleRow } from '../ui'
import { markStoryOpened, markStoryRead, useStory, useVocabulary } from './data'
import { annotateStory, difficulty, genderOf, percent, readLabel, statusOf } from './model'
import { CoverageBar, CoverageLegend, wordLook } from './parts'
import { WordSheet, type TappedWord } from './WordSheet'

export function StoryReaderPage() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const story = useStory(String(id))
  const { colors, spacing } = useTheme()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  if (!story) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.canvas, paddingTop: insets.top + spacing.xxl, paddingHorizontal: spacing.pageX }}>
        <EmptyState icon={BookOpen} title="This story is not here" body="It may have been deleted." action={<Button label="All stories" onPress={() => router.replace('/stories')} />} />
      </View>
    )
  }
  return <Reader key={story.id} story={story} />
}

function Reader({ story }: { story: Story }) {
  const theme = useTheme()
  const { colors, type, spacing, radius } = theme
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const library = useLocalLibrary()
  const settings = useSettings()
  const vocabulary = useVocabulary()
  const say = useSay()
  const [highlights, setHighlights] = useState(true)
  const [translation, setTranslation] = useState(false)
  const [menu, setMenu] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [selected, setSelected] = useState<{ paragraph: number; start: number } | null>(null)

  const annotated = useMemo(() => annotateStory(story, vocabulary), [story, vocabulary])
  const storyWords = useMemo(() => indexStoryWords(splitParagraphs(story.text), story.words), [story.text, story.words])
  const { coverage } = annotated
  const level = difficulty(coverage)

  useEffect(() => markStoryOpened(library, story.id), [library, story.id])
  const touch = useActiveStudyTime({ kind: 'reading', id: story.id, topicId: story.topicId, enabled: settings.countReadingTime, source: 'reading', note: `Reading: ${story.title}` })

  const tapped: TappedWord | null = useMemo(() => {
    if (!selected) return null
    const paragraph = annotated.paragraphs[selected.paragraph]
    const piece = paragraph?.pieces.find((p) => p.words && p.start === selected.start)
    if (!paragraph || !piece) return null
    return { word: piece.text, sentence: sentenceAt(paragraph.text, piece.start), cardIds: piece.cardIds, match: storyWordAt(storyWords, selected.paragraph, piece) }
  }, [selected, annotated, storyWords])

  const listenAll = () => {
    if (playing) {
      Speech.stop()
      setPlaying(false)
      return
    }
    Speech.stop()
    setPlaying(true)
    const paragraphs = annotated.paragraphs.map((p) => p.text)
    paragraphs.forEach((text, i) =>
      Speech.speak(text, { language: 'de-DE', rate: settings.speechRate, voice: settings.voiceURI, onDone: i === paragraphs.length - 1 ? () => setPlaying(false) : undefined, onStopped: () => setPlaying(false), onError: () => setPlaying(false) }),
    )
  }
  const sayOne = (text: string) => {
    setPlaying(false)
    say(text)
  }

  const finish = () => {
    markStoryRead(library, story.id)
    haptics.success()
    notice('Marked as read')
  }

  const subtitle = [story.level, count(coverage.words, 'word'), `${readingMinutes(coverage.words)} min read`, readLabel(story.readCount)?.toLowerCase()].filter(Boolean).join(' · ')
  const select = (paragraph: number, piece: Piece) => {
    haptics.select()
    setSelected({ paragraph, start: piece.start })
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas, paddingTop: insets.top }} onTouchStart={touch}>
      <View style={[styles.header, { paddingHorizontal: spacing.pageX - 4, gap: spacing.sm }]}>
        <IconButton icon={ChevronLeft} label="Back" iconSize={22} onPress={() => (router.canGoBack() ? router.back() : router.replace('/stories'))} />
        <View style={styles.grow} />
        <IconButton icon={playing ? Square : Volume2} label={playing ? 'Stop' : 'Listen to the story'} variant={playing ? 'accent' : 'card'} haptic="tap" onPress={listenAll} />
        <IconButton icon={Ellipsis} label="Reader options" onPress={() => setMenu(true)} />
      </View>
      <ScrollView onScrollBeginDrag={touch} contentContainerStyle={{ paddingHorizontal: spacing.pageX, paddingTop: spacing.sm, paddingBottom: insets.bottom + spacing.xxxl, gap: spacing.cardGap }}>
        <FadeInUp index={0} style={{ gap: 4, paddingHorizontal: 4, paddingBottom: spacing.sm }}>
          <Text style={[type.title, { color: colors.ink }]} accessibilityRole="header">
            {story.title}
          </Text>
          <Text style={[type.small, numbers, { color: colors.muted }]}>{subtitle}</Text>
        </FadeInUp>

        <FadeInUp index={1}>
          <Card style={{ gap: spacing.md }}>
            <View style={[styles.row, { gap: spacing.sm, flexWrap: 'wrap' }]}>
              {level ? <Badge label={level.label} tone={level.tone} /> : null}
              <Text style={[type.small, numbers, styles.grow, { color: colors.muted }]}>{`${percent(coverage.known + coverage.learning, coverage.words)}% known or learning · ${percent(coverage.words - coverage.unknown, coverage.words)}% in your decks`}</Text>
            </View>
            <CoverageBar coverage={coverage} />
            <CoverageLegend coverage={coverage} />
          </Card>
        </FadeInUp>

        <FadeInUp index={2}>
          <Card style={{ gap: spacing.xxl, paddingVertical: spacing.xxl }}>
            {annotated.paragraphs.map((paragraph, index) => (
              <View key={index} style={{ gap: spacing.sm }}>
                <View style={[styles.row, { alignItems: 'flex-start', gap: spacing.sm }]}>
                  <Text style={[styles.text, { color: colors.ink, fontFamily: theme.fonts.regular }]}>
                    {paragraph.pieces.map((piece) => {
                      if (!piece.words) return piece.text
                      const on = selected?.paragraph === index && selected.start === piece.start
                      const gender = highlights ? genderOf(piece, vocabulary) : undefined
                      return (
                        <Text
                          key={piece.start}
                          onPress={() => select(index, piece)}
                          accessibilityRole="button"
                          style={[highlights && wordLook(statusOf(piece, vocabulary), theme), gender && { color: colors[gender] }, on && { backgroundColor: colors.accent, color: colors.onAccent }]}
                        >
                          {piece.text}
                        </Text>
                      )
                    })}
                  </Text>
                  <IconButton icon={Volume2} label={`Listen to paragraph ${index + 1}`} variant="ghost" size={36} onPress={() => sayOne(paragraph.text)} />
                </View>
                {translation && annotated.translation ? <Text style={[type.body, { color: colors.muted }]}>{annotated.translation[index]}</Text> : null}
              </View>
            ))}
            {translation && story.translation && !annotated.translation ? (
              <View style={{ gap: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, paddingTop: spacing.lg }}>
                <Text style={[type.small, { color: colors.muted }]}>Translation</Text>
                <Text style={[type.body, { color: colors.muted }]}>{story.translation}</Text>
              </View>
            ) : null}
          </Card>
        </FadeInUp>

        <FadeInUp index={3}>
          <View style={[styles.row, { backgroundColor: colors.card, borderRadius: radius.block, padding: spacing.md, paddingLeft: spacing.lg, gap: spacing.md }, theme.shadow.card]}>
            <Text style={[type.bodyMedium, styles.grow, { color: colors.ink }]}>{story.readCount ? 'Read it again?' : 'Done reading?'}</Text>
            <Button label="Mark as read" icon={<Check size={16} strokeWidth={2.2} color={colors.onPrimary} />} onPress={finish} />
          </View>
        </FadeInUp>
      </ScrollView>

      <WordSheet tapped={tapped} vocabulary={vocabulary} onClose={() => setSelected(null)} onSay={sayOne} />

      <Sheet open={menu} onClose={() => setMenu(false)} title="Reader">
        <View style={{ paddingHorizontal: spacing.md, gap: spacing.xs }}>
          <ToggleRow label="Highlights" hint="Words from your decks, by how well you know them" value={highlights} onChange={setHighlights} />
          {story.translation ? <ToggleRow label="Translation" hint="Under each paragraph" value={translation} onChange={setTranslation} /> : null}
          <HighlightKey />
        </View>
        <OptionRow
          label="Edit story"
          icon={
            <Tile bg={colors.raised}>
              <Pencil size={18} strokeWidth={1.8} color={colors.ink} />
            </Tile>
          }
          onPress={() => {
            setMenu(false)
            router.push({ pathname: '/story/edit', params: { id: story.id } })
          }}
        />
      </Sheet>
    </View>
  )
}

/** What the highlights mean, with a sample of each. */
function HighlightKey() {
  const theme = useTheme()
  const { colors, type, spacing } = theme
  const rows = [
    { sample: 'Haus', status: 'new', text: 'In a deck, not studied yet' },
    { sample: 'gehen', status: 'learning', text: 'Learning' },
    { sample: 'gut', status: 'known', text: 'Known: next review three weeks or more away' },
    { sample: 'Nudeln', status: 'unknown', text: 'Not in your decks: tap it to add it' },
  ] as const
  return (
    <View style={{ gap: spacing.sm, paddingVertical: spacing.md }}>
      <View style={[styles.row, { gap: spacing.xs }]}>
        <Highlighter size={14} strokeWidth={1.8} color={colors.muted} />
        <Text style={[type.small, { color: colors.muted }]}>What the colours mean</Text>
      </View>
      {rows.map((row) => (
        <View key={row.status} style={[styles.row, { gap: spacing.md }]}>
          <Text style={[type.body, { minWidth: 64, color: colors.ink }, wordLook(row.status, theme)]}>{row.sample}</Text>
          <Text style={[type.small, styles.grow, { color: colors.muted }]}>{row.text}</Text>
        </View>
      ))}
      <View style={[styles.row, { gap: spacing.xs }]}>
        <Languages size={14} strokeWidth={1.8} color={colors.muted} />
        <Text style={[type.small, { color: colors.muted }]}>
          {'Nouns take their article’s colour: '}
          <Text style={{ color: colors.der }}>der</Text>, <Text style={{ color: colors.die }}>die</Text>, <Text style={{ color: colors.das }}>das</Text>.
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center' },
  header: { height: 64, flexDirection: 'row', alignItems: 'center' },
  text: { flex: 1, fontSize: 19, lineHeight: 32 },
})
