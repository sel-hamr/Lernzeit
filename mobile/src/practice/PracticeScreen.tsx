/* eslint-disable react-hooks/purity, react-hooks/set-state-in-effect, react-hooks/preserve-manual-memoization --
   a practice round reads the clock when a card is shown or rated and resets its per-card state when the card changes, as the web ReviewPage does */
import type { CheckResult } from '@lernzeit/core/answer'
import { germanText, isPluralOnly, parseCloze, stripCloze, wordKind } from '@lernzeit/core/german'
import { addDeckTime, addRating, readPlan, type ReviewPlan } from '@lernzeit/core/practice'
import { LEARN_AHEAD_MS, pickNextReview, requeueAfterRating, studiesAhead } from '@lernzeit/core/queue'
import { GRADE_LABEL, GRADES, previewGrades, State } from '@lernzeit/core/srs'
import { dayKeyAt } from '@lernzeit/core/today'
import { formatInterval, MINUTE } from '@lernzeit/core/time'
import type { Card, CardReview, Deck, Grade, PracticeRun, ReviewLog } from '@lernzeit/core/types'
import * as Speech from 'expo-speech'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { CircleCheck, CircleX, Ellipsis, Layers, RotateCw, Undo2, Volume2, X } from 'lucide-react-native'
import { count } from '@lernzeit/core/text'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { KeyboardAvoidingView, Pressable as RNPressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import Animated, { Easing, FadeIn, SlideInDown, useAnimatedProps, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSequence, withSpring, withTiming, type SharedValue } from 'react-native-reanimated'
import Svg, { Circle, G } from 'react-native-svg'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { CardPicture, GermanLine, germanWrap } from '../cards/CardPicture'
import { gradeReview, recordReviewTime, removeReviewTime, savePracticeRun, undoGrade, useCards, useDecks, useReviews } from '../cards/data'
import { useSaveSettings, useSettings } from '../data/settings'
import { newId } from '../data/ids'
import { useLocalLibrary } from '../store/live'
import { useActiveTimer } from '../timer/hooks'
import { zoneOf } from '../timer/timerStore'
import { AnimatedBar, AnimatedCheck, FadeInUp, haptics, Pressable, springs } from '../motion'
import { numbers, useTheme } from '../theme'
import { Button, Chip, EmptyState, IconButton, Sheet, ToggleRow } from '../ui'
import { checkTyped, expectedAnswer, practisesDeck, roundFor, startRound, type Progress } from './round'
import { markExample } from './example'
import { gradeCounts, positionLabel, practiceTime, roundSummary, type RingSegment } from './summary'
import { ratingHaptic } from './swipe'
import { SwipeCard, type SwipeCardHandle } from './SwipeCard'

interface HistoryEntry {
  progress: Progress
  previous: CardReview
  logId: string
  topicId?: string
  durationMs: number
}

const SPEEDS = [0.6, 0.8, 1, 1.2]
const hasPicture = (c: Pick<Card, 'imageId' | 'emoji'>) => !!c.imageId || !!c.emoji

/**
 * Practice, full screen (no tab bar), after the best flashcard apps: one card on a stack with the
 * Again and Good counters beside it (Quizlet). Show answer turns it over first, then the ratings
 * show with their intervals (Anki), on chunky tiles that press down (Duolingo). Once turned, the
 * card can be swiped too: right Good, left Again, up Easy. Before that a swipe only turns it.
 */
export function PracticeScreen() {
  const params = useLocalSearchParams<{ decks?: string; dirs?: string; cards?: string; card?: string }>()
  const router = useRouter()
  const library = useLocalLibrary()
  const insets = useSafeAreaInsets()
  const { colors, type, spacing, radius, scheme } = useTheme()
  const settings = useSettings()
  const saveSettings = useSaveSettings()
  const cards = useCards()
  const decks = useDecks()
  const reviews = useReviews()
  const timer = useActiveTimer()

  const plan: ReviewPlan = useMemo(() => {
    const search = new URLSearchParams()
    for (const key of ['decks', 'dirs', 'cards'] as const) if (params[key]) search.set(key, String(params[key]))
    return readPlan(search)
  }, [params])
  const cardParam = params.card ? String(params.card) : undefined

  const cardById = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards])
  const deckById = useMemo(() => new Map(decks.map((d) => [d.id, d])), [decks])
  const reviewById = useMemo(() => new Map(reviews.map((r) => [r.id, r])), [reviews])

  const pickNext = useCallback((p: Omit<Progress, 'current'>, now: number, lastId?: string | null): Progress => pickNextReview(p, now, (id) => reviewById.get(id)?.cardId, lastId), [reviewById])

  const buildIds = useCallback(
    (scope: ReviewPlan['scope']) => {
      const now = Date.now()
      const today = dayKeyAt(now, zoneOf(library))
      return roundFor({ ...plan, scope }, { cards, decks, reviews, logs: library.list<ReviewLog>('reviewLogs', { day: today }), today, now }, cardParam)
    },
    [library, plan, cards, decks, reviews, cardParam],
  )

  const [progress, setProgress] = useState<Progress | null>(() => {
    const now = Date.now()
    const { ids, kind } = buildIds(plan.scope)
    return pickNext(startRound(kind, ids, now), now)
  })
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [revealed, setRevealed] = useState(false)
  const [typed, setTyped] = useState('')
  const [check, setCheck] = useState<CheckResult | null>(null)
  const [menu, setMenu] = useState(false)
  // Typing: after Check the feedback panel rates with Continue; this hides it to pick a rating.
  const [rateSelf, setRateSelf] = useState(false)
  const pullAgain = useSharedValue(0)
  const pullGood = useSharedValue(0)
  const pullNone = useSharedValue(0)
  const shownAt = useRef(Date.now())
  const runId = useRef(newId())
  const topicTime = useRef(new Map<string, { start: number; ms: number }>())
  const inputRef = useRef<React.ComponentRef<typeof TextInput>>(null)
  const cardRef = useRef<SwipeCardHandle>(null)
  // A rating on its way (the card is flying off): a second tap or swipe waits for the next card.
  const rating = useRef(false)

  const review = progress?.current ? reviewById.get(progress.current) : undefined
  const card = review ? cardById.get(review.cardId) : undefined
  const deck: Deck | undefined = card ? deckById.get(card.deckId) : undefined
  const listening = settings.listeningMode
  const typing = settings.typingMode || listening

  // Skip reviews whose card was deleted mid-round.
  useEffect(() => {
    if (progress?.current && (!review || !card)) setProgress((p) => (p ? pickNext(p, Date.now(), p.current) : p))
  }, [progress, review, card, pickNext])

  const speak = useCallback(
    (text: string, rate = settings.speechRate) => {
      Speech.stop()
      Speech.speak(text, { language: 'de-DE', rate, voice: settings.voiceURI })
    },
    [settings.speechRate, settings.voiceURI],
  )
  const play = useCallback(() => card && speak(germanText(card)), [card, speak])

  // A new card: reset, and in listening mode play it. Leaving a card stops its audio.
  const currentId = progress?.current ?? null
  useEffect(() => {
    rating.current = false
    shownAt.current = Date.now()
    setRevealed(false)
    setTyped('')
    setCheck(null)
    setRateSelf(false)
    const listen = currentId && listening ? setTimeout(play, 250) : undefined
    return () => {
      clearTimeout(listen)
      Speech.stop()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId])

  const reveal = () => {
    if (!card || !review || revealed) return
    if (typing) setCheck(checkTyped(typed, expectedAnswer(card, review.direction, listening)))
    setRevealed(true)
    if (settings.autoPlayAudio && !listening) play()
    inputRef.current?.blur()
  }

  const saveRound = (p: Omit<Progress, 'current'>) => {
    const run: PracticeRun = {
      id: p.roundId,
      kind: p.kind,
      start: p.startedAt,
      end: p.lastAt,
      activeMs: p.activeMs,
      reviewed: p.reviewed,
      correct: p.correct,
      directions: p.kind === 'picked' || p.kind === 'card' ? [] : plan.directions,
      decks: p.decks,
      day: dayKeyAt(p.startedAt, zoneOf(library)),
    }
    savePracticeRun(library, run)
  }

  const capped = (r: CardReview, now: number) => !!progress && (progress.kind === 'practice' || ((progress.kind === 'picked' || progress.kind === 'all') && studiesAhead(r, now)))

  const grade = (g: Grade) => {
    if (!progress || !review || !card || !revealed) return
    const now = Date.now()
    const durationMs = Math.min(now - shownAt.current, 120_000)
    const result = gradeReview(library, review.id, g, durationMs, capped(review, now))
    if (!result) return
    const topicId = deck?.topicId
    setHistory((h) => [...h.slice(-30), { progress, previous: result.previous, logId: result.logId, topicId, durationMs }])
    const learning = [...progress.learning]
    let main = progress.main
    if (practisesDeck(progress.kind)) main = requeueAfterRating(main, review.id, g)
    else {
      const relearn = result.next.state === State.Learning || result.next.state === State.Relearning
      if (relearn && result.next.due - now <= LEARN_AHEAD_MS) learning.push({ id: review.id, due: result.next.due })
    }
    const next = {
      ...progress,
      main,
      learning,
      reviewed: progress.reviewed + 1,
      correct: progress.correct + (g > 1 ? 1 : 0),
      ratings: addRating(progress.ratings, review.id, g),
      activeMs: progress.activeMs + durationMs,
      lastAt: now,
      decks: addDeckTime(progress.decks, review.deckId, durationMs, g > 1),
    }
    setProgress(pickNext(next, now, review.id))
    saveRound(next)
    // Review time counts toward the deck's topic, unless a timer is already counting it.
    if (settings.countReviewTime && topicId && timer?.topicId !== topicId) {
      const entry = topicTime.current.get(topicId) ?? { start: now - durationMs, ms: 0 }
      entry.ms += durationMs
      topicTime.current.set(topicId, entry)
      if (entry.ms >= MINUTE) recordReviewTime(library, { runId: `${runId.current}:${topicId}`, topicId, start: entry.start, end: now, minutes: entry.ms / MINUTE })
    }
  }

  const undo = () => {
    const last = history.at(-1)
    if (!last) return
    undoGrade(library, last.previous, last.logId)
    if (last.topicId) {
      const entry = topicTime.current.get(last.topicId)
      if (entry) {
        entry.ms = Math.max(0, entry.ms - last.durationMs)
        if (entry.ms >= MINUTE) recordReviewTime(library, { runId: `${runId.current}:${last.topicId}`, topicId: last.topicId, start: entry.start, end: Date.now(), minutes: entry.ms / MINUTE })
        else removeReviewTime(library, `${runId.current}:${last.topicId}`)
      }
    }
    setHistory((h) => h.slice(0, -1))
    setProgress(last.progress)
    saveRound(last.progress)
  }

  const again = cardParam ? undefined : plan.scope === 'all' ? ('all' as const) : ('practice' as const)
  const practiseMore = () => {
    const lastId = history.at(-1)?.previous.id
    setHistory([])
    const now = Date.now()
    setProgress(pickNext(startRound(again!, buildIds(again === 'all' ? 'all' : 'due').ids, now), now, lastId))
  }

  const leave = () => router.back()

  // Turn the card over to the answer (the button, Enter, a tap or a swipe on the card).
  const flipToReveal = () => {
    if (!card || !review || revealed) return
    haptics.select()
    reveal()
  }
  // Rate from a tile or Enter: the card flies off the way a swipe would send it, then it is rated.
  const rateWith = (g: Grade) => {
    if (!revealed || rating.current) return
    rating.current = true
    haptics[ratingHaptic(g)]()
    if (cardRef.current) cardRef.current.fly(g, () => grade(g))
    else grade(g)
  }
  const rateSwiped = (g: Grade) => {
    if (rating.current) return
    rating.current = true
    haptics[ratingHaptic(g)]()
    grade(g)
  }

  if (!progress) return null
  const remaining = (progress.current ? 1 : 0) + progress.main.length + progress.learning.length
  const total = progress.reviewed + remaining
  const pct = total ? progress.reviewed / total : 1
  const suggested: Grade | null = check ? (check.verdict === 'wrong' ? 1 : 3) : null
  const now = Date.now()
  const preview = review && revealed ? previewGrades(review.fsrs, now, capped(review, now)) : undefined
  const graded = gradeCounts(progress.ratings)
  const over = !progress.current || !card || !review
  const feedback = !!check && revealed && !rateSelf
  const tones = rateTones(colors, scheme)

  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas, paddingTop: insets.top }}>
      <View style={[styles.top, { paddingHorizontal: spacing.pageX, gap: spacing.sm }]}>
        <IconButton icon={X} label="End" onPress={leave} />
        <Text style={[type.section, numbers, styles.grow, styles.center, { color: colors.ink }]} accessibilityLabel={over ? 'Round done' : `Card ${positionLabel(progress.reviewed, remaining).replace(' / ', ' of ')}`}>
          {over ? 'Done' : positionLabel(progress.reviewed, remaining)}
        </Text>
        <IconButton icon={Ellipsis} label="More" onPress={() => setMenu(true)} />
      </View>
      <AnimatedBar value={pct} height={4} color={colors.primary} track={colors.track} label="Round progress" style={{ marginHorizontal: spacing.pageX }} />

      {over ? (
        <Done progress={progress} onUndo={history.length ? undo : undefined} onMore={again && buildIds(again === 'all' ? 'all' : 'due').ids.length > 0 ? practiseMore : undefined} onLeave={leave} />
      ) : (
        <KeyboardAvoidingView style={styles.grow} behavior="padding">
          <View style={[styles.row, { paddingHorizontal: spacing.pageX, paddingTop: spacing.md, gap: spacing.sm }]}>
            <Counter value={graded[1]} label="Again" tone="again" pull={pullAgain} />
            <Counter value={graded[2]} label="Hard" tone="hard" pull={pullNone} />
            <Counter value={graded[3]} label="Good" tone="good" pull={pullGood} />
            <Counter value={graded[4]} label="Easy" tone="easy" pull={pullNone} />
          </View>
          <View style={[styles.grow, { paddingHorizontal: spacing.pageX, paddingTop: spacing.lg }]}>
            <SwipeCard
              key={review.id + progress.reviewed}
              ref={cardRef}
              flipped={revealed}
              behind={remaining - 1}
              onRate={rateSwiped}
              onFlip={typing ? undefined : flipToReveal}
              pull={{ again: pullAgain, good: pullGood }}
              front={
                <Front card={card} review={review} listening={listening} typing={typing} onFlip={flipToReveal} onPlay={play}>
                  {typing ? (
                    <View style={{ gap: spacing.sm }}>
                      <TextInput
                        ref={inputRef}
                        value={typed}
                        editable={!revealed}
                        onChangeText={setTyped}
                        onSubmitEditing={flipToReveal}
                        placeholder={expectedAnswer(card, review.direction, listening).german ? 'Type in German, e.g. der Hund' : 'Type in English'}
                        placeholderTextColor={colors.muted}
                        selectionColor={colors.ink}
                        cursorColor={colors.ink}
                        accessibilityLabel="Your answer"
                        autoCapitalize="none"
                        autoCorrect={false}
                        autoFocus
                        returnKeyType="done"
                        style={[type.section, styles.answerInput, { color: colors.ink, borderRadius: radius.row, backgroundColor: colors.raised }]}
                      />
                      <View style={[styles.row, { justifyContent: 'center', gap: spacing.sm }]}>
                        {['ä', 'ö', 'ü', 'ß'].map((ch) => (
                          <Chip key={ch} label={ch} onPress={() => (setTyped((t) => t + ch), inputRef.current?.focus())} />
                        ))}
                      </View>
                    </View>
                  ) : null}
                </Front>
              }
              back={<Back card={card} review={review} listening={listening} onSpeak={speak} onPlay={play} />}
            />
          </View>

          <View style={{ paddingHorizontal: spacing.pageX, paddingBottom: Math.max(insets.bottom, spacing.md) + spacing.xs, gap: spacing.sm }}>
            <View style={[styles.row, styles.tools, { gap: spacing.sm }]}>
              {history.length > 0 ? <IconButton icon={Undo2} label="Undo" size={40} onPress={undo} haptic="select" /> : null}
              <Text style={[type.chip, styles.grow, { color: colors.muted, textAlign: history.length ? 'left' : 'center' }]} numberOfLines={1}>
                {revealed ? 'Swipe right for Good, left for Again, up for Easy' : typing ? 'Type your answer, then check it' : 'Swipe or tap the card to see the answer'}
              </Text>
            </View>
            {!revealed ? (
              <Chunky label={typing ? 'Check' : 'Show answer'} bg={colors.primary} fg={colors.onPrimary} round onPress={flipToReveal} />
            ) : (
              <View style={[styles.row, { gap: spacing.sm }]}>
                {GRADES.map((g) => {
                  const t = tones[g]
                  const interval = preview ? formatInterval(Math.max(0, preview[g].due - now)) : undefined
                  return (
                    <Chunky
                      key={g}
                      label={GRADE_LABEL[g]}
                      caption={interval}
                      bg={t.bg}
                      fg={t.fg}
                      sub={t.sub}
                      edge={t.edge}
                      ring={suggested === g ? colors.ink : undefined}
                      height={64}
                      flex
                      accessibilityLabel={`${GRADE_LABEL[g]}${interval ? `, ${interval}` : ''}`}
                      onPress={() => rateWith(g)}
                    />
                  )
                })}
              </View>
            )}
          </View>
          {feedback && check ? (
            <Feedback
              check={check}
              typed={typed}
              answer={expectedAnswer(card, review.direction, listening).text}
              onContinue={() => suggested && rateWith(suggested)}
              onRateSelf={() => setRateSelf(true)}
            />
          ) : null}
        </KeyboardAvoidingView>
      )}

      <Sheet open={menu} onClose={() => setMenu(false)} title="Practice">
        <View style={{ gap: spacing.sm, paddingHorizontal: spacing.md, paddingBottom: spacing.md }}>
          {!listening ? (
            <ToggleRow
              label="Audio"
              hint="Read the answer aloud when the card turns"
              value={settings.autoPlayAudio}
              onChange={(v) => {
                Speech.stop()
                saveSettings({ autoPlayAudio: v })
              }}
            />
          ) : null}
          <ToggleRow label="Typing" hint="Type the answer before it shows" value={settings.typingMode} onChange={(v) => saveSettings({ typingMode: v })} />
          <ToggleRow label="Listening" hint="Hear the German, type what you hear" value={listening} onChange={(v) => saveSettings({ listeningMode: v })} />
          <Text style={[type.small, { color: colors.muted, paddingTop: spacing.sm }]}>Speaking speed</Text>
          <View style={[styles.row, { gap: spacing.sm }]}>
            {SPEEDS.map((s) => (
              <Chip
                key={s}
                label={`${s}x`}
                selected={SPEEDS.reduce((best, x) => (Math.abs(x - settings.speechRate) < Math.abs(best - settings.speechRate) ? x : best)) === s}
                onPress={() => {
                  saveSettings({ speechRate: s })
                  if (card && (revealed || listening || review?.direction === 'deToEn')) speak(germanText(card), s)
                }}
              />
            ))}
          </View>
          {card ? (
            <Button
              label="Edit card"
              variant="soft"
              style={{ marginTop: spacing.md }}
              onPress={() => {
                setMenu(false)
                router.push({ pathname: '/card/edit', params: { id: card.id } })
              }}
            />
          ) : null}
        </View>
      </Sheet>
    </View>
  )
}

