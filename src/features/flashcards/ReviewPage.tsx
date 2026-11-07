import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router'
import clsx from 'clsx'
import { Check, Headphones, Keyboard, Pencil, Undo2, Volume2, VolumeX, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { LetterButtons } from '@/components/LetterButtons'
import { EmptyState, Kbd } from '@/components/ui/primitives'
import { CardImage } from '@/components/CardImage'
import { CardGerman } from '@/components/GermanWord'
import { Diff } from '@/components/Diff'
import { useUI } from '@/app/ui'
import { db, newId, updateSettings } from '@/db/db'
import type { Card, CardReview, Deck, Grade, PracticeDeckTime, PracticeKind, PracticeRun } from '@/db/types'
import { gradeReview, undoGrade } from '@/data/cards'
import { savePracticeRun } from '@/data/practice'
import { useActiveTimer, useAllReviews, useCards, useDecks, useLanguage, useNativeText, useSettings, useStudyQueue } from '@/data/hooks'
import { recordReviewTime } from '@/data/timer'
import { checkAnswer, type CheckResult } from '@/lib/answer'
import { isTypingTarget } from '@/lib/browser'
import { germanText, isPluralOnly, parseCloze, splitArticle, stripCloze, wordKind } from '@/lib/german'
import { readPicked } from '@/lib/picked'
import { addDeckTime, inPlan, readPlan } from '@/lib/practice'
import { buildPickedQueue, buildPracticeQueue, LEARN_AHEAD_MS, pickNextReview, PRACTICE_RETURN, requeueAfterRating, studiesAhead } from '@/lib/queue'
import { prepareSpeech, speak, stopSpeaking, voiceOptions } from '@/data/voice'
import { directionLabel, directionsFor, GRADE_LABEL, GRADES, State } from '@/lib/srs'
import { dateKey, MINUTE } from '@/lib/time'

interface Progress {
  /** The round's id, which its saved practice session keeps. */
  roundId: string
  /**
   * `practice`: nothing was due, so the round studies cards ahead of schedule.
   * `picked` and `all`: the cards among them that are not due yet are rated like practice.
   */
  kind: PracticeKind
  main: string[]
  learning: { id: string; due: number }[]
  current: string | null
  reviewed: number
  correct: number
  activeMs: number
  startedAt: number
  /** When the last card was rated; the start until then. */
  lastAt: number
  decks: Record<string, PracticeDeckTime>
  /** How many times each button was pressed this round. */
  ratings: Record<Grade, number>
}

/** A new round before its first card is picked. */
function startRound(kind: PracticeKind, main: string[], now: number): Omit<Progress, 'current'> {
  return { roundId: newId(), kind, main, learning: [], reviewed: 0, correct: 0, activeMs: 0, startedAt: now, lastAt: now, decks: {}, ratings: { 1: 0, 2: 0, 3: 0, 4: 0 } }
}

interface HistoryEntry {
  progress: Progress
  previous: CardReview
  logId: string
  topicId?: string
  durationMs: number
}

/** Expected typed answer for a review, and whether it is German. */
function expectedAnswer(card: Card, direction: CardReview['direction'], listening: boolean): { text: string; german: boolean } {
  if (listening) return { text: germanText(card), german: true }
  if (direction === 'deToEn') return { text: card.english, german: false }
  if (direction === 'cloze') return { text: parseCloze(card.german)?.answer ?? stripCloze(card.german), german: true }
  return { text: germanText(card), german: true }
}

function checkTyped(typed: string, expected: { text: string; german: boolean }): CheckResult {
  if (expected.german) return checkAnswer(typed, expected.text)
  // English answers may list alternatives: "to go, to walk".
  const options = expected.text.split(/[,;/]/).map((s) => s.trim()).filter(Boolean)
  const results = [expected.text, ...options].map((o) => checkAnswer(typed.replace(/^(to|the|a|an)\s+/i, ''), o.replace(/^(to|the|a|an)\s+/i, '')))
  const rank = { exact: 0, close: 1, wrong: 2 }
  const best = results.sort((a, b) => rank[a.verdict] - rank[b.verdict])[0]
  return { ...best, diff: checkAnswer(typed, expected.text).diff }
}

function ClozeSentence({ text, reveal }: { text: string; reveal: boolean }) {
  const cloze = parseCloze(text)
  if (!cloze) return <span>{stripCloze(text)}</span>
  return (
    <span>
      {cloze.before}
      {reveal ? (
        <span className="rounded-md bg-sage px-1.5 py-0.5 text-sage-ink">{cloze.answer}</span>
      ) : (
        <span className="inline-block min-w-[3.5em] border-b-2 border-ink/60 align-baseline" aria-label="hidden word">
          &nbsp;
        </span>
      )}
      {cloze.after}
    </span>
  )
}

function hasPicture(card: Pick<Card, 'imageId' | 'emoji'>): boolean {
  return !!card.imageId || !!card.emoji
}

/** "What is this in German?" with an optional hint, for when a picture could mean more than one word. */
function PictureQuestion({ card }: { card: Card }) {
  const language = useLanguage()
  const [hint, setHint] = useState(false)
  return (
    <div className="flex flex-col gap-4">
      <CardImage imageId={card.imageId} emoji={card.emoji} label={card.german} seed={card.id} alt="What is this?" className="h-55 sm:h-65" />
      <div className="flex flex-col items-center gap-1.5 text-center text-body text-muted">
        <span>What is this in {language.name}?</span>
        {hint ? (
          <span className="animate-fade-in text-small" dir="auto">
            {wordKind(card)} · {card.english}
          </span>
        ) : (
          <button type="button" onClick={() => setHint(true)} className="text-small text-sage-ink underline-offset-2 hover:underline">
            Show a hint
          </button>
        )}
      </div>
    </div>
  )
}

function Prompt({ card, review, listening, onPlay }: { card: Card; review: CardReview; listening: boolean; onPlay: () => void }) {
  const language = useLanguage()
  const nativeText = useNativeText()
  if (listening) {
    return (
      <div className="flex flex-col items-center gap-4 py-6">
        <button
          type="button"
          onClick={onPlay}
          aria-label="Play again"
          className="flex size-20 items-center justify-center rounded-full bg-sage text-sage-ink transition-transform hover:scale-105 active:scale-95"
        >
          <Volume2 size={32} strokeWidth={1.6} />
        </button>
        <div className="text-body text-muted">Type what you hear</div>
      </div>
    )
  }
  switch (review.direction) {
    case 'imageToDe':
      return <PictureQuestion card={card} />
    case 'enToDe':
      return (
        <div className="flex flex-col gap-4">
          {card.type === 'sentence' && hasPicture(card) && <CardImage imageId={card.imageId} emoji={card.emoji} label={card.german} seed={card.id} alt="" className="h-45 sm:h-55" />}
          {card.type === 'word' && hasPicture(card) && (
            <CardImage imageId={card.imageId} emoji={card.emoji} label={card.german} seed={card.id} alt="" className="h-45 sm:h-55" />
          )}
          <div className="flex flex-col items-center gap-2 px-2 py-4 text-center">
            <div className={clsx('font-semibold tracking-[-0.01em]', card.type === 'word' ? 'text-[30px]' : 'text-[22px] leading-snug')} {...nativeText}>
              {card.english}
            </div>
            <div className="text-small text-muted">{card.type === 'word' ? `${wordKind(card)} · in ${language.name}` : `Say it in ${language.name}`}</div>
          </div>
        </div>
      )
    case 'deToEn':
      return (
        <div className="flex flex-col items-center gap-2 px-2 py-6 text-center">
          <div className={clsx('font-semibold tracking-[-0.01em]', card.type === 'word' ? 'text-[30px]' : 'text-[22px] leading-snug')} lang={language.speech} dir="auto">
            <CardGerman card={card} />
          </div>
          <div className="text-small text-muted">What does it mean?</div>
        </div>
      )
    case 'cloze':
      return (
        <div className="flex flex-col gap-4">
          {hasPicture(card) && <CardImage imageId={card.imageId} emoji={card.emoji} label={card.german} seed={card.id} alt="Hint" className="h-45 sm:h-55" />}
          <div className="flex flex-col items-center gap-2 px-2 py-2 text-center">
            <div className="text-[22px] leading-snug font-semibold tracking-[-0.01em]" lang={language.speech} dir="auto">
              <ClozeSentence text={card.german} reveal={false} />
            </div>
            {card.english && (
              <div className="text-small text-muted" {...nativeText}>
                {card.english}
              </div>
            )}
          </div>
        </div>
      )
  }
}

const SPEEDS = [0.6, 0.8, 1, 1.2]

/** Speed buttons beside the speaker. A speed set with the Settings slider (e.g. 0.95) lights up the closest one. */
function SpeedButtons({ rate, onChange }: { rate: number; onChange: (rate: number) => void }) {
  const active = SPEEDS.reduce((best, s) => (Math.abs(s - rate) < Math.abs(best - rate) ? s : best))
  return (
    <div role="radiogroup" aria-label="Speaking speed" className="flex items-center gap-0.5 rounded-full bg-field p-0.5">
      {SPEEDS.map((s) => (
        <button
          key={s}
          type="button"
          role="radio"
          aria-checked={s === active}
          title={s === 1 ? 'Normal speed' : `${s}× speed`}
          onClick={(e) => {
            onChange(s)
            // After a mouse click, hand focus back so Space keeps revealing and rating.
            if (e.detail > 0) e.currentTarget.blur()
          }}
          className={clsx(
            'h-7 min-w-9 rounded-full px-2 text-chip font-medium tabular-nums transition-[background-color,color,box-shadow] duration-150',
            s === active ? 'bg-main text-ink shadow-tab' : 'text-muted hover:text-ink',
          )}
        >
          {s}×
        </button>
      ))}
    </div>
  )
}

const sameText = (a: string, b: string) => a.trim().toLowerCase().replace(/[.!?]+$/, '') === b.trim().toLowerCase().replace(/[.!?]+$/, '')

/**
 * The card's word inside its example sentence, marked so it stands out.
 * The mark covers the whole word it sits in, so "Saft" marks all of "Orangensaft".
 */
function Highlighted({ sentence, word }: { sentence: string; word: string }) {
  const at = word ? sentence.toLowerCase().indexOf(word.toLowerCase()) : -1
  if (at < 0) return <>{sentence}</>
  const letter = /[\p{L}\p{M}-]/u
  let start = at
  let end = at + word.length
  while (start > 0 && letter.test(sentence[start - 1])) start--
  while (end < sentence.length && letter.test(sentence[end])) end++
  return (
    <>
      {sentence.slice(0, start)}
      <mark className="rounded-sm bg-sage px-0.5 text-sage-ink">{sentence.slice(start, end)}</mark>
      {sentence.slice(end)}
    </>
  )
}

/** The example sentence under a word's answer. Skipped when it only repeats the card. */
function Example({ card, onSpeak }: { card: Card; onSpeak: (text: string) => void }) {
  const language = useLanguage()
  const nativeText = useNativeText()
  const de = card.exampleDe?.trim()
  const en = card.exampleEn?.trim()
  const repeats = (text?: string) => !!text && [card.german, card.english, germanText(card)].some((t) => sameText(text, t))
  if (!de || repeats(de)) return null
  return (
    <figure className="mt-1 flex w-full flex-col gap-1.5 rounded-row border border-line bg-soft px-4 py-3.5 text-start">
      <div className="flex items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <figcaption className="text-chip font-medium text-muted">Example</figcaption>
          <p lang={language.speech} dir="auto" className="text-[18px] leading-snug text-pretty">
            <Highlighted sentence={de} word={splitArticle(card.german).word} />
          </p>
          {en && !repeats(en) && (
            <p {...nativeText} className="text-[15px] leading-snug text-pretty text-muted">
              {en}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => onSpeak(de)}
          aria-label="Play the example"
          className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted hover:bg-field hover:text-ink"
        >
          <Volume2 size={16} strokeWidth={1.8} />
        </button>
      </div>
    </figure>
  )
}

function Answer({ card, review, listening, onSpeak }: { card: Card; review: CardReview; listening: boolean; onSpeak: (text: string) => void }) {
  const language = useLanguage()
  const nativeText = useNativeText()
  const showImage = (listening || review.direction === 'deToEn') && hasPicture(card) && card.type === 'word'
  if (review.direction === 'deToEn' && !listening) {
    return (
      <div className="flex flex-col items-center gap-1.5 text-center" {...nativeText}>
        <div className={clsx('font-semibold tracking-[-0.01em]', card.type === 'word' ? 'text-[26px]' : 'text-[20px] leading-snug')}>{card.english}</div>
        {card.exampleEn && <div className="text-[15px] leading-snug text-pretty text-muted">{card.exampleEn}</div>}
      </div>
    )
  }
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      {showImage && <CardImage imageId={card.imageId} emoji={card.emoji} label={card.german} seed={card.id} alt="" className="h-45 w-full sm:h-55" />}
      <div className={clsx('font-semibold tracking-[-0.01em]', card.type === 'word' ? 'text-[30px]' : 'text-[22px] leading-snug')} lang={language.speech} dir="auto">
        {card.type === 'cloze' ? <ClozeSentence text={card.german} reveal /> : <CardGerman card={card} />}
      </div>
      <div className="flex flex-col gap-1 text-[16px] leading-snug text-muted" dir="auto">
        {card.type === 'word' && (
          <span>
            {card.english}
            {card.plural && !isPluralOnly(card) && (
              <>
                {' · plural '}
                {card.plural}
              </>
            )}
          </span>
        )}
        {card.type !== 'word' && (listening || review.direction === 'cloze') && <span>{card.english}</span>}
        {card.verbForms && <span>{card.verbForms}</span>}
      </div>
      {card.type === 'word' && <Example card={card} onSpeak={onSpeak} />}
    </div>
  )
}

export default function ReviewPage() {
  const [params] = useSearchParams()
  const { state: locationState } = useLocation()
  const navigate = useNavigate()
  const { openCardEditor } = useUI()
  const cardParam = params.get('card') ?? undefined
  // The decks, directions and cards chosen in the Review dialog. Kept by value, so it changes only with the address.
  const query = params.toString()
  const plan = useMemo(() => readPlan(new URLSearchParams(query)), [query])
  const picked = useMemo(() => readPicked(locationState), [locationState])
  const study = useStudyQueue(undefined, 3_600_000)
  const cards = useCards()
  const decks = useDecks()
  const allReviews = useAllReviews()
  const settings = useSettings()
  const language = useLanguage()
  const timer = useActiveTimer()

  const [progress, setProgress] = useState<Progress | null>(null)
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [revealed, setRevealed] = useState(false)
  const [typed, setTyped] = useState('')
  const [check, setCheck] = useState<CheckResult | null>(null)
  const [busy, setBusy] = useState(false)
  const shownAt = useRef(0)
  const runId = useRef(newId())
  const topicTime = useRef(new Map<string, { start: number; ms: number }>())
  const inputRef = useRef<HTMLInputElement>(null)

  const cardById = useMemo(() => new Map((cards ?? []).map((c) => [c.id, c])), [cards])
  const deckById = useMemo(() => new Map(decks.map((d) => [d.id, d])), [decks])
  const reviewById = useMemo(() => new Map((allReviews ?? []).map((r) => [r.id, r])), [allReviews])

  // The next card, never the word just shown (`lastId`) while another word is left.
  const pickNext = useCallback(
    (p: Omit<Progress, 'current'>, now: number, lastId?: string | null): Progress =>
      pickNextReview(p, now, (id) => reviewById.get(id)?.cardId, lastId),
    [reviewById],
  )

  // A round of cards to study ahead of schedule, so there is always a word to practise.
  // With `every`, the round holds every card of the plan's decks and directions.
  const practiceIds = useCallback(
    (every = false) => {
      const reviews = (allReviews ?? []).filter((r) => inPlan(r, plan))
      const createdAt = (id: string) => cardById.get(id)?.createdAt ?? 0
      return buildPracticeQueue({ reviews, decks, now: Date.now(), createdAt, size: every ? Infinity : undefined }).map((r) => r.id)
    },
    [allReviews, decks, plan, cardById],
  )

  // The cards picked in Flashcards, in each direction their deck practises.
  const pickedIds = useCallback(() => {
    if (!picked) return []
    const directions = (id: string) => {
      const card = cardById.get(id)
      const deck = card ? deckById.get(card.deckId) : undefined
      return card && deck ? directionsFor(card, deck) : []
    }
    return buildPickedQueue({ reviews: allReviews ?? [], cardIds: picked, directions }).map((r) => r.id)
  }, [picked, allReviews, cardById, deckById])

  // Take a snapshot of the queue once, so the session does not shift under you.
  useEffect(() => {
    if (progress || !study.loaded || !cards || !allReviews) return
    let ids: string[]
    let kind: PracticeKind
    const due = study.queue.filter((r) => inPlan(r, plan)).map((r) => r.id)
    if (picked) {
      ids = pickedIds()
      kind = 'picked'
    } else if (cardParam) {
      const card = cards.find((c) => c.id === cardParam)
      const deck = card ? deckById.get(card.deckId) : undefined
      const dirs = card && deck ? directionsFor(card, deck) : []
      ids = allReviews.filter((r) => r.cardId === cardParam && dirs.includes(r.direction)).map((r) => r.id)
      kind = 'card'
    } else if (plan.scope === 'all') {
      ids = practiceIds(true)
      kind = 'all'
    } else if (due.length) {
      ids = due
      kind = 'due'
    } else {
      ids = practiceIds()
      kind = 'practice'
    }
    const now = Date.now()
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time snapshot once data has loaded
    setProgress(pickNext(startRound(kind, ids, now), now))
    shownAt.current = now
  }, [progress, study, plan, cards, allReviews, picked, pickedIds, cardParam, deckById, practiceIds, pickNext])

  // Starts another round once a session ends: the picked cards or every card again, or a practice round.
  // Undo history belongs to the round before. The round opens with a different word from the one that ended the last.
  const again: PracticeKind = picked ? 'picked' : plan.scope === 'all' ? 'all' : 'practice'
  const nextRound = useCallback(() => (again === 'picked' ? pickedIds() : practiceIds(again === 'all')), [again, pickedIds, practiceIds])
  const practiseMore = useCallback(() => {
    const lastId = history.at(-1)?.previous.id
    setHistory([])
    const now = Date.now()
    setProgress(pickNext(startRound(again, nextRound(), now), now, lastId))
  }, [again, nextRound, pickNext, history])
  const canPractise = useMemo(() => !cardParam && nextRound().length > 0, [cardParam, nextRound])

  // Saves the round for Practice history. Picked cards and a single card practise each card's own directions.
  const saveRound = useCallback(
    (p: Omit<Progress, 'current'>) => {
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
        day: dateKey(p.startedAt),
      }
      return savePracticeRun(run)
    },
    [plan],
  )

  const review = progress?.current ? reviewById.get(progress.current) : undefined
  const card = review ? cardById.get(review.cardId) : undefined
  const deck: Deck | undefined = card ? deckById.get(card.deckId) : undefined
  const listening = settings.listeningMode
  const typing = settings.typingMode || listening

  // Skip reviews whose card was deleted mid-session.
  useEffect(() => {
    if (progress?.current && allReviews && cards && (!review || !card)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- advance past a missing card
      setProgress((p) => (p ? pickNext(p, Date.now(), p.current) : p))
    }
  }, [progress, review, card, allReviews, cards, pickNext])

  const play = useCallback(() => {
    if (card) speak(germanText(card), voiceOptions(settings))
  }, [card, settings])

  // Saves the speed (the same setting as in Settings) and replays the word so the change is heard,
  // but only when the German is already on screen or is the question, so it never gives the answer away.
  const changeRate = (rate: number) => {
    void updateSettings({ speechRate: rate })
    const germanShown = revealed || listening || review?.direction === 'deToEn'
    if (card && germanShown) speak(germanText(card), { ...voiceOptions(settings), rate })
  }

  // New card on screen: reset, and in listening mode play it.
  // Leaving a card stops its audio, so a word still being read never plays over the next question.
  const currentId = progress?.current ?? null
  useEffect(() => {
    shownAt.current = Date.now()
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset per card
    setRevealed(false)
    setTyped('')
    setCheck(null)
    const listen = currentId && listening ? setTimeout(play, 250) : undefined
    if (currentId && typing) setTimeout(() => inputRef.current?.focus(), 30)
    return () => {
      clearTimeout(listen)
      stopSpeaking()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId])

  // The offline voice makes this card's audio, and the next one's, while you think, so it plays at once.
  const currentText = card ? germanText(card) : ''
  const nextReview = progress?.main[0] ? reviewById.get(progress.main[0]) : undefined
  const nextCard = nextReview ? cardById.get(nextReview.cardId) : undefined
  const nextText = nextCard ? germanText(nextCard) : ''
  useEffect(() => {
    prepareSpeech(currentText, { engine: settings.voiceEngine })
    prepareSpeech(nextText, { engine: settings.voiceEngine })
  }, [currentText, nextText, settings.voiceEngine])

  const reveal = useCallback(() => {
    if (!card || !review || revealed) return
    if (typing) {
      const result = checkTyped(typed, expectedAnswer(card, review.direction, listening))
      setCheck(result)
    }
    setRevealed(true)
    if (settings.autoPlayAudio && !listening) play()
    inputRef.current?.blur()
  }, [card, review, revealed, typing, typed, listening, settings.autoPlayAudio, play])

  // A practice round caps every rating; a round of picked or all cards caps only the cards it studies ahead of schedule.
  const capped = useCallback(
    (r: CardReview, now: number) => !!progress && (progress.kind === 'practice' || ((progress.kind === 'picked' || progress.kind === 'all') && studiesAhead(r, now))),
    [progress],
  )

  const grade = useCallback(
    async (g: Grade) => {
      if (!progress || !review || !card || busy || !revealed) return
      setBusy(true)
      try {
        const now = Date.now()
        const durationMs = Math.min(now - shownAt.current, 120_000)
        const result = await gradeReview(review.id, g, durationMs, db, capped(review, now))
        if (!result) return
        const topicId = deck?.topicId
        setHistory((h) => [...h.slice(-30), { progress, previous: result.previous, logId: result.logId, topicId, durationMs }])

        // Practising a deck or picked cards brings a card back by its rating (Again soon, Hard later);
        // other rounds bring back cards still being learned when FSRS has them due within minutes.
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
          ratings: { ...progress.ratings, [g]: progress.ratings[g] + 1 },
          activeMs: progress.activeMs + durationMs,
          lastAt: now,
          decks: addDeckTime(progress.decks, review.deckId, durationMs, g > 1),
        }
        setProgress(pickNext(next, now, review.id))
        void saveRound(next)

        // Review time counts toward the deck's topic, unless a timer is already counting it.
        if (settings.countReviewTime && topicId && timer?.topicId !== topicId) {
          const entry = topicTime.current.get(topicId) ?? { start: now - durationMs, ms: 0 }
          entry.ms += durationMs
          topicTime.current.set(topicId, entry)
          if (entry.ms >= MINUTE) {
            void recordReviewTime({ runId: `${runId.current}:${topicId}`, topicId, start: entry.start, end: now, minutes: entry.ms / MINUTE })
          }
        }
      } finally {
        setBusy(false)
      }
    },
    [progress, review, card, busy, revealed, capped, deck, settings.countReviewTime, timer, pickNext, saveRound],
  )

  const undo = useCallback(async () => {
    const last = history.at(-1)
    if (!last || busy) return
    setBusy(true)
    try {
      await undoGrade(last.previous, last.logId)
      if (last.topicId) {
        const entry = topicTime.current.get(last.topicId)
        if (entry) {
          entry.ms = Math.max(0, entry.ms - last.durationMs)
          if (entry.ms >= MINUTE) void recordReviewTime({ runId: `${runId.current}:${last.topicId}`, topicId: last.topicId, start: entry.start, end: Date.now(), minutes: entry.ms / MINUTE })
          else await db.sessions.where('runId').equals(`${runId.current}:${last.topicId}`).delete()
        }
      }
      setHistory((h) => h.slice(0, -1))
      setProgress(last.progress)
      await saveRound(last.progress)
    } finally {
      setBusy(false)
    }
  }, [history, busy, saveRound])

  // Space shows the answer, 1–4 rate, Z undoes, Escape leaves.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.altKey) return
      if ((e.key === 'z' || e.key === 'Z') && (e.ctrlKey || !isTypingTarget(e.target))) {
        if (isTypingTarget(e.target) && !e.ctrlKey) return
        e.preventDefault()
        void undo()
        return
      }
      if (e.ctrlKey) return
      if (e.key === 'Escape') {
        navigate('/flashcards')
        return
      }
      if (isTypingTarget(e.target)) return
      if (e.code === 'Space' || (e.key === 'Enter' && !revealed)) {
        if ((e.target as HTMLElement).closest('button') && e.code === 'Space') return
        e.preventDefault()
        if (!revealed) reveal()
        else if (check) void grade(check.verdict === 'wrong' ? 1 : 3)
        else void grade(3)
        return
      }
      if (e.key === 'Enter' && revealed && check) {
        e.preventDefault()
        void grade(check.verdict === 'wrong' ? 1 : 3)
        return
      }
      if (revealed && ['1', '2', '3', '4'].includes(e.key)) {
        e.preventDefault()
        void grade(Number(e.key) as Grade)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [reveal, grade, undo, revealed, check, navigate])

  if (!progress) return <div className="h-60" aria-busy="true" />

  const remaining = (progress.current ? 1 : 0) + progress.main.length + progress.learning.length
  const pct = progress.reviewed + remaining ? progress.reviewed / (progress.reviewed + remaining) : 1
  const suggested: Grade | null = check ? (check.verdict === 'wrong' ? 1 : 3) : null

  // Mute turns off the audio that plays when the answer is shown (the same switch as in Settings).
  // Listening mode keeps its sound, since hearing the word is the question.
  const muted = !settings.autoPlayAudio
  const toggleMute = () => {
    if (!muted) stopSpeaking()
    void updateSettings({ autoPlayAudio: muted })
  }

  const toggles = (
    <div className="flex items-center gap-1">
      {!listening && <ModeToggle on={muted} label="Mute" icon={<VolumeX size={16} strokeWidth={1.7} />} onClick={toggleMute} />}
      <ModeToggle
        on={settings.typingMode}
        label="Typing"
        icon={<Keyboard size={16} strokeWidth={1.7} />}
        onClick={() => void updateSettings({ typingMode: !settings.typingMode })}
      />
      <ModeToggle
        on={listening}
        label="Listening"
        icon={<Headphones size={16} strokeWidth={1.7} />}
        onClick={() => void updateSettings({ listeningMode: !listening })}
      />
    </div>
  )

  return (
    <div className="mx-auto flex w-full max-w-160 flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <Link to="/flashcards" className="flex items-center gap-1.5 text-small text-muted hover:text-ink">
          <X size={16} strokeWidth={1.8} /> End
        </Link>
        {progress.current && (
          <div className="flex items-center gap-2.5 text-small font-medium tabular-nums sm:gap-3">
            <RatingCounts ratings={progress.ratings} />
            <span className="text-muted">· {remaining} left</span>
          </div>
        )}
        {toggles}
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-track" role="progressbar" aria-valuenow={Math.round(pct * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Session progress">
        <div className="h-full rounded-full bg-sage-bar transition-[width] duration-300" style={{ width: `${pct * 100}%` }} />
      </div>

      {!progress.current || !card || !review ? (
        <SessionDone
          reviewed={progress.reviewed}
          correct={progress.correct}
          activeMs={progress.activeMs}
          ratings={progress.ratings}
          kind={progress.kind}
          filtered={plan.deckIds.length > 0 || plan.directions.length > 0}
          onUndo={history.length ? () => void undo() : undefined}
          onPractise={canPractise ? practiseMore : undefined}
        />
      ) : (
        <>
          <article key={review.id + progress.reviewed} className="flex animate-flip-in flex-col gap-5 rounded-flash border border-line bg-main p-3 pb-6 shadow-panel sm:p-4 sm:pb-7">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 px-1 text-chip text-muted">
              <span className="min-w-0">
                {deck?.name} · {listening ? 'Listening' : directionLabel(review.direction, { learning: language.name, native: language.native.name })}
              </span>
              <div className="ml-auto flex items-center gap-1">
                <button type="button" onClick={play} aria-label={`Play ${language.name} audio`} className="flex size-8 items-center justify-center rounded-full hover:bg-field hover:text-ink">
                  <Volume2 size={16} strokeWidth={1.8} />
                </button>
                <SpeedButtons rate={settings.speechRate} onChange={changeRate} />
                <span aria-hidden className="mx-1 h-4 w-px bg-line" />
                <button type="button" onClick={() => openCardEditor({ cardId: card.id })} aria-label="Edit card" className="flex size-8 items-center justify-center rounded-full hover:bg-field hover:text-ink">
                  <Pencil size={15} strokeWidth={1.8} />
                </button>
              </div>
            </div>

            <Prompt card={card} review={review} listening={listening} onPlay={play} />

            {typing && (
              <form
                className="flex flex-col gap-2 px-1"
                onSubmit={(e) => {
                  e.preventDefault()
                  if (!revealed) reveal()
                  else if (suggested) void grade(suggested)
                }}
              >
                <input
                  ref={inputRef}
                  value={typed}
                  readOnly={revealed}
                  onChange={(e) => setTyped(e.target.value)}
                  placeholder={expectedAnswer(card, review.direction, listening).german ? `Type in ${language.name}, e.g. der Hund` : `Type in ${language.native.name}`}
                  aria-label="Your answer"
                  autoComplete="off"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  lang={expectedAnswer(card, review.direction, listening).german ? language.speech : language.native.code}
                  dir="auto"
                  className={clsx(
                    'h-12 rounded-row border bg-main px-4 text-center text-[17px] outline-none transition-colors',
                    !check && 'border-line-strong focus:border-sage-dot',
                    check?.verdict === 'exact' && 'border-sage-border bg-sage',
                    check?.verdict === 'close' && 'border-(--t-sand-border) bg-(--t-sand-soft)',
                    check?.verdict === 'wrong' && 'border-red-soft bg-red-soft',
                  )}
                />
                {!revealed && (
                  <LetterButtons
                    onLetter={(ch) => {
                      setTyped((t) => t + ch)
                      inputRef.current?.focus()
                    }}
                  />
                )}
              </form>
            )}

            {revealed && (
              <div className="flex animate-fade-in flex-col gap-4 border-t border-line pt-5">
                {check && <Verdict check={check} typed={typed} />}
                <Answer card={card} review={review} listening={listening} onSpeak={(text) => speak(text, voiceOptions(settings))} />
              </div>
            )}
          </article>

          <div className="sticky bottom-[calc(68px+env(safe-area-inset-bottom))] z-10 -mx-1 bg-main/95 backdrop-blur-sm px-1 pt-3 pb-1 md:bottom-4">
            {!revealed ? (
              <Button variant="primary" size="lg" className="w-full" onClick={reveal}>
                {typing ? 'Check' : 'Show answer'}
                <span className="hidden opacity-60 sm:inline">{typing ? 'Enter' : 'Space'}</span>
              </Button>
            ) : (
              <div className="grid grid-cols-4 gap-2">
                {GRADES.map((g) => (
                  <button
                    key={g}
                    type="button"
                    disabled={busy}
                    onClick={() => void grade(g)}
                    className={clsx(
                      'flex h-14 flex-col items-center justify-center gap-0.5 rounded-row border text-body font-medium transition-[background-color,transform] active:scale-[0.98]',
                      g === 3 ? 'border-button-dark bg-button-dark text-on-dark hover:border-button-dark-hover hover:bg-button-dark-hover' : 'border-line-strong bg-main hover:bg-soft',
                      g === 1 && 'text-red-ink',
                      suggested === g && 'ring-2 ring-sage-dot ring-offset-2 ring-offset-main',
                    )}
                  >
                    <span className="flex items-center gap-1.5">
                      {GRADE_LABEL[g]}
                      <span className="hidden text-chip opacity-50 sm:inline">{g}</span>
                    </span>
                    {practisesDeck(progress.kind) && <span className={clsx('text-chip', g === 3 ? 'opacity-70' : 'text-muted')}>{returnLabel(g)}</span>}
                  </button>
                ))}
              </div>
            )}
            <div className="flex items-center justify-between pt-2.5 text-chip text-muted">
              <span className="hidden gap-1.5 sm:flex">
                <Kbd>Space</Kbd> show / good · <Kbd>1</Kbd>–<Kbd>4</Kbd> rate · <Kbd>Z</Kbd> undo
              </span>
              {history.length > 0 && (
                <button type="button" onClick={() => void undo()} className="ml-auto flex items-center gap-1 hover:text-ink">
                  <Undo2 size={14} strokeWidth={1.8} /> Undo
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function ModeToggle({ on, label, icon, onClick }: { on: boolean; label: string; icon: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      title={`${label} mode`}
      className={clsx(
        'flex h-8 items-center gap-1.5 rounded-full px-2.5 text-chip font-medium transition-colors',
        on ? 'bg-sage text-sage-ink' : 'text-muted hover:bg-field hover:text-ink',
      )}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  )
}

function Verdict({ check, typed }: { check: CheckResult; typed: string }) {
  const label = check.verdict === 'exact' ? 'Correct' : check.verdict === 'close' ? 'Almost' : 'Not quite'
  return (
    <div className="flex flex-col items-center gap-1.5 text-center">
      <span
        className={clsx(
          'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-chip font-medium',
          check.verdict === 'exact' && 'bg-sage text-sage-ink',
          check.verdict === 'close' && 'bg-(--t-sand-soft) text-(--t-sand-ink)',
          check.verdict === 'wrong' && 'bg-red-soft text-red-ink',
        )}
      >
        {check.verdict !== 'wrong' && <Check size={13} strokeWidth={2.4} />}
        {label}
        {check.notes.length > 0 && ` · ${check.notes.join(' · ')}`}
      </span>
      {typed.trim() && check.verdict !== 'exact' && (
        <div className="text-body">
          <span className="text-muted">You typed </span>
          <Diff parts={check.diff} />
        </div>
      )}
    </div>
  )
}

/** Practising a deck or picked cards: a rating says when the card comes back in the session. */
const practisesDeck = (kind: PracticeKind) => kind === 'all' || kind === 'picked'

/** "in 3 cards" under Again, "done" under Good. */
function returnLabel(g: Grade): string {
  const gap = PRACTICE_RETURN[g]
  return gap === null ? 'done' : `in ${gap} cards`
}

const RATING_COLOR: Record<Grade, string> = { 1: 'text-red-ink', 2: 'text-(--t-sand-ink)', 3: 'text-sage-ink', 4: 'text-blue-ink' }

/** "Again 2 · Hard 1 · Good 9 · Easy 3": the buttons pressed so far. Phones show the first letter unless `long`. */
function RatingCounts({ ratings, long }: { ratings: Record<Grade, number>; long?: boolean }) {
  return GRADES.map((g) => (
    <span key={g} className={RATING_COLOR[g]} title={GRADE_LABEL[g]}>
      <span className={clsx(!long && 'hidden sm:inline')}>{GRADE_LABEL[g]}</span>
      {!long && <span className="sm:hidden">{GRADE_LABEL[g][0]}</span>} {ratings[g]}
    </span>
  ))
}

const DONE_TITLE: Record<PracticeKind, string> = {
  due: 'Session complete',
  practice: 'Practice round done',
  all: 'Deck done',
  picked: 'Your cards are done',
  card: 'Card reviewed',
}

function SessionDone({
  reviewed,
  correct,
  activeMs,
  ratings,
  kind,
  filtered,
  onUndo,
  onPractise,
}: {
  reviewed: number
  correct: number
  activeMs: number
  ratings: Record<Grade, number>
  kind: PracticeKind
  /** The Review dialog chose some of the decks or directions. */
  filtered: boolean
  onUndo?: () => void
  onPractise?: () => void
}) {
  const navigate = useNavigate()
  const { openCardEditor } = useUI()
  // Picked cards that were all deleted before the round began.
  if (reviewed === 0 && kind === 'picked') {
    return (
      <div className="rounded-flash border border-line bg-main">
        <EmptyState
          icon={<Check size={20} strokeWidth={1.8} />}
          title="Nothing to practise"
          action={
            <Button variant="outline" onClick={() => navigate('/flashcards')}>
              Pick cards
            </Button>
          }
        >
          The cards you picked were deleted.
        </EmptyState>
      </div>
    )
  }
  // The decks and directions chosen in the Review dialog have no cards together.
  if (reviewed === 0 && filtered) {
    return (
      <div className="rounded-flash border border-line bg-main">
        <EmptyState
          icon={<Check size={20} strokeWidth={1.8} />}
          title="Nothing to practise"
          action={
            <Button variant="outline" onClick={() => navigate('/flashcards')}>
              Back to flashcards
            </Button>
          }
        >
          No cards in the decks you chose practise these directions.
        </EmptyState>
      </div>
    )
  }
  // Otherwise only reached with no cards at all: anything else gets a practice round.
  if (reviewed === 0) {
    return (
      <div className="rounded-flash border border-line bg-main">
        <EmptyState
          icon={<Check size={20} strokeWidth={1.8} />}
          title="No cards yet"
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="outline" onClick={() => navigate('/flashcards')}>
                Back to flashcards
              </Button>
              <Button variant="primary" onClick={() => openCardEditor()}>
                Add card
              </Button>
            </div>
          }
        >
          Add a word to start practising.
        </EmptyState>
      </div>
    )
  }
  const minutes = Math.max(1, Math.round(activeMs / MINUTE))
  return (
    <div className="flex animate-rise flex-col items-center gap-4 rounded-flash border border-line bg-main px-6 py-10 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-sage text-sage-ink">
        <Check size={26} strokeWidth={2} />
      </div>
      <div className="flex flex-col gap-1">
        <h2 className="text-[22px] font-semibold tracking-[-0.01em]">{DONE_TITLE[kind]}</h2>
        <p className="text-body text-muted tabular-nums">
          {reviewed} {reviewed === 1 ? 'review' : 'reviews'} in {minutes} min · {Math.round((correct / reviewed) * 100)}% correct
        </p>
      </div>
      <div className="flex items-center gap-4 text-body font-medium tabular-nums">
        <RatingCounts ratings={ratings} long />
      </div>
      <div className="flex flex-wrap justify-center gap-2 pt-2">
        {onUndo && (
          <Button variant="ghost" icon={<Undo2 size={15} strokeWidth={1.8} />} onClick={onUndo}>
            Undo last
          </Button>
        )}
        <Button variant="outline" onClick={() => navigate('/flashcards')}>
          Flashcards
        </Button>
        {onPractise ? (
          <Button variant="primary" onClick={onPractise}>
            {kind === 'picked' || kind === 'all' ? 'Practise again' : 'Practise more'}
          </Button>
        ) : (
          <Button variant="primary" onClick={() => navigate('/')}>
            Today
          </Button>
        )}
      </div>
    </div>
  )
}
