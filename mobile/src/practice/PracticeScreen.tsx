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
import { Ellipsis, Headphones, Keyboard, Undo2, Volume2, VolumeX, X } from 'lucide-react-native'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { CardPicture, GermanLine } from '../cards/CardPicture'
import { gradeReview, recordReviewTime, removeReviewTime, savePracticeRun, undoGrade, useCards, useDecks, useReviews } from '../cards/data'
import { useSaveSettings, useSettings } from '../data/settings'
import { newId } from '../data/ids'
import { useLocalLibrary } from '../store/live'
import { useActiveTimer } from '../timer/hooks'
import { zoneOf } from '../timer/timerStore'
import { numbers, useTheme } from '../theme'
import { Button, Chip, Sheet } from '../ui'
import { checkTyped, expectedAnswer, practisesDeck, roundFor, startRound, type Progress } from './round'

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

/** Practice, full screen (no tab bar): one card at a time, the rating bar fixed at the bottom. */
export function PracticeScreen() {
  const params = useLocalSearchParams<{ decks?: string; dirs?: string; cards?: string; card?: string }>()
  const router = useRouter()
  const library = useLocalLibrary()
  const insets = useSafeAreaInsets()
  const { colors, type, spacing, radius } = useTheme()
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
  if (!progress) return null
  const remaining = (progress.current ? 1 : 0) + progress.main.length + progress.learning.length
  const pct = progress.reviewed + remaining ? progress.reviewed / (progress.reviewed + remaining) : 1
  const suggested: Grade | null = check ? (check.verdict === 'wrong' ? 1 : 3) : null
  const muted = !settings.autoPlayAudio
  const BAR = 97 + Math.max(8, insets.bottom)
  const now = Date.now()
  const preview = review && revealed ? previewGrades(review.fsrs, now, capped(review, now)) : undefined

  const toggle = (on: boolean, label: string, icon: React.ReactNode, onPress: () => void) => (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: on }} style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? colors.sage : 'transparent' }}>
      {icon}
    </Pressable>
  )

  return (
    <View style={{ flex: 1, backgroundColor: colors.main, paddingTop: insets.top }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, height: 52 }}>
        <Pressable onPress={leave} accessibilityRole="button" accessibilityLabel="End" style={{ flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44 }} hitSlop={6}>
          <X size={18} strokeWidth={1.8} color={colors.muted} />
          <Text style={[type.small, { color: colors.muted }]}>End</Text>
        </Pressable>
        {progress.current ? <Text style={[type.small, numbers, { color: colors.muted }]}>{roundProgress(progress.reviewed, remaining)}</Text> : null}
        <View style={{ flexDirection: 'row' }}>
          {!listening && toggle(muted, 'Mute', <VolumeX size={17} strokeWidth={1.7} color={muted ? colors.sageInk : colors.muted} />, () => (Speech.stop(), saveSettings({ autoPlayAudio: muted })))}
          {toggle(settings.typingMode, 'Typing', <Keyboard size={17} strokeWidth={1.7} color={settings.typingMode ? colors.sageInk : colors.muted} />, () => saveSettings({ typingMode: !settings.typingMode }))}
          {toggle(listening, 'Listening', <Headphones size={17} strokeWidth={1.7} color={listening ? colors.sageInk : colors.muted} />, () => saveSettings({ listeningMode: !listening }))}
        </View>
      </View>
      <View style={{ height: 4, marginHorizontal: spacing.md, borderRadius: 2, backgroundColor: colors.track, overflow: 'hidden' }} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(pct * 100) }}>
        <View style={{ width: `${pct * 100}%`, height: '100%', backgroundColor: colors.sageBar }} />
      </View>

      {!progress.current || !card || !review ? (
        <Done progress={progress} onUndo={history.length ? undo : undefined} onMore={again && buildIds(again === 'all' ? 'all' : 'due').ids.length > 0 ? practiseMore : undefined} onLeave={leave} />
      ) : (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={{ padding: spacing.md, paddingBottom: BAR + spacing.lg, gap: spacing.md }} keyboardShouldPersistTaps="handled">
            <View key={review.id + progress.reviewed} style={{ borderWidth: 1, borderColor: colors.line, borderRadius: radius.flash, padding: spacing.md, gap: spacing.md, backgroundColor: colors.main }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={[type.chip, { color: colors.muted, flex: 1 }]} numberOfLines={1}>
                  {`${deck?.name ?? ''} · ${listening ? 'Listening' : directionLabel(review.direction, { learning: 'German', native: 'English' })}`}
                </Text>
                <Pressable onPress={play} accessibilityRole="button" accessibilityLabel="Play German audio" hitSlop={6} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
                  <Volume2 size={18} strokeWidth={1.8} color={colors.ink2} />
                </Pressable>
                <Pressable onPress={() => setMenu(true)} accessibilityRole="button" accessibilityLabel="More" hitSlop={6} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
                  <Ellipsis size={18} strokeWidth={1.8} color={colors.ink2} />
                </Pressable>
              </View>
              <Prompt card={card} review={review} listening={listening} compact={revealed} onPlay={play} />
              {typing ? (
                <View style={{ gap: spacing.sm }}>
                  <TextInput
                    ref={inputRef}
                    value={typed}
                    editable={!revealed}
                    onChangeText={setTyped}
                    onSubmitEditing={() => (revealed ? suggested && grade(suggested) : reveal())}
                    placeholder={expectedAnswer(card, review.direction, listening).german ? 'Type in German, e.g. der Hund' : 'Type in English'}
                    placeholderTextColor={colors.muted}
                    accessibilityLabel="Your answer"
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoFocus={!revealed}
                    style={[
                      type.section,
                      {
                        height: 48,
                        textAlign: 'center',
                        color: colors.ink,
                        borderWidth: 1,
                        borderRadius: radius.row,
                        borderColor: check?.verdict === 'exact' ? colors.sageBorder : check?.verdict === 'close' ? colors.lineStrong : check ? colors.redSoft : colors.lineStrong,
                        backgroundColor: check?.verdict === 'exact' ? colors.sage : check?.verdict === 'wrong' ? colors.redSoft : colors.main,
                      },
                    ]}
                  />
                  {!revealed ? (
                    <View style={{ flexDirection: 'row', justifyContent: 'center', gap: spacing.sm }}>
                      {['ä', 'ö', 'ü', 'ß'].map((ch) => (
                        <Chip key={ch} label={ch} onPress={() => (setTyped((t) => t + ch), inputRef.current?.focus())} />
                      ))}
                    </View>
                  ) : null}
                </View>
              ) : null}
              {revealed ? (
                <View style={{ borderTopWidth: 1, borderTopColor: colors.line, paddingTop: spacing.md, gap: spacing.md }}>
                  {check ? <Verdict check={check} typed={typed} /> : null}
                  <Answer card={card} review={review} listening={listening} onSpeak={speak} />
                </View>
              ) : null}
            </View>
          </ScrollView>

          <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: BAR, borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.main, paddingHorizontal: spacing.md, paddingTop: 8, paddingBottom: Math.max(8, insets.bottom), gap: 4 }}>
            <View style={{ height: 28, flexDirection: 'row', justifyContent: 'flex-end' }}>
              {history.length > 0 ? (
                <Pressable onPress={undo} accessibilityRole="button" accessibilityLabel="Undo" style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 4 }}>
                  <Undo2 size={14} strokeWidth={1.8} color={colors.muted} />
                  <Text style={[type.chip, { color: colors.muted }]}>Undo</Text>
                </Pressable>
              ) : null}
            </View>
            {!revealed ? (
              <Button label={typing ? 'Check' : 'Show answer'} onPress={reveal} style={{ height: 56 }} />
            ) : (
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                {GRADES.map((g) => (
                  <Pressable
                    key={g}
                    onPress={() => grade(g)}
                    accessibilityRole="button"
                    accessibilityLabel={`${GRADE_LABEL[g]}${preview ? `, ${formatInterval(Math.max(0, preview[g].due - now))}` : ''}`}
                    style={{
                      flex: 1,
                      height: 56,
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: radius.row,
                      borderWidth: suggested === g ? 2 : 1,
                      borderColor: suggested === g ? colors.sageDot : g === 3 ? colors.buttonDark : colors.lineStrong,
                      backgroundColor: g === 3 ? colors.buttonDark : colors.main,
                    }}
                  >
                    <Text style={[type.bodyMedium, { color: g === 3 ? colors.onDark : g === 1 ? colors.redInk : colors.ink }]}>{GRADE_LABEL[g]}</Text>
                    {preview ? <Text style={[type.chip, { color: g === 3 ? colors.onDark : colors.muted, opacity: 0.8 }]}>{formatInterval(Math.max(0, preview[g].due - now))}</Text> : null}
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        </KeyboardAvoidingView>
      )}

      <Sheet open={menu} onClose={() => setMenu(false)} title="Card">
        <View style={{ gap: spacing.md, paddingHorizontal: spacing.md, paddingBottom: spacing.md }}>
          <Text style={[type.small, { color: colors.muted }]}>Speaking speed</Text>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
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
          <Button
            label="Edit card"
            variant="outline"
            onPress={() => {
              setMenu(false)
              if (card) router.push({ pathname: '/card/edit', params: { id: card.id } })
            }}
          />
        </View>
      </Sheet>
    </View>
  )
}

function Prompt({ card, review, listening, compact, onPlay }: { card: Card; review: CardReview; listening: boolean; compact: boolean; onPlay: () => void }) {
  const { colors, type, spacing } = useTheme()
  const [hint, setHint] = useState(false)
  const big = { ...type.title, fontSize: card.type === 'word' ? 30 : 22, lineHeight: card.type === 'word' ? 36 : 28, textAlign: 'center' as const, color: colors.ink }
  if (listening) {
    if (compact) return null
    return (
      <View style={{ alignItems: 'center', gap: spacing.md, paddingVertical: spacing.lg }}>
        <Pressable onPress={onPlay} accessibilityRole="button" accessibilityLabel="Play again" style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: colors.sage, alignItems: 'center', justifyContent: 'center' }}>
          <Volume2 size={32} strokeWidth={1.6} color={colors.sageInk} />
        </Pressable>
        <Text style={[type.body, { color: colors.muted }]}>Type what you hear</Text>
      </View>
    )
  }
  const picture = (h: number, big: number) => <CardPicture card={card} height={compact ? 80 : h} emojiSize={compact ? 40 : big} />
  switch (review.direction) {
    case 'imageToDe':
      return (
        <View style={{ gap: spacing.md }}>
          {picture(176, 80)}
          {!compact ? (
            <View style={{ alignItems: 'center', gap: 6 }}>
              <Text style={[type.body, { color: colors.muted }]}>What is this in German?</Text>
              {hint ? (
                <Text style={[type.small, { color: colors.muted }]}>{`${wordKind(card)} · ${card.english}`}</Text>
              ) : (
                <Pressable onPress={() => setHint(true)} accessibilityRole="button" accessibilityLabel="Show a hint">
                  <Text style={[type.small, { color: colors.sageInk, textDecorationLine: 'underline' }]}>Show a hint</Text>
                </Pressable>
              )}
            </View>
          ) : null}
        </View>
      )
    case 'enToDe':
      return (
        <View style={{ gap: spacing.md }}>
          {hasPicture(card) && card.type !== 'cloze' ? picture(144, 64) : null}
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
          {hasPicture(card) ? picture(144, 64) : null}
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
      {reveal ? <Text style={{ color: colors.sageInk, backgroundColor: colors.sage }}>{cloze.answer}</Text> : '_____'}
      {cloze.after}
    </Text>
  )
}