type Tone = { bg: string; fg: string; sub: string; edge?: string }

/** The rating tiles: Again soft red, Hard plain, Good black (a soft grey in dark mode, where lime is Easy's), Easy lime. */
function rateTones(colors: ReturnType<typeof useTheme>['colors'], scheme: 'light' | 'dark'): Record<Grade, Tone> {
  const good = scheme === 'dark' ? { bg: colors.ink2, fg: colors.canvas } : { bg: colors.primary, fg: colors.onPrimary }
  return {
    1: { bg: colors.dangerSoft, fg: colors.dangerInk, sub: colors.dangerInk },
    2: { bg: colors.card, fg: colors.ink, sub: colors.muted, edge: colors.lineStrong },
    3: { ...good, sub: good.fg },
    4: { bg: colors.accent, fg: colors.onAccent, sub: colors.accentInk, edge: '#A9C73A' },
  }
}

/** The 4 px lip under a chunky button; it sinks into it while held. */
const LIP = 4

/**
 * A chunky button in the Duolingo way: a face on a darker lip that compresses on press. The lip is
 * the face's colour under a dark veil unless `edge` names one.
 */
function Chunky({
  label,
  caption,
  bg,
  fg,
  sub,
  edge,
  ring,
  height = 56,
  round,
  flex,
  accessibilityLabel,
  onPress,
}: {
  label: string
  caption?: string
  bg: string
  fg: string
  sub?: string
  edge?: string
  ring?: string
  height?: number
  round?: boolean
  flex?: boolean
  accessibilityLabel?: string
  onPress: () => void
}) {
  const { type, fonts } = useTheme()
  const down = useSharedValue(0)
  const face = useAnimatedStyle(() => ({ transform: [{ translateY: down.value * LIP }] }))
  const r = round ? height / 2 : 18
  return (
    <RNPressable
      onPress={onPress}
      onPressIn={() => {
        down.value = withTiming(1, { duration: 50 })
      }}
      onPressOut={() => {
        down.value = withTiming(0, { duration: 110 })
      }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      style={[{ height: height + LIP }, flex && styles.grow]}
    >
      <View style={[styles.lip, { top: LIP, height, borderRadius: r, backgroundColor: edge ?? bg }]}>{edge ? null : <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0, 0, 0, 0.24)' }]} />}</View>
      <Animated.View style={[styles.chunk, { height, borderRadius: r, backgroundColor: bg, borderColor: ring ?? 'transparent' }, face]}>
        <Text style={[type.button, { color: fg, fontFamily: fonts.semibold, fontSize: round ? 16 : 15 }]} numberOfLines={1}>
          {label}
        </Text>
        {caption ? <Text style={[type.chip, numbers, { color: sub ?? fg, opacity: 0.75 }]}>{caption}</Text> : null}
      </Animated.View>
    </RNPressable>
  )
}

/** A counter beside the card (Quizlet's): it bumps when it goes up and swells as the card is dragged its way. */
function Counter({ value, label, tone, pull }: { value: number; label: string; tone: 'again' | 'hard' | 'good' | 'easy'; pull: SharedValue<number> }) {
  const { colors, topics, type, fonts } = useTheme()
  const reduced = useReducedMotion()
  const bump = useSharedValue(1)
  const last = useRef(value)
  useEffect(() => {
    if (value > last.current && !reduced) bump.value = withSequence(withTiming(1.25, { duration: 90 }), withSpring(1, springs.bump))
    last.current = value
  }, [value, reduced, bump])
  const c = {
    again: { bg: colors.dangerSoft, fg: colors.dangerInk, ring: colors.danger },
    hard: { bg: colors.card, fg: colors.ink2, ring: colors.lineStrong },
    good: { bg: topics.sage.soft, fg: topics.sage.ink, ring: topics.sage.dot },
    easy: { bg: colors.accentSoft, fg: colors.accentInk, ring: colors.accent },
  }[tone]
  const pill = useAnimatedStyle(() => ({ transform: [{ scale: bump.value * (1 + pull.value * 0.12) }] }))
  const ring = useAnimatedStyle(() => ({ opacity: pull.value }))
  return (
    <Animated.View accessible accessibilityLabel={`${label}: ${value}`} style={[styles.row, styles.counter, { backgroundColor: c.bg, gap: 5 }, pill]}>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.counterRing, { borderColor: c.ring }, ring]} />
      <Text style={[type.bodyMedium, numbers, { color: c.fg, fontFamily: fonts.semibold }]}>{value}</Text>
      <Text style={[type.chip, { color: c.fg }]} numberOfLines={1}>{label}</Text>
    </Animated.View>
  )
}

