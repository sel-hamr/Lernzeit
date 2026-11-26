/*
 * The story reader, as the web's (ReaderPage): every word can be tapped for its note and card,
 * words from your decks carry a thin underline for how well you know them and nouns take their
 * article's colour. A mini player at the bottom reads the story aloud paragraph by paragraph with
 * expo-speech (hold a paragraph to start there). Active reading time counts toward the story's
 * topic, and "Mark as read" counts the read.
 */
import { readingMinutes, sentenceAt, splitParagraphs, type Piece } from '@lernzeit/core/reader'
import { indexStoryWords, storyWordAt } from '@lernzeit/core/storyWords'
import { count } from '@lernzeit/core/text'
import type { Story } from '@lernzeit/core/types'
import * as Speech from 'expo-speech'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { BookOpen, Check, ChevronLeft, Ellipsis, Highlighter, Languages, Pause, Pencil, Play, SkipBack, SkipForward } from 'lucide-react-native'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Pressable as RNPressable, ScrollView, type ScrollViewInstance, StyleSheet, Text, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native'
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useSettings } from '../data/settings'
import { FadeInUp, haptics, Pressable } from '../motion'
import { notice } from '../notice'
import { useSay } from '../speech'
import { useLocalLibrary } from '../store/live'
import { useActiveStudyTime } from '../study/studyTime'
import { numbers, useTheme } from '../theme'
import { Button, EmptyState, IconButton, OptionRow, Sheet, Tile, ToggleRow } from '../ui'
import { markStoryOpened, markStoryRead, useStory, useVocabulary } from './data'
import { flowUnits, type FlowUnit } from './flow'
import { annotateStory, difficulty, genderOf, percent, readLabel, statusOf, type Vocabulary } from './model'
import { CoverageBar, CoverageCard, WordMark } from './parts'
import { WordSheet, type TappedWord } from './WordSheet'

/** Reading speeds the player cycles through, times the Settings speed. */
const SPEEDS = [1, 1.25, 0.75] as const
const PLAYER_HEIGHT = 64

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

/**
 * Reading aloud one paragraph after another. `current` stays on the paragraph last read, so
 * play picks up there; a newer start (or a stop) makes the older run's callbacks do nothing.
 */
