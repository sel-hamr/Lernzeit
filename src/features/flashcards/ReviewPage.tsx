import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import clsx from 'clsx'
import { Check, Headphones, Keyboard, Pencil, Undo2, Volume2, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { EmptyState, Kbd } from '@/components/ui/primitives'
import { CardImage } from '@/components/CardImage'
import { CardGerman } from '@/components/GermanWord'
import { useUI } from '@/app/ui'
import { db, newId, updateSettings } from '@/db/db'
import type { Card, CardReview, Deck, Grade } from '@/db/types'
import { gradeReview, undoGrade } from '@/data/cards'
import { useActiveTimer, useAllReviews, useCards, useDecks, useSettings, useStudyQueue } from '@/data/hooks'
import { recordReviewTime } from '@/data/timer'
import { checkAnswer, type CheckResult, type DiffPart } from '@/lib/answer'
import { isTypingTarget } from '@/lib/browser'
import { germanText, isPluralOnly, parseCloze, stripCloze, wordKind } from '@/lib/german'
import { LEARN_AHEAD_MS } from '@/lib/queue'
import { speak, stopSpeaking } from '@/lib/speech'
import { directionsFor, GRADE_LABEL, GRADES, previewGrades, State } from '@/lib/srs'
import { formatInterval, MINUTE } from '@/lib/time'

interface Progress {
  main: string[]
  learning: { id: string; due: number }[]
  current: string | null
  reviewed: number
  correct: number
  activeMs: number
}

interface HistoryEntry {
  progress: Progress
  previous: CardReview
  logId: string
  topicId?: string
  durationMs: number
}

function pickNext(p: Omit<Progress, 'current'>, now: number): Progress {
  const learning = [...p.learning].sort((a, b) => a.due - b.due)
  if (learning.length && learning[0].due <= now) {
    return { ...p, learning: learning.slice(1), current: learning[0].id }
  }
  if (p.main.length) return { ...p, learning, main: p.main.slice(1), current: p.main[0] }
  // Nothing else left: show learning cards early rather than make you wait.
  if (learning.length) return { ...p, learning: learning.slice(1), current: learning[0].id }
  return { ...p, learning, current: null }
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

function Diff({ parts }: { parts: DiffPart[] }) {
  return (
    <span className="font-medium tracking-[0.01em]">
      {parts.map((p, i) => (
        <span
          key={i}
          className={clsx(
            p.kind === 'wrong' && 'rounded-[3px] bg-red-soft text-red-ink',
            p.kind === 'extra' && 'rounded-[3px] bg-red-soft text-red-ink line-through',
            p.kind === 'missing' && 'rounded-[3px] bg-sage text-sage-ink underline decoration-dotted underline-offset-4',
          )}
        >
          {p.text}
        </span>
      ))}
    </span>
  )
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
  const [hint, setHint] = useState(false)
  return (
    <div className="flex flex-col gap-4">
      <CardImage imageId={card.imageId} emoji={card.emoji} label={card.german} seed={card.id} alt="What is this?" className="h-55 sm:h-65" />
      <div className="flex flex-col items-center gap-1.5 text-center text-body text-muted">
        <span>What is this in German?</span>
        {hint ? (
          <span className="animate-fade-in text-small">
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
          {card.type === 'sentence' && hasPicture(card) && <CardImage imageId={card.imageId} emoji={card.emoji} label={card.german} seed={card.id} alt="" className="h-40" />}
          {card.type === 'word' && hasPicture(card) && (
            <CardImage imageId={card.imageId} emoji={card.emoji} label={card.german} seed={card.id} alt="" className="mx-auto mt-2 h-24 w-32" />
          )}
          <div className="flex flex-col items-center gap-2 px-2 py-4 text-center">
            <div className={clsx('font-semibold tracking-[-0.01em]', card.type === 'word' ? 'text-[30px]' : 'text-[22px] leading-snug')}>{card.english}</div>
            <div className="text-small text-muted">{card.type === 'word' ? `${wordKind(card)} · in German` : 'Say it in German'}</div>
          </div>
        </div>
      )
    case 'deToEn':
      return (
        <div className="flex flex-col items-center gap-2 px-2 py-6 text-center">
          <div className={clsx('font-semibold tracking-[-0.01em]', card.type === 'word' ? 'text-[30px]' : 'text-[22px] leading-snug')}>
            <CardGerman card={card} />
          </div>
          <div className="text-small text-muted">What does it mean?</div>
        </div>
      )
    case 'cloze':
      return (
        <div className="flex flex-col gap-4">
          {hasPicture(card) && <CardImage imageId={card.imageId} emoji={card.emoji} label={card.german} seed={card.id} alt="Hint" className="h-45" />}
          <div className="flex flex-col items-center gap-2 px-2 py-2 text-center">
            <div className="text-[22px] leading-snug font-semibold tracking-[-0.01em]" lang="de">
              <ClozeSentence text={card.german} reveal={false} />
            </div>
            {card.english && <div className="text-small text-muted">{card.english}</div>}
          </div>
        </div>
      )
  }
}

function Answer({ card, review, listening }: { card: Card; review: CardReview; listening: boolean }) {
  const showImage = (listening || review.direction === 'deToEn') && hasPicture(card) && card.type === 'word'
  if (review.direction === 'deToEn' && !listening) {
    return (
      <div className="flex flex-col items-center gap-1.5 text-center">
        <div className={clsx('font-semibold tracking-[-0.01em]', card.type === 'word' ? 'text-[26px]' : 'text-[20px] leading-snug')}>{card.english}</div>
        {card.exampleEn && <div className="text-small text-muted">{card.exampleEn}</div>}
      </div>
    )
  }
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      {showImage && <CardImage imageId={card.imageId} emoji={card.emoji} label={card.german} seed={card.id} alt="" className="h-30 w-40" />}
      <div className={clsx('font-semibold tracking-[-0.01em]', card.type === 'word' ? 'text-[30px]' : 'text-[22px] leading-snug')} lang="de">
        {card.type === 'cloze' ? <ClozeSentence text={card.german} reveal /> : <CardGerman card={card} />}
      </div>
      <div className="flex flex-col gap-1 text-body text-muted">
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
      {card.type === 'word' && card.exampleDe && (
        <div className="flex flex-col gap-0.5 rounded-row bg-soft px-4 py-2.5 text-small">
          <span lang="de">{card.exampleDe}</span>
          {card.exampleEn && <span className="text-muted">{card.exampleEn}</span>}
        </div>
      )}
    </div>
  )
}

export default function ReviewPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { openCardEditor } = useUI()
  const deckParam = params.get('deck') ?? undefined
  const cardParam = params.get('card') ?? undefined
  const study = useStudyQueue(deckParam, 3_600_000)
  const cards = useCards()
  const decks = useDecks()
  const allReviews = useAllReviews()
  const settings = useSettings()
  const timer = useActiveTimer()

  const [progress, setProgress] = useState<Progress | null>(null)
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [revealed, setRevealed] = useState(false)
  const [typed, setTyped] = useState('')
  const [check, setCheck] = useState<CheckResult | null>(null)
  const [busy, setBusy] = useState(false)
  const shownAt = useRef(0)
  const [revealedAt, setRevealedAt] = useState(0)
  const runId = useRef(newId())
  const topicTime = useRef(new Map<string, { start: number; ms: number }>())
  const inputRef = useRef<HTMLInputElement>(null)

  const cardById = useMemo(() => new Map((cards ?? []).map((c) => [c.id, c])), [cards])
  const deckById = useMemo(() => new Map(decks.map((d) => [d.id, d])), [decks])
  const reviewById = useMemo(() => new Map((allReviews ?? []).map((r) => [r.id, r])), [allReviews])

  // Take a snapshot of the queue once, so the session does not shift under you.
  useEffect(() => {
    if (progress || !study.loaded || !cards || !allReviews) return
    let ids: string[]
    if (cardParam) {
      const card = cards.find((c) => c.id === cardParam)
      const deck = card ? deckById.get(card.deckId) : undefined
      const dirs = card && deck ? directionsFor(card, deck) : []
      ids = allReviews.filter((r) => r.cardId === cardParam && dirs.includes(r.direction)).map((r) => r.id)
    } else {
      ids = study.queue.map((r) => r.id)
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time snapshot once data has loaded
    setProgress(pickNext({ main: ids, learning: [], reviewed: 0, correct: 0, activeMs: 0 }, Date.now()))
    shownAt.current = Date.now()
  }, [progress, study, cards, allReviews, cardParam, deckById])

  const review = progress?.current ? reviewById.get(progress.current) : undefined
  const card = review ? cardById.get(review.cardId) : undefined
  const deck: Deck | undefined = card ? deckById.get(card.deckId) : undefined
  const listening = settings.listeningMode
  const typing = settings.typingMode || listening

  // Skip reviews whose card was deleted mid-session.
  useEffect(() => {
    if (progress?.current && allReviews && cards && (!review || !card)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- advance past a missing card
      setProgress((p) => (p ? pickNext(p, Date.now()) : p))
    }
  }, [progress, review, card, allReviews, cards])

  const play = useCallback(() => {
    if (card) speak(germanText(card), { voiceURI: settings.voiceURI, rate: settings.speechRate })
  }, [card, settings.voiceURI, settings.speechRate])

  // New card on screen: reset, and in listening mode play it.
  const currentId = progress?.current ?? null
  useEffect(() => {
    shownAt.current = Date.now()
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset per card
    setRevealed(false)
    setTyped('')
    setCheck(null)
    if (currentId && listening) setTimeout(play, 250)
    if (currentId && typing) setTimeout(() => inputRef.current?.focus(), 30)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId])

  useEffect(() => () => stopSpeaking(), [])

  const reveal = useCallback(() => {
    if (!card || !review || revealed) return
    if (typing) {
      const result = checkTyped(typed, expectedAnswer(card, review.direction, listening))
      setCheck(result)
    }
    setRevealed(true)
    setRevealedAt(Date.now())
    if (settings.autoPlayAudio && !listening) play()
    inputRef.current?.blur()
  }, [card, review, revealed, typing, typed, listening, settings.autoPlayAudio, play])

  const previews = useMemo(() => (review && revealedAt ? previewGrades(review.fsrs, revealedAt) : null), [review, revealedAt])

  const grade = useCallback(
    async (g: Grade) => {
      if (!progress || !review || !card || busy || !revealed) return
      setBusy(true)
      try {
        const now = Date.now()
        const durationMs = Math.min(now - shownAt.current, 120_000)
        const result = await gradeReview(review.id, g, durationMs)
        if (!result) return
        const topicId = deck?.topicId
        setHistory((h) => [...h.slice(-30), { progress, previous: result.previous, logId: result.logId, topicId, durationMs }])

        const learning = [...progress.learning]
        const relearn = result.next.state === State.Learning || result.next.state === State.Relearning
        if (relearn && result.next.due - now <= LEARN_AHEAD_MS) learning.push({ id: review.id, due: result.next.due })
        setProgress(
          pickNext(
            {
              main: progress.main,
              learning,
              reviewed: progress.reviewed + 1,
              correct: progress.correct + (g > 1 ? 1 : 0),
              activeMs: progress.activeMs + durationMs,
            },
            now,
          ),
        )

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
    [progress, review, card, busy, revealed, deck, settings.countReviewTime, timer],
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
    } finally {
      setBusy(false)
    }
  }, [history, busy])

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
  const counts = (() => {
    let n = 0
    let l = progress.learning.length
    let r = 0
    for (const id of [progress.current, ...progress.main]) {
      const rv = id ? reviewById.get(id) : undefined
      if (!rv) continue
      if (rv.state === State.New) n++
      else if (rv.state === State.Review) r++
      else l++
    }
    return { n, l, r }
  })()
  const pct = progress.reviewed + remaining ? progress.reviewed / (progress.reviewed + remaining) : 1
  const suggested: Grade | null = check ? (check.verdict === 'wrong' ? 1 : 3) : null

  const toggles = (
    <div className="flex items-center gap-1">
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
          <div className="flex items-center gap-3 text-small font-medium tabular-nums">
            <span className="text-sage-ink" title="New">
              {counts.n} new
            </span>
            <span className="text-(--t-sand-ink)" title="Learning">
              {counts.l} learning
            </span>
            <span className="text-blue-ink" title="Review">
              {counts.r} review
            </span>
          </div>
        )}
        {toggles}
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-track" role="progressbar" aria-valuenow={Math.round(pct * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Session progress">
        <div className="h-full rounded-full bg-sage-bar transition-[width] duration-300" style={{ width: `${pct * 100}%` }} />
      </div>

      {!progress.current || !card || !review ? (
        <SessionDone reviewed={progress.reviewed} correct={progress.correct} activeMs={progress.activeMs} single={!!cardParam} onUndo={history.length ? () => void undo() : undefined} />
      ) : (
        <>
          <article key={review.id + progress.reviewed} className="flex animate-flip-in flex-col gap-5 rounded-flash border border-line bg-main p-3 pb-6 shadow-panel sm:p-4 sm:pb-7">
            <div className="flex items-center justify-between px-1 text-chip text-muted">
              <span>
                {deck?.name} · {listening ? 'Listening' : directionLabel(review.direction)}
              </span>
              <div className="flex items-center gap-1">
                <button type="button" onClick={play} aria-label="Play German audio" className="flex size-8 items-center justify-center rounded-full hover:bg-field hover:text-ink">
                  <Volume2 size={16} strokeWidth={1.8} />
                </button>
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
                  placeholder={expectedAnswer(card, review.direction, listening).german ? 'Type in German, e.g. der Hund' : 'Type in English'}
                  aria-label="Your answer"
                  autoComplete="off"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  lang={expectedAnswer(card, review.direction, listening).german ? 'de' : 'en'}
                  className={clsx(
                    'h-12 rounded-row border bg-main px-4 text-center text-[17px] outline-none transition-colors',
                    !check && 'border-line-strong focus:border-sage-dot',
                    check?.verdict === 'exact' && 'border-sage-border bg-sage',
                    check?.verdict === 'close' && 'border-(--t-sand-border) bg-(--t-sand-soft)',
                    check?.verdict === 'wrong' && 'border-red-soft bg-red-soft',
                  )}
                />
                {!revealed && (
                  <div className="flex flex-wrap justify-center gap-1.5 text-chip text-muted">
                    {['ä', 'ö', 'ü', 'ß'].map((ch) => (
                      <button
                        key={ch}
                        type="button"
                        onClick={() => {
                          setTyped((t) => t + ch)
                          inputRef.current?.focus()
                        }}
                        className="h-7 w-8 rounded-md border border-line bg-main text-small text-ink hover:bg-field"
                      >
                        {ch}
                      </button>
                    ))}
                  </div>
                )}
              </form>
            )}

            {revealed && (
              <div className="flex animate-fade-in flex-col gap-4 border-t border-line pt-5">
                {check && <Verdict check={check} typed={typed} />}
                <Answer card={card} review={review} listening={listening} />
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
                      g === 3 ? 'border-button-dark bg-button-dark text-on-dark hover:opacity-90' : 'border-line-strong bg-main hover:bg-soft',
                      g === 1 && 'text-red-ink',
                      suggested === g && 'ring-2 ring-sage-dot ring-offset-2 ring-offset-main',
                    )}
                  >
                    <span className="flex items-center gap-1.5">
                      {GRADE_LABEL[g]}
                      <span className="hidden text-chip opacity-50 sm:inline">{g}</span>
                    </span>
                    <span className={clsx('text-chip tabular-nums', g === 3 ? 'opacity-70' : 'text-muted')}>{previews ? formatInterval(previews[g].due - revealedAt) : ''}</span>
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

function directionLabel(direction: CardReview['direction']): string {
  return { imageToDe: 'Image → German', enToDe: 'English → German', deToEn: 'German → English', cloze: 'Cloze' }[direction]
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

function SessionDone({ reviewed, correct, activeMs, single, onUndo }: { reviewed: number; correct: number; activeMs: number; single: boolean; onUndo?: () => void }) {
  const navigate = useNavigate()
  if (reviewed === 0) {
    return (
      <div className="rounded-flash border border-line bg-main">
        <EmptyState
          icon={<Check size={20} strokeWidth={1.8} />}
          title="All caught up"
          action={
            <Button variant="primary" onClick={() => navigate('/flashcards')}>
              Back to flashcards
            </Button>
          }
        >
          No cards are due right now. New cards unlock again tomorrow.
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
        <h2 className="text-[22px] font-semibold tracking-[-0.01em]">{single ? 'Card reviewed' : 'Session complete'}</h2>
        <p className="text-body text-muted tabular-nums">
          {reviewed} {reviewed === 1 ? 'review' : 'reviews'} in {minutes} min · {Math.round((correct / reviewed) * 100)}% correct
        </p>
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
        <Button variant="primary" onClick={() => navigate('/')}>
          Today
        </Button>
      </div>
    </div>
  )
}