const bigFor = (card: Card) => (card.type === 'word' ? { fontSize: 34, lineHeight: 41 } : { fontSize: 24, lineHeight: 31 })

/** The front of the card: a big rounded picture when there is one, the prompt big in the middle, "Tap to flip" (or the answer field) at the bottom. */
function Front({ card, review, listening, typing, onFlip, onPlay, children }: { card: Card; review: CardReview; listening: boolean; typing: boolean; onFlip: () => void; onPlay: () => void; children?: ReactNode }) {
  const { colors, type, spacing } = useTheme()
  const [hint, setHint] = useState(false)
  const big = { ...type.title, ...bigFor(card), textAlign: 'center' as const, color: colors.ink }
  const picture = (h: number) => <CardPicture card={card} height={h} emojiSize={Math.round(h * 0.45)} style={styles.picture} />
  let prompt: ReactNode
  if (listening) {
    prompt = (
      <View style={{ alignItems: 'center', gap: spacing.md }}>
        <Pressable onPress={onPlay} haptic="tap" scaleTo={0.92} accessibilityRole="button" accessibilityLabel="Play again" style={[styles.listen, { backgroundColor: colors.accent }]}>
          <Volume2 size={36} strokeWidth={1.8} color={colors.onAccent} />
        </Pressable>
        <Text style={[type.body, { color: colors.muted }]}>Type what you hear</Text>
      </View>
    )
  } else if (review.direction === 'imageToDe') {
    prompt = (
      <View style={{ gap: spacing.lg }}>
        {picture(220)}
        <View style={{ alignItems: 'center', gap: 6 }}>
          <Text style={[type.section, { color: colors.ink, textAlign: 'center' }]}>What is this in German?</Text>
          {hint ? (
            <Text style={[type.small, { color: colors.muted }]}>{`${wordKind(card)} · ${card.english}`}</Text>
          ) : (
            <Pressable onPress={() => setHint(true)} scaleTo={0.94} accessibilityRole="button" accessibilityLabel="Show a hint" hitSlop={12}>
              <Text style={[type.small, { color: colors.accentInk, textDecorationLine: 'underline' }]}>Show a hint</Text>
            </Pressable>
          )}
        </View>
      </View>
    )
  } else if (review.direction === 'deToEn') {
    prompt = (
      <View style={{ alignItems: 'center', gap: spacing.sm }}>
        {hasPicture(card) ? picture(170) : null}
        <GermanLine card={card} style={big} />
        <Text style={[type.small, { color: colors.muted }]}>What does it mean?</Text>
      </View>
    )
  } else {
    const cloze = review.direction === 'cloze'
    prompt = (
      <View style={{ gap: spacing.lg }}>
        {hasPicture(card) && (cloze || card.type !== 'cloze') ? picture(170) : null}
        <View style={{ alignItems: 'center', gap: 6 }}>
          {cloze ? (
            <ClozeSentence text={card.german} reveal={false} style={big} />
          ) : (
            <Text style={big} {...germanWrap}>
              {card.english}
            </Text>
          )}
          <Text style={[type.small, { color: colors.muted, textAlign: 'center' }]}>{cloze ? card.english : card.type === 'word' ? `${wordKind(card)} · in German` : 'Say it in German'}</Text>
        </View>
      </View>
    )
  }
  const body = (
    <>
      {review.direction === 'deToEn' && !listening ? (
        <View style={styles.corner}>
          <IconButton icon={Volume2} label="Play German audio" variant="raised" size={44} onPress={onPlay} />
        </View>
      ) : null}
      <View style={[styles.grow, { justifyContent: 'center', paddingVertical: spacing.lg }]}>{prompt}</View>
      {typing ? (
        children
      ) : (
        <View style={[styles.row, { justifyContent: 'center', gap: 6, paddingTop: spacing.sm }]}>
          <RotateCw size={14} strokeWidth={2} color={colors.muted} />
          <Text style={[type.chip, { color: colors.muted }]}>Tap to flip</Text>
        </View>
      )}
    </>
  )
  if (typing) return <View style={styles.grow}>{body}</View>
  return (
    <RNPressable onPress={onFlip} accessibilityRole="button" accessibilityLabel="Turn the card over" style={styles.grow}>
      {body}
    </RNPressable>
  )
}