function useStoryPlayer(paragraphs: string[]) {
  const { speechRate, voiceURI } = useSettings()
  const [playing, setPlaying] = useState(false)
  const [current, setCurrent] = useState<number | null>(null)
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1)
  const run = useRef(0)

  const playFrom = useCallback(
    (start: number, at: number = speed) => {
      const token = ++run.current
      Speech.stop()
      const go = (k: number) => {
        if (token !== run.current) return
        if (k >= paragraphs.length) {
          setPlaying(false)
          setCurrent(null)
          return
        }
        setCurrent(k)
        Speech.speak(paragraphs[k]!, {
          language: 'de-DE',
          rate: speechRate * at,
          voice: voiceURI,
          onDone: () => go(k + 1),
          onError: () => {
            if (token === run.current) setPlaying(false)
          },
        })
      }
      setPlaying(true)
      go(Math.max(0, Math.min(start, paragraphs.length - 1)))
    },
    [paragraphs, speechRate, voiceURI, speed],
  )
  const pause = useCallback(() => {
    run.current++
    Speech.stop()
    setPlaying(false)
  }, [])
  useEffect(
    () => () => {
      run.current++
      Speech.stop()
    },
    [],
  )
  const toggle = () => (playing ? pause() : playFrom(current ?? 0))
  const step = (by: number) => playFrom(Math.max(0, Math.min(paragraphs.length - 1, (current ?? 0) + by)))
  const nextSpeed = () => {
    const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length]!
    setSpeed(next)
    if (playing && current !== null) playFrom(current, next)
  }
  return { playing, current, speed, playFrom, pause, toggle, step, nextSpeed }
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
  const [compact, setCompact] = useState(false)
  const [selected, setSelected] = useState<{ paragraph: number; start: number } | null>(null)

  const annotated = useMemo(() => annotateStory(story, vocabulary), [story, vocabulary])
  const units = useMemo(() => annotated.paragraphs.map((p) => flowUnits(p.pieces)), [annotated])
  const texts = useMemo(() => annotated.paragraphs.map((p) => p.text), [annotated])
  const storyWords = useMemo(() => indexStoryWords(splitParagraphs(story.text), story.words), [story.text, story.words])
  const { coverage } = annotated
  const level = difficulty(coverage)
  const player = useStoryPlayer(texts)

  useEffect(() => markStoryOpened(library, story.id), [library, story.id])
  const touch = useActiveStudyTime({ kind: 'reading', id: story.id, topicId: story.topicId, enabled: settings.countReadingTime, source: 'reading', note: `Reading: ${story.title}` })

  const tapped: TappedWord | null = useMemo(() => {
    if (!selected) return null
    const paragraph = annotated.paragraphs[selected.paragraph]
    const piece = paragraph?.pieces.find((p) => p.words && p.start === selected.start)
    if (!paragraph || !piece) return null
    return { word: piece.text, sentence: sentenceAt(paragraph.text, piece.start), cardIds: piece.cardIds, match: storyWordAt(storyWords, selected.paragraph, piece) }
  }, [selected, annotated, storyWords])

  const sayOne = (text: string) => {
    player.pause()
    say(text)
  }
  const finish = () => {
    markStoryRead(library, story.id)
    haptics.success()
    notice('Marked as read')
  }
  const select = useCallback((paragraph: number, piece: Piece) => {
    haptics.select()
    setSelected({ paragraph, start: piece.start })
  }, [])
  const { playFrom } = player
  const holdParagraph = useCallback(
    (index: number) => {
      haptics.tap()
      playFrom(index)
    },
    [playFrom],
  )

  // The compact summary in the header once the coverage card has scrolled away; the paragraph
  // being read stays in view.
  const scroll = useRef<ScrollViewInstance>(null)
  const scrollY = useRef(0)
  const viewport = useRef(0)
  const coverageEnd = useRef(0)
  const textTop = useRef(0)
  const paragraphY = useRef<number[]>([])
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y
    scrollY.current = y
    const next = coverageEnd.current > 0 && y > coverageEnd.current
    if (next !== compact) setCompact(next)
  }
  const { playing, current } = player
  useEffect(() => {
    if (!playing || current === null) return
    const top = textTop.current + (paragraphY.current[current] ?? 0)
    const visibleEnd = scrollY.current + viewport.current - PLAYER_HEIGHT - 160
    if (top < scrollY.current + 40 || top > visibleEnd) scroll.current?.scrollTo({ y: Math.max(0, top - 96), animated: true })
  }, [current, playing])

  const subtitle = [story.level, count(coverage.words, 'word'), `${readingMinutes(coverage.words)} min read`, readLabel(story.readCount)?.toLowerCase()].filter(Boolean).join(' · ')
  const familiar = percent(coverage.known + coverage.learning, coverage.words)

  return (
    <View style={{ flex: 1, backgroundColor: colors.card, paddingTop: insets.top }} onTouchStart={touch}>
      <View style={[styles.header, { paddingHorizontal: spacing.pageX - 4, gap: spacing.sm }]}>
        <IconButton icon={ChevronLeft} label="Back" variant="raised" iconSize={22} onPress={() => (router.canGoBack() ? router.back() : router.replace('/stories'))} />
        <View style={[styles.grow, { alignItems: 'center' }]}>
          {compact ? (
            <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(120)} style={{ alignItems: 'center', gap: 4, maxWidth: '100%' }}>
              <Text style={[type.small, { color: colors.ink, fontFamily: theme.fonts.semibold }]} numberOfLines={1}>
                {story.title}
              </Text>
              <View style={[styles.row, { gap: 6 }]}>
                <View style={{ width: 48 }}>
                  <CoverageBar coverage={coverage} height={4} />
                </View>
                <Text style={[type.chip, numbers, { color: colors.muted }]}>{`${familiar}% known`}</Text>
              </View>
            </Animated.View>
          ) : null}
        </View>
        <IconButton icon={Ellipsis} label="Reader options" variant="raised" onPress={() => setMenu(true)} />
      </View>

      <ScrollView
        ref={scroll}
        onScroll={onScroll}
        scrollEventThrottle={32}
        onScrollBeginDrag={touch}
        onLayout={(e) => (viewport.current = e.nativeEvent.layout.height)}
        contentContainerStyle={{ paddingHorizontal: spacing.xxl, paddingTop: spacing.sm, paddingBottom: PLAYER_HEIGHT + insets.bottom + spacing.xxxl + spacing.lg, gap: spacing.xxl }}
      >
        <FadeInUp index={0} style={{ gap: 6 }}>
          <Text style={[type.title, { color: colors.ink }]} accessibilityRole="header">
            {story.title}
          </Text>
          <Text style={[type.small, numbers, { color: colors.muted }]}>{subtitle}</Text>
        </FadeInUp>

        <View onLayout={(e) => (coverageEnd.current = e.nativeEvent.layout.y + e.nativeEvent.layout.height)}>
          <FadeInUp index={1}>
            <CoverageCard coverage={coverage} level={level} />
          </FadeInUp>
        </View>

        <View onLayout={(e) => (textTop.current = e.nativeEvent.layout.y)}>
        <FadeInUp index={2}>
          <View style={{ gap: spacing.xxl }}>
            {units.map((paragraph, index) => (
              <View key={index} onLayout={(e) => (paragraphY.current[index] = e.nativeEvent.layout.y)} style={{ gap: spacing.sm }}>
                <Paragraph
                  index={index}
                  units={paragraph}
                  vocabulary={vocabulary}
                  highlights={highlights}
                  selectedStart={selected?.paragraph === index ? selected.start : null}
                  speaking={player.playing && player.current === index}
                  onSelect={select}
                  onHold={holdParagraph}
                />
                {translation && annotated.translation ? <Text style={[type.body, { color: colors.muted }]}>{annotated.translation[index]}</Text> : null}
              </View>
            ))}
            {translation && story.translation && !annotated.translation ? (
              <View style={{ gap: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, paddingTop: spacing.lg }}>
                <Text style={[type.small, { color: colors.muted }]}>Translation</Text>
                <Text style={[type.body, { color: colors.muted }]}>{story.translation}</Text>
              </View>
            ) : null}
          </View>
        </FadeInUp>
        </View>

        <View style={[styles.row, { backgroundColor: colors.raised, borderRadius: radius.block, padding: spacing.md, paddingLeft: spacing.lg, gap: spacing.md }]}>
          <Text style={[type.bodyMedium, styles.grow, { color: colors.ink }]}>{story.readCount ? 'Read it again?' : 'Done reading?'}</Text>
          <Button label="Mark as read" icon={<Check size={16} strokeWidth={2.2} color={colors.onPrimary} />} onPress={finish} />
        </View>
      </ScrollView>

      <MiniPlayer player={player} total={texts.length} minutes={readingMinutes(coverage.words)} bottom={insets.bottom + spacing.md} />

      <WordSheet tapped={tapped} vocabulary={vocabulary} onClose={() => setSelected(null)} onSay={sayOne} />

      <Sheet open={menu} onClose={() => setMenu(false)} title="Reader">
        <View style={{ paddingHorizontal: spacing.md, gap: spacing.xs }}>
          <ToggleRow label="Highlights" hint="Underline words from your decks by how well you know them" value={highlights} onChange={setHighlights} />
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