function Answer({ card, review, listening, onSpeak }: { card: Card; review: CardReview; listening: boolean; onSpeak: (text: string) => void }) {
  const { colors, type, spacing } = useTheme()
  const title = { ...type.title, fontSize: card.type === 'word' ? 28 : 20, lineHeight: card.type === 'word' ? 34 : 26, textAlign: 'center' as const, color: colors.ink }
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
        <Pressable onPress={() => onSpeak(card.exampleDe!)} accessibilityRole="button" accessibilityLabel="Play the example" style={{ alignSelf: 'stretch', padding: spacing.md, borderRadius: 12, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.soft, gap: 4 }}>
          <Text style={[type.chip, { color: colors.muted }]}>Example</Text>
          <Text style={[type.body, { color: colors.ink }]}>{card.exampleDe}</Text>
          {card.exampleEn ? <Text style={[type.small, { color: colors.muted }]}>{card.exampleEn}</Text> : null}
        </Pressable>
      ) : null}
    </View>
  )
}

function Verdict({ check, typed }: { check: CheckResult; typed: string }) {
  const { colors, type, spacing, radius } = useTheme()
  const label = check.verdict === 'exact' ? 'Correct' : check.verdict === 'close' ? 'Almost' : 'Not quite'
  return (
    <View style={{ alignItems: 'center', gap: spacing.xs }}>
      <View style={{ borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 3, backgroundColor: check.verdict === 'exact' ? colors.sage : check.verdict === 'close' ? colors.buttonSoft : colors.redSoft }}>
        <Text style={[type.chip, { color: check.verdict === 'exact' ? colors.sageInk : check.verdict === 'close' ? colors.ink : colors.redInk }]}>{label + (check.notes.length ? ` · ${check.notes.join(' · ')}` : '')}</Text>
      </View>
      {typed.trim() && check.verdict !== 'exact' ? (
        <Text style={[type.body, { color: colors.muted }]}>
          {'You typed '}
          {check.diff.map((p, i) => (
            <Text key={i} style={{ color: p.kind === 'ok' ? colors.ink : p.kind === 'missing' ? colors.muted : colors.redInk, textDecorationLine: p.kind === 'extra' ? 'line-through' : p.kind === 'missing' ? 'underline' : 'none' }}>
              {p.text}
            </Text>
          ))}
        </Text>
      ) : null}
    </View>
  )
}