function ClozeSentence({ text, reveal, style }: { text: string; reveal: boolean; style: object }) {
  const { colors } = useTheme()
  const cloze = parseCloze(text)
  if (!cloze)
    return (
      <Text style={style} {...germanWrap}>
        {stripCloze(text)}
      </Text>
    )
  return (
    <Text style={style} {...germanWrap}>
      {cloze.before}
      {reveal ? <Text style={{ color: colors.accentInk, backgroundColor: colors.accentSoft }}>{cloze.answer}</Text> : '_____'}
      {cloze.after}
    </Text>
  )
}

/** The back: the German big with its article in colour, the plural, the English and the example with the word marked; audio in the corner. */
function Back({ card, review, listening, onSpeak, onPlay }: { card: Card; review: CardReview; listening: boolean; onSpeak: (text: string) => void; onPlay: () => void }) {
  const { colors, type, spacing, radius, fonts } = useTheme()
  const big = { ...type.title, ...bigFor(card), textAlign: 'center' as const, color: colors.ink }
  const line = [type.body, { color: colors.muted, textAlign: 'center' as const }]
  const english = review.direction === 'deToEn' && !listening
  return (
    <View style={styles.grow}>
      <View style={styles.corner}>
        <IconButton icon={Volume2} label="Play German audio" variant="raised" size={44} onPress={onPlay} />
      </View>
      <View style={[styles.grow, { justifyContent: 'center', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xxxl }]}>
        {hasPicture(card) ? <CardPicture card={card} height={88} emojiSize={42} style={[styles.thumb, { marginBottom: spacing.sm }]} /> : null}
        {english ? (
          <>
            <Text style={big} {...germanWrap}>
              {card.english}
            </Text>
            <GermanLine card={card} style={[type.section, { color: colors.ink2, textAlign: 'center' }]} />
          </>
        ) : (
          <>
            {card.type === 'cloze' ? <ClozeSentence text={card.german} reveal style={big} /> : <GermanLine card={card} style={big} />}
            {card.type === 'word' && card.plural && !isPluralOnly(card) ? (
              <Text style={line}>
                {'Plural '}
                <Text style={{ color: colors.ink2, fontFamily: fonts.medium }}>{card.plural}</Text>
              </Text>
            ) : null}
            {card.english ? <Text style={[type.section, { color: colors.ink2, textAlign: 'center', fontFamily: fonts.medium }]}>{card.english}</Text> : null}
          </>
        )}
        {card.verbForms ? <Text style={line}>{card.verbForms}</Text> : null}
        {card.type === 'word' && card.exampleDe && card.exampleDe !== card.german ? (
          <Pressable
            onPress={() => onSpeak(card.exampleDe!)}
            scaleTo={0.98}
            accessibilityRole="button"
            accessibilityLabel="Play the example"
            style={{ alignSelf: 'stretch', padding: spacing.lg, borderRadius: radius.block, backgroundColor: colors.raised, gap: 4, marginTop: spacing.md }}
          >
            <Text style={[type.body, { color: colors.ink }]}>
              {markExample(card.exampleDe, card).map((p, i) =>
                p.hit ? (
                  <Text key={i} style={{ fontFamily: fonts.semibold, color: colors.accentInk, backgroundColor: colors.accentSoft }}>
                    {p.text}
                  </Text>
                ) : (
                  p.text
                ),
              )}
            </Text>
            {card.exampleEn ? <Text style={[type.small, { color: colors.muted }]}>{card.exampleEn}</Text> : null}
          </Pressable>
        ) : english && card.exampleEn ? (
          <Text style={line}>{card.exampleEn}</Text>
        ) : null}
      </View>
    </View>
  )
}