/**
 * One paragraph, laid out word by word so each word can carry a clean underline: tap a word for
 * its sheet, hold anywhere to read aloud from here. While it is read, it sits on a soft lime wash.
 */
const Paragraph = memo(function Paragraph({
  index,
  units,
  vocabulary,
  highlights,
  selectedStart,
  speaking,
  onSelect,
  onHold,
}: {
  index: number
  units: FlowUnit[]
  vocabulary: Vocabulary
  highlights: boolean
  selectedStart: number | null
  speaking: boolean
  onSelect: (paragraph: number, piece: Piece) => void
  onHold: (paragraph: number) => void
}) {
  const { colors, fonts } = useTheme()
  const text = { fontFamily: fonts.regular, color: colors.ink }
  return (
    <RNPressable
      onLongPress={() => onHold(index)}
      delayLongPress={350}
      accessibilityHint="Hold to read aloud from here"
      style={[styles.paragraph, { backgroundColor: speaking ? colors.accentSoft : 'transparent' }]}
    >
      {units.map((unit) => (
        <View key={unit.key} style={styles.unit}>
          {unit.pieces.map((piece) => {
            if (!piece.words)
              return (
                <Text key={piece.start} style={[styles.word, text]}>
                  {piece.text}
                </Text>
              )
            const on = selectedStart === piece.start
            const gender = highlights ? genderOf(piece, vocabulary) : undefined
            return (
              <View key={piece.start} style={[styles.box, on && { backgroundColor: colors.accent, marginHorizontal: -3, paddingHorizontal: 3 }]}>
                <Text
                  onPress={() => onSelect(index, piece)}
                  onLongPress={() => onHold(index)}
                  accessibilityRole="button"
                  style={[styles.word, text, gender && { color: colors[gender] }, on && { color: colors.onAccent }]}
                >
                  {piece.text}
                </Text>
                {highlights && !on ? <WordMark status={statusOf(piece, vocabulary)} /> : null}
              </View>
            )
          })}
          {unit.space ? <Text style={[styles.word, text]}> </Text> : null}
        </View>
      ))}
    </RNPressable>
  )
})