function Done({ progress, onUndo, onMore, onLeave }: { progress: Progress; onUndo?: () => void; onMore?: () => void; onLeave: () => void }) {
  const { colors, type, spacing } = useTheme()
  const counts = countRatings(progress.ratings)
  return (
    <View style={{ flex: 1, padding: spacing.xl, gap: spacing.lg, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={[type.title, { color: colors.ink }]} accessibilityRole="header">
        {progress.reviewed ? 'Round done' : 'Nothing to practise'}
      </Text>
      {progress.reviewed ? (
        <Text style={[type.body, { color: colors.muted, textAlign: 'center' }]}>
          {`${progress.reviewed} reviewed, ${progress.correct} correct. Again ${counts[1]}, Hard ${counts[2]}, Good ${counts[3]}, Easy ${counts[4]}.`}
        </Text>
      ) : (
        <Text style={[type.body, { color: colors.muted, textAlign: 'center' }]}>There are no cards for this round.</Text>
      )}
      <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap', justifyContent: 'center' }}>
        {onMore ? <Button label="Practise more" onPress={onMore} /> : null}
        {onUndo ? <Button label="Undo last" variant="outline" onPress={onUndo} /> : null}
        <Button label="Done" variant={onMore ? 'outline' : 'primary'} onPress={onLeave} />
      </View>
    </View>
  )
}