/** After Check, Duolingo's way: a panel slides up, green when right, red with the answer when not, and Continue rates it. */
function Feedback({ check, typed, answer, onContinue, onRateSelf }: { check: CheckResult; typed: string; answer: string; onContinue: () => void; onRateSelf: () => void }) {
  const { colors, topics, type, spacing, radius, fonts } = useTheme()
  const insets = useSafeAreaInsets()
  const reduced = useReducedMotion()
  const right = check.verdict !== 'wrong'
  const tone = right ? { bg: topics.sage.soft, fg: topics.sage.ink, solid: topics.sage.dot } : { bg: colors.dangerSoft, fg: colors.dangerInk, solid: colors.danger }
  const Icon = right ? CircleCheck : CircleX
  const title = check.verdict === 'exact' ? 'Correct' : check.verdict === 'close' ? 'Almost' : 'Not quite'
  return (
    <Animated.View
      entering={reduced ? FadeIn.duration(180) : SlideInDown.springify().damping(20).stiffness(220)}
      style={[styles.feedback, { backgroundColor: tone.bg, borderTopLeftRadius: radius.card, borderTopRightRadius: radius.card, padding: spacing.xl, paddingBottom: Math.max(insets.bottom, spacing.md) + spacing.xs, gap: spacing.md }]}
    >
      <View style={[styles.row, { gap: spacing.sm }]}>
        <Icon size={26} strokeWidth={2.2} color={tone.fg} />
        <Text style={[type.section, { color: tone.fg, fontSize: 20, lineHeight: 26 }]} accessibilityRole="header" accessibilityLiveRegion="polite">
          {title}
        </Text>
      </View>
      {check.notes.length ? <Text style={[type.small, { color: tone.fg }]}>{check.notes.join(' · ')}</Text> : null}
      {check.verdict !== 'exact' ? (
        <View style={{ gap: 2 }}>
          <Text style={[type.small, { color: tone.fg }]}>Answer</Text>
          <Text style={[type.section, { color: colors.ink, fontFamily: fonts.semibold }]} {...germanWrap}>
            {answer}
          </Text>
          {typed.trim() ? (
            <Text style={[type.body, { color: colors.ink2 }]}>
              {'You typed '}
              {check.diff.map((p, i) => (
                <Text key={i} style={{ color: p.kind === 'ok' ? colors.ink : p.kind === 'missing' ? colors.muted : colors.dangerInk, textDecorationLine: p.kind === 'extra' ? 'line-through' : p.kind === 'missing' ? 'underline' : 'none' }}>
                  {p.text}
                </Text>
              ))}
            </Text>
          ) : null}
        </View>
      ) : null}
      <Chunky label="Continue" bg={tone.solid} fg="#FFFFFF" round onPress={onContinue} />
      <Pressable onPress={onRateSelf} scaleTo={0.96} accessibilityRole="button" accessibilityLabel="Choose a rating" hitSlop={10} style={{ alignSelf: 'center' }}>
        <Text style={[type.small, { color: tone.fg, textDecorationLine: 'underline' }]}>Choose a rating</Text>
      </Pressable>
    </Animated.View>
  )
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle)