/** The sticky player: play or pause the story, the paragraph before or after, the speed. */
function MiniPlayer({ player, total, minutes, bottom }: { player: ReturnType<typeof useStoryPlayer>; total: number; minutes: number; bottom: number }) {
  const { colors, type, fonts, radius, shadow } = useTheme()
  const { playing, current, speed } = player
  const title = current === null ? 'Listen to the story' : `Paragraph ${current + 1} of ${total}`
  const detail = playing ? 'Reading aloud' : current === null ? `${count(minutes, 'min', 'min')} · hold a paragraph to start there` : 'Paused'
  const round = (icon: typeof Play, label: string, onPress: () => void, disabled?: boolean) => {
    const Icon = icon
    return (
      <Pressable onPress={onPress} disabled={disabled} scaleTo={0.88} hitSlop={4} accessibilityRole="button" accessibilityLabel={label} style={[styles.small, { opacity: disabled ? 0.35 : 1 }]}>
        <Icon size={18} strokeWidth={2} color={colors.onInverse} fill={colors.onInverse} />
      </Pressable>
    )
  }
  return (
    <View testID="story-player" style={[styles.player, { bottom, backgroundColor: colors.inverse, borderRadius: radius.card }, shadow.float]}>
      <Pressable onPress={player.toggle} haptic="tap" scaleTo={0.9} accessibilityRole="button" accessibilityLabel={playing ? 'Pause' : 'Listen to the story'} style={[styles.play, { backgroundColor: colors.accent }]}>
        {playing ? <Pause size={20} strokeWidth={2} color={colors.onAccent} fill={colors.onAccent} /> : <Play size={20} strokeWidth={2} color={colors.onAccent} fill={colors.onAccent} style={{ marginLeft: 2 }} />}
      </Pressable>
      <View style={styles.grow}>
        <Text style={[type.small, numbers, { color: colors.onInverse, fontFamily: fonts.semibold }]} numberOfLines={1}>
          {title}
        </Text>
        <Text style={[type.chip, { color: colors.onInverse, opacity: 0.6 }]} numberOfLines={1}>
          {detail}
        </Text>
      </View>
      {round(SkipBack, 'Paragraph before', () => player.step(-1), current === null || current === 0)}
      {round(SkipForward, 'Next paragraph', () => player.step(1), current !== null && current >= total - 1)}
      <Pressable onPress={player.nextSpeed} scaleTo={0.9} hitSlop={4} accessibilityRole="button" accessibilityLabel={`Speed ${speed} times`} style={[styles.speed, { borderColor: 'rgba(255,255,255,0.22)', borderRadius: radius.pill }]}>
        <Text style={[type.chip, numbers, { color: colors.onInverse, fontFamily: fonts.semibold }]}>{`${speed}×`}</Text>
      </Pressable>
    </View>
  )
}

/** What the underlines mean, with a sample of each. */
function HighlightKey() {
  const theme = useTheme()
  const { colors, type, spacing } = theme
  const rows = [
    { sample: 'gehen', status: 'learning', text: 'Learning' },
    { sample: 'Haus', status: 'new', text: 'In a deck, not studied yet' },
    { sample: 'Nudeln', status: 'unknown', text: 'Not in your decks: tap it to add it' },
    { sample: 'gut', status: 'known', text: 'Known: no mark' },
  ] as const
  return (
    <View style={{ gap: spacing.sm, paddingVertical: spacing.md }}>
      <View style={[styles.row, { gap: spacing.xs }]}>
        <Highlighter size={14} strokeWidth={1.8} color={colors.muted} />
        <Text style={[type.small, { color: colors.muted }]}>What the lines mean</Text>
      </View>
      {rows.map((row) => (
        <View key={row.status} style={[styles.row, { gap: spacing.md }]}>
          <View style={{ minWidth: 72, alignItems: 'flex-start' }}>
            <View style={styles.box}>
              <Text style={[type.body, { color: colors.ink, lineHeight: 26 }]}>{row.sample}</Text>
              <WordMark status={row.status} />
            </View>
          </View>
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
  paragraph: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 3, marginHorizontal: -10, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16 },
  unit: { flexDirection: 'row', alignItems: 'flex-end' },
  box: { borderRadius: 6 },
  word: { fontSize: 19, lineHeight: 28 },
  player: { position: 'absolute', left: 16, right: 16, height: PLAYER_HEIGHT, flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 8, paddingRight: 12 },
  play: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  small: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  speed: { minWidth: 44, height: 30, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
})
