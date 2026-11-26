/* eslint-disable react-hooks/purity, react-hooks/set-state-in-effect, react-hooks/preserve-manual-memoization --
   a practice round reads the clock when a card is shown or rated and resets its per-card state when the card changes, as the web ReviewPage does */
import type { CheckResult } from '@lernzeit/core/answer'
import { germanText, isPluralOnly, parseCloze, stripCloze, wordKind } from '@lernzeit/core/german'
import { addDeckTime, addRating, countRatings, readPlan, type ReviewPlan } from '@lernzeit/core/practice'
import { LEARN_AHEAD_MS, pickNextReview, requeueAfterRating, studiesAhead } from '@lernzeit/core/queue'
import { directionLabel, GRADE_LABEL, GRADES, previewGrades, State } from '@lernzeit/core/srs'
import { dayKeyAt } from '@lernzeit/core/today'
import { formatInterval, MINUTE } from '@lernzeit/core/time'
import type { Card, CardReview, Deck, Grade, PracticeRun, ReviewLog } from '@lernzeit/core/types'
import * as Speech from 'expo-speech'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Ellipsis, Layers, Undo2, Volume2, X } from 'lucide-react-native'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { KeyboardAvoidingView, Pressable as RNPressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { CardPicture, GermanLine } from '../cards/CardPicture'
import { gradeReview, recordReviewTime, removeReviewTime, savePracticeRun, undoGrade, useCards, useDecks, useReviews } from '../cards/data'
import { useSaveSettings, useSettings } from '../data/settings'
import { newId } from '../data/ids'
import { useLocalLibrary } from '../store/live'
import { useActiveTimer } from '../timer/hooks'
import { zoneOf } from '../timer/timerStore'
import { AnimatedBar, AnimatedCheck, AnimatedRing, FadeInUp, haptics, Pressable } from '../motion'
import { numbers, useTheme } from '../theme'
import { Badge, Button, Chip, EmptyState, IconButton, Sheet, ToggleRow } from '../ui'
import { checkTyped, expectedAnswer, practisesDeck, roundFor, startRound, type Progress } from './round'
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
const roundProgress = (reviewed: number, remaining: number) => `${reviewed} done · ${remaining} left`

/**
 * Practice, full screen (no tab bar): one card at a time on a stack. Tap it (or Show answer) to turn
 * it over, then swipe it (right Good, left Again, up Easy) or tap a rating tile.
 */
export function PracticeScreen() {
  const params = useLocalSearchParams<{ decks?: string; dirs?: string; cards?: string; card?: string }>()
  const router = useRouter()
  const library = useLocalLibrary()
  const insets = useSafeAreaInsets()
  const { colors, type, spacing, radius, shadow, scheme } = useTheme()
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

  // Turn the card over to the answer (the button, Enter, or a tap on the card).
  const flipToReveal = () => {
    if (!card || !review || revealed) return
    haptics.tap()
    if (cardRef.current) cardRef.current.flip(reveal)
    else reveal()
  }
  // Rate from a tile or Enter: the card flies off the way a swipe would send it, then it is rated.
  const rateWith = (g: Grade) => {
    if (!revealed || rating.current) return
    rating.current = true
    if (cardRef.current) cardRef.current.fly(g, () => grade(g))
    else grade(g)
  }
  const rateSwiped = (g: Grade) => {
    if (rating.current) return
    rating.current = true
    grade(g)
  }

  if (!progress) return null
  const remaining = (progress.current ? 1 : 0) + progress.main.length + progress.learning.length
  const pct = progress.reviewed + remaining ? progress.reviewed / (progress.reviewed + remaining) : 1
  const suggested: Grade | null = check ? (check.verdict === 'wrong' ? 1 : 3) : null
  const now = Date.now()
  const preview = review && revealed ? previewGrades(review.fsrs, now, capped(review, now)) : undefined
  const goodTone = scheme === 'dark' ? { bg: colors.ink, fg: colors.canvas } : { bg: colors.primary, fg: colors.onPrimary }
  const tone = (g: Grade) => (g === 4 ? { bg: colors.accent, fg: colors.onAccent, sub: colors.accentInk } : g === 3 ? { ...goodTone, sub: goodTone.fg } : { bg: colors.card, fg: g === 1 ? colors.dangerInk : colors.ink, sub: colors.muted })

  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas, paddingTop: insets.top }}>
      <View style={[styles.top, { paddingHorizontal: spacing.pageX, gap: spacing.md }]}>
        <IconButton icon={X} label="End" onPress={leave} />
        <Segments done={progress.reviewed} total={progress.reviewed + remaining} pct={pct} />
        {history.length > 0 ? <IconButton icon={Undo2} label="Undo" onPress={undo} haptic="select" /> : null}
        <IconButton icon={Ellipsis} label="More" onPress={() => setMenu(true)} />
      </View>
      {progress.current ? <Text style={[type.small, numbers, styles.center, { color: colors.muted, paddingTop: spacing.xs }]}>{roundProgress(progress.reviewed, remaining)}</Text> : null}

      {!progress.current || !card || !review ? (
        <Done progress={progress} onUndo={history.length ? undo : undefined} onMore={again && buildIds(again === 'all' ? 'all' : 'due').ids.length > 0 ? practiseMore : undefined} onLeave={leave} />
      ) : (
        <KeyboardAvoidingView style={styles.grow} behavior="padding">
          <View style={[styles.grow, { paddingHorizontal: spacing.pageX }]}>
            <SwipeCard key={review.id + progress.reviewed} ref={cardRef} canSwipe={revealed} behind={remaining - 1} onRate={rateSwiped}>
              <View style={[styles.row, { gap: spacing.sm }]}>
                <Text style={[type.chip, styles.grow, { color: colors.muted }]} numberOfLines={1}>
                  {`${deck?.name ?? ''} · ${listening ? 'Listening' : directionLabel(review.direction, { learning: 'German', native: 'English' })}`}
                </Text>
                <IconButton icon={Volume2} label="Play German audio" variant="raised" size={40} iconSize={18} onPress={play} />
              </View>
              <RNPressable
                onPress={flipToReveal}
                disabled={revealed || typing}
                accessible={!revealed && !typing}
                accessibilityRole="button"
                accessibilityLabel="Turn the card over"
                style={[styles.face, { gap: spacing.md }]}
              >
                <Prompt card={card} review={review} listening={listening} compact={revealed} onPlay={play} />
                {typing ? (
                  <View style={{ gap: spacing.sm }}>
                    <TextInput
                      ref={inputRef}
                      value={typed}
                      editable={!revealed}
                      onChangeText={setTyped}
                      onSubmitEditing={() => (revealed ? suggested && rateWith(suggested) : flipToReveal())}
                      placeholder={expectedAnswer(card, review.direction, listening).german ? 'Type in German, e.g. der Hund' : 'Type in English'}
                      placeholderTextColor={colors.muted}
                      selectionColor={colors.ink}
                      cursorColor={colors.ink}
                      accessibilityLabel="Your answer"
                      autoCapitalize="none"
                      autoCorrect={false}
                      autoFocus={!revealed}
                      returnKeyType="done"
                      style={[
                        type.section,
                        styles.answerInput,
                        {
                          color: colors.ink,
                          borderRadius: radius.row,
                          borderColor: check?.verdict === 'exact' ? colors.accent : check?.verdict === 'wrong' ? colors.danger : 'transparent',
                          backgroundColor: check?.verdict === 'exact' ? colors.accentSoft : check?.verdict === 'wrong' ? colors.dangerSoft : colors.raised,
                        },
                      ]}
                    />
                    {!revealed ? (
                      <View style={[styles.row, { justifyContent: 'center', gap: spacing.sm }]}>
                        {['ä', 'ö', 'ü', 'ß'].map((ch) => (
                          <Chip key={ch} label={ch} onPress={() => (setTyped((t) => t + ch), inputRef.current?.focus())} />
                        ))}
                      </View>
                    ) : null}
                  </View>
                ) : null}
                {revealed ? (
                  <View style={[styles.answer, { borderTopColor: colors.line, paddingTop: spacing.lg, gap: spacing.md }]}>
                    {check ? <Verdict check={check} typed={typed} /> : null}
                    <Answer card={card} review={review} listening={listening} onSpeak={speak} />
                  </View>
                ) : null}
              </RNPressable>
            </SwipeCard>
          </View>

          <View style={{ paddingHorizontal: spacing.pageX, paddingTop: spacing.lg, paddingBottom: Math.max(insets.bottom, spacing.md) + spacing.xs, gap: spacing.md }}>
            {!revealed ? (
              <Button label={typing ? 'Check' : 'Show answer'} size="lg" onPress={flipToReveal} />
            ) : (
              <View style={[styles.row, { gap: spacing.sm }]}>
                {GRADES.map((g) => {
                  const t = tone(g)
                  const interval = preview ? formatInterval(Math.max(0, preview[g].due - now)) : undefined
                  return (
                    <Pressable
                      key={g}
                      onPress={() => rateWith(g)}
                      haptic="tap"
                      scaleTo={0.94}
                      accessibilityRole="button"
                      accessibilityLabel={`${GRADE_LABEL[g]}${interval ? `, ${interval}` : ''}`}
                      style={[styles.rate, { backgroundColor: t.bg, borderRadius: radius.block, borderColor: suggested === g ? colors.ink : 'transparent' }, t.bg === colors.card && shadow.card]}
                    >
                      <Text style={[type.button, { color: t.fg }]}>{GRADE_LABEL[g]}</Text>
                      {interval ? <Text style={[type.chip, numbers, { color: t.sub, opacity: 0.75 }]}>{interval}</Text> : null}
                    </Pressable>
                  )
                })}
              </View>
            )}
            <Text style={[type.chip, styles.center, { color: colors.muted }]}>
              {revealed ? 'Swipe right for Good · left for Again · up for Easy' : typing ? 'Type your answer, then Check' : 'Tap the card to turn it over'}
            </Text>
          </View>
        </KeyboardAvoidingView>
      )}

      <Sheet open={menu} onClose={() => setMenu(false)} title="Practice">
        <View style={{ gap: spacing.sm, paddingHorizontal: spacing.md, paddingBottom: spacing.md }}>
          {!listening ? (
            <ToggleRow
              label="Read the answer aloud"
              hint="When the card turns over"
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

/** The round's progress: one segment per card for short rounds, a bar for long ones. */
function Segments({ done, total, pct }: { done: number; total: number; pct: number }) {
  const { colors } = useTheme()
  if (total > 24 || total === 0) return <AnimatedBar value={pct} height={6} color={colors.ink} track={colors.lineStrong} style={styles.grow} label="Round progress" />
  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel="Round progress" accessibilityValue={{ min: 0, max: 100, now: Math.round(pct * 100) }} style={[styles.grow, styles.row, { gap: 3, height: 6 }]}>
      {Array.from({ length: total }, (_, i) => (
        <View key={i} style={[styles.grow, { height: 6, borderRadius: 3, backgroundColor: i < done ? colors.ink : colors.lineStrong }]} />
      ))}
    </View>
  )
}

function Prompt({ card, review, listening, compact, onPlay }: { card: Card; review: CardReview; listening: boolean; compact: boolean; onPlay: () => void }) {
  const { colors, type, spacing, radius } = useTheme()
  const [hint, setHint] = useState(false)
  const big = { ...type.title, fontSize: card.type === 'word' ? 32 : 22, lineHeight: card.type === 'word' ? 38 : 29, textAlign: 'center' as const, color: colors.ink }
  if (listening) {
    if (compact) return null
    return (
      <View style={{ alignItems: 'center', gap: spacing.md, paddingVertical: spacing.lg }}>
        <Pressable onPress={onPlay} haptic="tap" scaleTo={0.92} accessibilityRole="button" accessibilityLabel="Play again" style={[styles.listen, { backgroundColor: colors.accent }]}>
          <Volume2 size={34} strokeWidth={1.8} color={colors.onAccent} />
        </Pressable>
        <Text style={[type.body, { color: colors.muted }]}>Type what you hear</Text>
      </View>
    )
  }
  const picture = (h: number, size: number) => <CardPicture card={card} height={compact ? 88 : h} emojiSize={compact ? 44 : size} style={{ borderRadius: radius.block }} />
  switch (review.direction) {
    case 'imageToDe':
      return (
        <View style={{ gap: spacing.md }}>
          {picture(190, 88)}
          {!compact ? (
            <View style={{ alignItems: 'center', gap: 6 }}>
              <Text style={[type.bodyMedium, { color: colors.ink2 }]}>What is this in German?</Text>
              {hint ? (
                <Text style={[type.small, { color: colors.muted }]}>{`${wordKind(card)} · ${card.english}`}</Text>
              ) : (
                <RNPressable onPress={() => setHint(true)} accessibilityRole="button" accessibilityLabel="Show a hint" hitSlop={10}>
                  <Text style={[type.small, { color: colors.accentInk, textDecorationLine: 'underline' }]}>Show a hint</Text>
                </RNPressable>
              )}
            </View>
          ) : null}
        </View>
      )
    case 'enToDe':
      return (
        <View style={{ gap: spacing.md }}>
          {hasPicture(card) && card.type !== 'cloze' ? picture(150, 64) : null}
          {!(compact && card.type === 'word') ? (
            <View style={{ alignItems: 'center', gap: 6 }}>
              <Text style={big}>{card.english}</Text>
              {!compact ? <Text style={[type.small, { color: colors.muted }]}>{card.type === 'word' ? `${wordKind(card)} · in German` : 'Say it in German'}</Text> : null}
            </View>
          ) : null}
        </View>
      )
    case 'deToEn':
      return (
        <View style={{ alignItems: 'center', gap: 6, paddingVertical: compact ? 4 : spacing.lg }}>
          <GermanLine card={card} style={big} />
          {!compact ? <Text style={[type.small, { color: colors.muted }]}>What does it mean?</Text> : null}
        </View>
      )
    case 'cloze':
      return (
        <View style={{ gap: spacing.md }}>
          {hasPicture(card) ? picture(150, 64) : null}
          {!compact ? (
            <View style={{ alignItems: 'center', gap: 6 }}>
              <ClozeSentence text={card.german} reveal={false} style={big} />
              {card.english ? <Text style={[type.small, { color: colors.muted }]}>{card.english}</Text> : null}
            </View>
          ) : null}
        </View>
      )
  }
}

function ClozeSentence({ text, reveal, style }: { text: string; reveal: boolean; style: object }) {
  const { colors } = useTheme()
  const cloze = parseCloze(text)
  if (!cloze) return <Text style={style}>{stripCloze(text)}</Text>
  return (
    <Text style={style}>
      {cloze.before}
      {reveal ? <Text style={{ color: colors.accentInk, backgroundColor: colors.accentSoft }}>{cloze.answer}</Text> : '_____'}
      {cloze.after}
    </Text>
  )
}

function Answer({ card, review, listening, onSpeak }: { card: Card; review: CardReview; listening: boolean; onSpeak: (text: string) => void }) {
  const { colors, type, spacing, radius } = useTheme()
  const title = { ...type.title, fontSize: card.type === 'word' ? 30 : 21, lineHeight: card.type === 'word' ? 36 : 27, textAlign: 'center' as const, color: colors.ink }
  if (review.direction === 'deToEn' && !listening) {
    return (
      <View style={{ alignItems: 'center', gap: 6 }}>
        <Text style={title}>{card.english}</Text>
        {card.exampleEn ? <Text style={[type.body, { color: colors.muted, textAlign: 'center' }]}>{card.exampleEn}</Text> : null}
      </View>
    )
  }
  return (
    <View style={{ alignItems: 'center', gap: spacing.sm }}>
      {card.type === 'cloze' ? <ClozeSentence text={card.german} reveal style={title} /> : <GermanLine card={card} style={title} />}
      {card.type === 'word' ? (
        <Text style={[type.body, { color: colors.muted, textAlign: 'center' }]}>
          {card.english}
          {card.plural && !isPluralOnly(card) ? ` · plural ${card.plural}` : ''}
        </Text>
      ) : listening || review.direction === 'cloze' ? (
        <Text style={[type.body, { color: colors.muted, textAlign: 'center' }]}>{card.english}</Text>
      ) : null}
      {card.verbForms ? <Text style={[type.body, { color: colors.muted, textAlign: 'center' }]}>{card.verbForms}</Text> : null}
      {card.type === 'word' && card.exampleDe && card.exampleDe !== card.german ? (
        <Pressable
          onPress={() => onSpeak(card.exampleDe!)}
          scaleTo={0.98}
          accessibilityRole="button"
          accessibilityLabel="Play the example"
          style={{ alignSelf: 'stretch', padding: spacing.md, borderRadius: radius.row, backgroundColor: colors.raised, gap: 4, marginTop: spacing.xs }}
        >
          <View style={[styles.row, { gap: 6 }]}>
            <Volume2 size={13} strokeWidth={2} color={colors.muted} />
            <Text style={[type.chip, { color: colors.muted }]}>Example</Text>
          </View>
          <Text style={[type.body, { color: colors.ink }]}>{card.exampleDe}</Text>
          {card.exampleEn ? <Text style={[type.small, { color: colors.muted }]}>{card.exampleEn}</Text> : null}
        </Pressable>
      ) : null}
    </View>
  )
}

function Verdict({ check, typed }: { check: CheckResult; typed: string }) {
  const { colors, type, spacing } = useTheme()
  const label = check.verdict === 'exact' ? 'Correct' : check.verdict === 'close' ? 'Almost' : 'Not quite'
  return (
    <View style={{ alignItems: 'center', gap: spacing.xs }}>
      <Badge label={label + (check.notes.length ? ` · ${check.notes.join(' · ')}` : '')} tone={check.verdict === 'exact' ? 'lime' : check.verdict === 'close' ? 'neutral' : 'danger'} />
      {typed.trim() && check.verdict !== 'exact' ? (
        <Text style={[type.body, { color: colors.muted, textAlign: 'center' }]}>
          {'You typed '}
          {check.diff.map((p, i) => (
            <Text key={i} style={{ color: p.kind === 'ok' ? colors.ink : p.kind === 'missing' ? colors.muted : colors.dangerInk, textDecorationLine: p.kind === 'extra' ? 'line-through' : p.kind === 'missing' ? 'underline' : 'none' }}>
              {p.text}
            </Text>
          ))}
        </Text>
      ) : null}
    </View>
  )
}

/** The end of a round: a ring fills and a check draws itself, then the numbers and what next. */
function Done({ progress, onUndo, onMore, onLeave }: { progress: Progress; onUndo?: () => void; onMore?: () => void; onLeave: () => void }) {
  const { colors, type, spacing, radius, shadow, fonts } = useTheme()
  const insets = useSafeAreaInsets()
  const counts = countRatings(progress.ratings)
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
  const tiles: [string, number, string][] = [
    ['Again', counts[1], colors.dangerInk],
    ['Hard', counts[2], colors.ink],
    ['Good', counts[3], colors.ink],
    ['Easy', counts[4], colors.accentInk],
  ]
  return (
    <View style={[styles.grow, { paddingHorizontal: spacing.pageX, paddingBottom: Math.max(insets.bottom, spacing.md) + spacing.xs }]}>
      <View style={[styles.grow, { alignItems: 'center', justifyContent: 'center', gap: spacing.lg }]}>
        <FadeInUp index={0}>
          <AnimatedRing value={1} size={148} stroke={10} label="Round complete">
            <View style={[styles.check, { backgroundColor: colors.accent }]}>
              <AnimatedCheck size={64} color={colors.onAccent} delay={380} />
            </View>
          </AnimatedRing>
        </FadeInUp>
        <FadeInUp index={1} style={{ alignItems: 'center', gap: spacing.xs }}>
          <Text style={[type.title, { color: colors.ink }]} accessibilityRole="header">
            Session done
          </Text>
          <Text style={[type.body, { color: colors.muted, textAlign: 'center' }]}>{`${reviewed} reviewed, ${progress.correct} correct.`}</Text>
        </FadeInUp>
        <FadeInUp index={2} style={[styles.row, { gap: spacing.sm, alignSelf: 'stretch' }]}>
          {tiles.map(([label, n, color]) => (
            <View key={label} style={[styles.grow, { backgroundColor: colors.card, borderRadius: radius.block, paddingVertical: spacing.md, alignItems: 'center', gap: 2 }, shadow.card]}>
              <Text style={[{ fontFamily: fonts.semibold, fontSize: 24, lineHeight: 30, color }, numbers]}>{n}</Text>
              <Text style={[type.chip, { color: colors.muted }]}>{label}</Text>
            </View>
          ))}
        </FadeInUp>
      </View>
      <FadeInUp index={3} style={{ gap: spacing.sm }}>
        {onMore ? <Button label="Practise more" size="lg" onPress={onMore} /> : null}
        <View style={[styles.row, { gap: spacing.sm }]}>
          {onUndo ? <Button label="Undo last" variant="soft" onPress={onUndo} style={styles.grow} /> : null}
          <Button label="Done" variant={onMore ? 'soft' : 'primary'} onPress={onLeave} style={styles.grow} />
        </View>
      </FadeInUp>
    </View>
  )
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center' },
  center: { textAlign: 'center' },
  top: { height: 60, flexDirection: 'row', alignItems: 'center' },
  face: { flexGrow: 1, justifyContent: 'center' },
  answer: { borderTopWidth: StyleSheet.hairlineWidth },
  answerInput: { height: 56, textAlign: 'center', borderWidth: 1.5 },
  rate: { flex: 1, height: 64, alignItems: 'center', justifyContent: 'center', gap: 2, borderWidth: 2 },
  listen: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center' },
  check: { width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center' },
})