/** One rating's arc of the end ring; it draws itself as the sweep passes its start. */
function Arc({ seg, sweep, size, stroke, color, gap }: { seg: RingSegment; sweep: SharedValue<number>; size: number; stroke: number; color: string; gap: number }) {
  const r = (size - stroke) / 2
  const length = 2 * Math.PI * r
  const props = useAnimatedProps(() => {
    const shown = Math.max(0, Math.min(seg.size, sweep.value - seg.start) * length - gap)
    return { strokeDashoffset: length - shown }
  })
  return (
    <G rotation={seg.start * 360} origin={`${size / 2}, ${size / 2}`}>
      <AnimatedCircle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none" strokeDasharray={`${length} ${length}`} animatedProps={props} />
    </G>
  )
}

/** The end ring: Again, Hard, Good and Easy as segments that sweep in, with anything in the middle. */
function Donut({ segments, colorOf, size = 184, stroke = 16, label, children }: { segments: RingSegment[]; colorOf: (g: Grade) => string; size?: number; stroke?: number; label: string; children?: ReactNode }) {
  const { colors } = useTheme()
  const reduced = useReducedMotion()
  const sweep = useSharedValue(reduced ? 1 : 0)
  useEffect(() => {
    sweep.value = reduced ? 1 : withDelay(150, withTiming(1, { duration: 900, easing: Easing.out(Easing.cubic) }))
  }, [reduced, sweep])
  const gap = segments.length > 1 ? 3 : 0
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={label} style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={(size - stroke) / 2} stroke={colors.track} strokeWidth={stroke} fill="none" />
        {segments.map((seg) => (
          <Arc key={seg.grade} seg={seg} sweep={sweep} size={size} stroke={stroke} color={colorOf(seg.grade)} gap={gap} />
        ))}
      </Svg>
      {children}
    </View>
  )
}

/** The end of a round: the ring of ratings sweeps in around a check that draws itself, then a headline, the numbers and what next. */
function Done({ progress, onUndo, onMore, onLeave }: { progress: Progress; onUndo?: () => void; onMore?: () => void; onLeave: () => void }) {
  const { colors, type, spacing, radius, shadow, scheme } = useTheme()
  const insets = useSafeAreaInsets()
  const summary = roundSummary(progress.ratings)
  const reviewed = progress.reviewed
  useEffect(() => {
    if (reviewed) haptics.success()
  }, [reviewed])
  if (!reviewed) {
    return (
      <View style={[styles.grow, { padding: spacing.pageX, justifyContent: 'center' }]}>
        <EmptyState icon={Layers} title="Nothing to practise" body="There are no cards for this round." action={<Button label="Done" onPress={onLeave} />} />
      </View>
    )
  }
  const colorOf = (g: Grade) => (g === 1 ? colors.danger : g === 2 ? colors.muted : g === 3 ? (scheme === 'dark' ? colors.ink2 : colors.primary) : colors.accent)
  const legend = GRADES.map((g) => ({ g, label: GRADE_LABEL[g], n: summary.counts[g] }))
  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1, paddingHorizontal: spacing.pageX, paddingTop: spacing.xl, paddingBottom: Math.max(insets.bottom, spacing.md) + spacing.xs, gap: spacing.xl }}>
      <View style={[styles.grow, { alignItems: 'center', justifyContent: 'center', gap: spacing.lg }]}>
        <FadeInUp index={0}>
          <Donut segments={summary.segments} colorOf={colorOf} label={legend.map((l) => `${l.n} ${l.label}`).join(', ')}>
            <View style={[styles.check, { backgroundColor: colors.accent }]}>
              <AnimatedCheck size={60} color={colors.onAccent} delay={700} />
            </View>
          </Donut>
        </FadeInUp>
        <FadeInUp index={1} style={{ alignItems: 'center', gap: spacing.xs }}>
          <Text style={[type.title, { color: colors.ink, fontSize: 32, lineHeight: 38 }]} accessibilityRole="header">
            {summary.headline}
          </Text>
          <Text style={[type.body, numbers, { color: colors.muted, textAlign: 'center' }]}>{`${count(summary.total, 'card')} practised in ${practiceTime(progress.activeMs)}`}</Text>
        </FadeInUp>
        <FadeInUp index={2} style={[styles.row, styles.legend, { backgroundColor: colors.card, borderRadius: radius.block + 4, paddingVertical: spacing.lg }, shadow.card]}>
          {legend.map(({ g, label, n }) => (
            <View key={g} style={[styles.grow, { alignItems: 'center', gap: 4 }]}>
              <Text style={[type.figure, { color: colors.ink, fontSize: 24, lineHeight: 30 }]}>{n}</Text>
              <View style={[styles.row, { gap: 5 }]}>
                <View style={[styles.dot, { backgroundColor: colorOf(g) }]} />
                <Text style={[type.chip, { color: colors.muted }]}>{label}</Text>
              </View>
            </View>
          ))}
        </FadeInUp>
      </View>
      <FadeInUp index={3} style={{ gap: spacing.sm }}>
        {onMore ? <Chunky label="Practise again" bg={colors.primary} fg={colors.onPrimary} round onPress={onMore} /> : null}
        <View style={[styles.row, { gap: spacing.sm }]}>
          {onUndo ? <IconButton icon={Undo2} label="Undo the last rating" size={48} onPress={onUndo} haptic="select" /> : null}
          <View style={styles.grow}>
            {onMore ? <Button label="Done" variant="soft" size="lg" onPress={onLeave} /> : <Chunky label="Done" bg={colors.primary} fg={colors.onPrimary} round onPress={onLeave} />}
          </View>
        </View>
      </FadeInUp>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center' },
  center: { textAlign: 'center' },
  top: { height: 56, flexDirection: 'row', alignItems: 'center' },
  tools: { minHeight: 40 },
  answerInput: { height: 56, textAlign: 'center' },
  listen: { width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center' },
  check: { width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center' },
  picture: { borderRadius: 24, alignSelf: 'stretch' },
  thumb: { width: 88, borderRadius: 20 },
  corner: { position: 'absolute', top: -4, right: -4, zIndex: 1 },
  lip: { position: 'absolute', left: 0, right: 0, overflow: 'hidden' },
  chunk: { alignItems: 'center', justifyContent: 'center', gap: 1, borderWidth: 2, paddingHorizontal: 4 },
  counter: { flex: 1, height: 32, paddingHorizontal: 6, borderRadius: 16, justifyContent: 'center' },
  counterRing: { borderRadius: 16, borderWidth: 1.5 },
  feedback: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  legend: { alignSelf: 'stretch' },
  dot: { width: 8, height: 8, borderRadius: 4 },
})
