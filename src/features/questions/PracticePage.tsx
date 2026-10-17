import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import clsx from 'clsx'
import { ArrowRight, Check, Languages, Lightbulb, MessageCircleQuestionMark, Pencil, Volume2, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { PillToggle } from '@/components/ui/form'
import { EmptyState, Kbd } from '@/components/ui/primitives'
import { Diff } from '@/components/Diff'
import { useDecks, useQuestions, useResponses, useSettings, useTopics } from '@/data/hooks'
import { saveResponse } from '@/data/questions'
import { pickStoryTopic } from '@/data/stories'
import { useActiveStudyTime, type ActiveRun } from '@/data/studyTime'
import { recordQuestionTime } from '@/data/timer'
import type { Question, QuestionResponse } from '@/db/types'
import { isTypingTarget, useStoredToggle } from '@/lib/browser'
import { compareWithAnswer, hintWords, lastAnswered, practiceOrder, type Comparison } from '@/lib/questions'
import { speak, stopSpeaking, voiceOptions, warmUpVoice } from '@/data/voice'
import { count } from '@/lib/text'
import { dateKey, formatDayMonthShort } from '@/lib/time'
import { QuestionEditorDialog } from './QuestionEditor'

/** How many old responses show before "Show all". */
const OLD_SHOWN = 3

type Phase = 'ask' | 'answered' | 'shown'

interface Tally {
  answered: number
  shown: number
  skipped: number
}

export default function PracticePage() {
  const [params] = useSearchParams()
  const set = params.get('set') ?? undefined
  const questions = useQuestions()
  const responses = useResponses()
  const [round, setRound] = useState(0)

  if (!questions || !responses) return <div className="h-60" aria-busy="true" />
  return (
    <Practice
      // A new round takes a fresh order, with the answers just given.
      key={`${set ?? ''}:${round}`}
      set={set}
      questions={questions}
      responses={responses}
      onAgain={() => setRound((r) => r + 1)}
    />
  )
}

function Practice({ set, questions, responses, onAgain }: { set?: string; questions: Question[]; responses: QuestionResponse[]; onAgain: () => void }) {
  const navigate = useNavigate()
  const settings = useSettings()
  const decks = useDecks()
  const topics = useTopics()
  // The order is fixed when the round starts; edits still show, because questions are looked up live.
  const [order] = useState(() => practiceOrder(set ? questions.filter((q) => q.set === set) : questions, lastAnswered(responses)).map((q) => q.id))
  const [index, setIndex] = useState(0)
  const [phase, setPhase] = useState<Phase>('ask')
  const [typed, setTyped] = useState('')
  const [response, setResponse] = useState<QuestionResponse | null>(null)
  const [tally, setTally] = useState<Tally>({ answered: 0, shown: 0, skipped: 0 })
  const [editing, setEditing] = useState(false)
  const [showEnglish, setShowEnglish] = useStoredToggle('lernzeit-questions-english', false)
  const [showWords, setShowWords] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const nextRef = useRef<HTMLButtonElement>(null)

  const byId = useMemo(() => new Map(questions.map((q) => [q.id, q])), [questions])
  // A question deleted during the round is passed over.
  let at = index
  while (at < order.length && !byId.has(order[at])) at++
  const question = byId.get(order[at] ?? '')

  const topicId = pickStoryTopic(decks, topics)
  const saveTime = useCallback((run: ActiveRun) => recordQuestionTime({ ...run, set }), [set])
  useActiveStudyTime({ kind: 'questions', id: set ?? 'all', topicId, enabled: settings.countQuestionTime, save: saveTime })

  // Speech started here stops when you leave practice.
  useEffect(() => stopSpeaking, [])

  useEffect(() => {
    if (phase === 'ask') inputRef.current?.focus()
    else nextRef.current?.focus()
  }, [phase, at])

  const say = (text: string) => speak(text, voiceOptions(settings))
  // Loads the offline voice now, so the first word you tap plays without waiting.
  useEffect(() => warmUpVoice({ engine: settings.voiceEngine }), [settings.voiceEngine])

  const reset = useCallback(() => {
    setPhase('ask')
    setTyped('')
    setResponse(null)
    setShowWords(false)
    stopSpeaking()
  }, [])

  const next = useCallback(
    (counted?: keyof Tally) => {
      if (counted) setTally((t) => ({ ...t, [counted]: t[counted] + 1 }))
      setIndex(at + 1)
      reset()
    },
    [at, reset],
  )

  const answer = async () => {
    if (!question || !typed.trim()) return
    setResponse((await saveResponse(question.id, typed)) ?? null)
    setTally((t) => ({ ...t, answered: t.answered + 1 }))
    setPhase('answered')
  }

  const show = () => {
    setTally((t) => ({ ...t, shown: t.shown + 1 }))
    setPhase('shown')
  }

  const addWord = (word: string) => {
    setTyped((t) => (t.trimEnd() ? `${t.trimEnd()} ${word}` : word))
    inputRef.current?.focus()
  }

  // Enter goes on to the next question, Escape leaves.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (editing || e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === 'Escape') {
        navigate('/questions')
        return
      }
      if (e.key === 'Enter' && phase !== 'ask' && !isTypingTarget(e.target) && !(e.target as HTMLElement).closest('button')) {
        e.preventDefault()
        next()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [editing, phase, next, navigate])

  const old = useMemo(
    () => (question ? responses.filter((r) => r.questionId === question.id && r.id !== response?.id).sort((a, b) => b.at - a.at) : []),
    [responses, question, response],
  )
  const hints = useMemo(() => (question ? hintWords(question) : []), [question])

  const title = set ?? 'All questions'

  if (!order.length) {
    return (
      <Shell title={title} progress={0}>
        <div className="rounded-flash border border-line bg-main">
          <EmptyState
            icon={<MessageCircleQuestionMark size={20} strokeWidth={1.6} />}
            title="No questions here"
            action={
              <Button variant="primary" onClick={() => navigate('/questions')}>
                Back to questions
              </Button>
            }
          >
            {set ? `The set "${set}" has no questions.` : 'Add a question or the starter questions first.'}
          </EmptyState>
        </div>
      </Shell>
    )
  }

  if (!question) {
    return (
      <Shell title={title} progress={1}>
        <Finished tally={tally} onAgain={onAgain} />
      </Shell>
    )
  }

  const comparison = phase === 'answered' && question.myAnswer && response ? compareWithAnswer(response.text, question.myAnswer) : undefined
  const used = new Set(typed.toLowerCase().split(/\s+/))

  return (
    <Shell title={title} progress={at / order.length} position={`${at + 1} of ${order.length}`}>
      <article key={question.id + at} className="flex animate-flip-in flex-col gap-5 rounded-flash border border-line bg-main p-3 pb-6 shadow-panel sm:p-4 sm:pb-7">
        <div className="flex items-center justify-between gap-3 px-1 text-chip text-muted">
          <span lang="de" className="min-w-0 truncate">
            {[question.set, question.level].filter(Boolean).join(' · ')}
          </span>
          <div className="flex items-center gap-1">
            <IconButton label="Play the question" onClick={() => say(question.question)}>
              <Volume2 size={16} strokeWidth={1.8} />
            </IconButton>
            <IconButton label="Edit question" onClick={() => setEditing(true)}>
              <Pencil size={15} strokeWidth={1.8} />
            </IconButton>
          </div>
        </div>

        <div className="flex flex-col items-center gap-1.5 px-2 pt-2 text-center">
          <h2 lang="de" className="text-[26px] leading-tight font-semibold tracking-[-0.01em] text-balance sm:text-[30px]">
            {question.question}
          </h2>
          {phase === 'ask' && showEnglish && question.english && <p className="text-body text-muted">{question.english}</p>}
        </div>

        {phase === 'ask' ? (
          <form
            className="flex flex-col gap-2 px-1"
            onSubmit={(e) => {
              e.preventDefault()
              void answer()
            }}
          >
            {(question.english || hints.length > 0) && (
              <div className="flex flex-wrap justify-center gap-2 pb-1">
                {question.english && (
                  <PillToggle pressed={showEnglish} onChange={setShowEnglish} icon={<Languages size={15} strokeWidth={1.8} aria-hidden />}>
                    English
                  </PillToggle>
                )}
                {hints.length > 0 && (
                  <PillToggle pressed={showWords} onChange={setShowWords} icon={<Lightbulb size={15} strokeWidth={1.8} aria-hidden />}>
                    Words
                  </PillToggle>
                )}
              </div>
            )}
            {showWords && (
              <div className="flex animate-fade-in flex-wrap justify-center gap-1.5 pb-1" aria-label="Words you can use">
                {hints.map((word) => (
                  <button
                    key={word}
                    type="button"
                    lang="de"
                    onClick={() => addWord(word)}
                    className={clsx(
                      'h-8 rounded-full border px-3 text-small transition-colors',
                      word.toLowerCase().split(/\s+/).every((w) => used.has(w)) ?'border-line text-muted' : 'border-sage-border bg-sage text-sage-ink hover:brightness-[0.97]',
                    )}
                  >
                    {word}
                  </button>
                ))}
              </div>
            )}
            <textarea
              ref={inputRef}
              value={typed}
              rows={2}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => {
                // Enter answers; Shift+Enter starts a new line.
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault()
                  void answer()
                }
              }}
              placeholder="Type your answer…"
              aria-label="Your answer"
              autoComplete="off"
              autoCapitalize="sentences"
              spellCheck={false}
              lang="de"
              className="resize-none rounded-row border border-line-strong bg-main px-4 py-3 text-center text-[17px] leading-normal outline-none transition-colors focus:border-sage-dot"
            />
            <div className="flex flex-wrap justify-center gap-1.5">
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
          </form>
        ) : (
          <div className="flex animate-fade-in flex-col gap-4 border-t border-line px-1 pt-5">
            <dl className="flex flex-col gap-4">
              {phase === 'answered' && response && (
                <Row label="You">
                  <div className="flex flex-col items-start gap-1.5">
                    <p lang="de">{comparison?.kind === 'close' ? <Diff parts={comparison.diff} /> : response.text}</p>
                    {comparison && <ComparisonChip comparison={comparison} />}
                  </div>
                </Row>
              )}
              <Row label="Your answer">
                {question.myAnswer ? (
                  <Spoken text={question.myAnswer} onPlay={say} />
                ) : (
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="text-muted">None yet.</span>
                    <button type="button" onClick={() => setEditing(true)} className="font-medium text-sage-ink hover:text-ink">
                      Write your answer
                    </button>
                  </div>
                )}
              </Row>
              {question.suggested && (
                <Row label="Suggested">
                  <Spoken text={question.suggested} onPlay={say} />
                </Row>
              )}
              {question.english && (
                <Row label="English">
                  <span className="text-muted">{question.english}</span>
                </Row>
              )}
            </dl>
            {old.length > 0 && <OldResponses responses={old} />}
          </div>
        )}
      </article>

      <div className="sticky bottom-[calc(68px+env(safe-area-inset-bottom))] z-10 -mx-1 bg-main/95 px-1 pt-3 pb-1 backdrop-blur-sm md:bottom-4">
        {phase === 'ask' ? (
          <div className="grid grid-cols-[2fr_1.5fr_1fr] gap-2">
            <Button variant="primary" size="lg" disabled={!typed.trim()} onClick={() => void answer()}>
              Answer
            </Button>
            <Button variant="outline" size="lg" onClick={show}>
              Show answer
            </Button>
            <Button variant="ghost" size="lg" onClick={() => next('skipped')}>
              Skip
            </Button>
          </div>
        ) : (
          <Button ref={nextRef} variant="primary" size="lg" className="w-full" onClick={() => next()}>
            {at + 1 < order.length ? 'Next' : 'Finish'}
            <ArrowRight size={16} strokeWidth={1.8} />
          </Button>
        )}
        <div className="hidden justify-center gap-1.5 pt-2.5 text-chip text-muted sm:flex">
          {phase === 'ask' ? (
            <>
              <Kbd>Enter</Kbd> answer · <Kbd>Shift</Kbd>+<Kbd>Enter</Kbd> new line · <Kbd>Esc</Kbd> end
            </>
          ) : (
            <>
              <Kbd>Enter</Kbd> next · <Kbd>Esc</Kbd> end
            </>
          )}
        </div>
      </div>

      <QuestionEditorDialog open={editing} question={question} onClose={() => setEditing(false)} onDeleted={reset} />
    </Shell>
  )
}

function Shell({ title, progress, position, children }: { title: string; progress: number; position?: string; children: ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-160 flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <Link to="/questions" className="flex items-center gap-1.5 text-small text-muted hover:text-ink">
          <X size={16} strokeWidth={1.8} /> End
        </Link>
        <span lang="de" className="min-w-0 truncate text-small font-medium">
          {title}
        </span>
        <span className="min-w-12 text-right text-small text-muted tabular-nums">{position}</span>
      </div>
      <div
        className="h-1 overflow-hidden rounded-full bg-track"
        role="progressbar"
        aria-valuenow={Math.round(progress * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Practice progress"
      >
        <div className="h-full rounded-full bg-sage-bar transition-[width] duration-300" style={{ width: `${progress * 100}%` }} />
      </div>
      {children}
    </div>
  )
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label} className="flex size-8 items-center justify-center rounded-full hover:bg-field hover:text-ink">
      {children}
    </button>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 text-body sm:grid-cols-[112px_1fr] sm:gap-4">
      <dt className="text-small text-muted sm:pt-0.5">{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

function Spoken({ text, onPlay }: { text: string; onPlay: (text: string) => void }) {
  return (
    <div className="flex items-start gap-2">
      <p lang="de" className="font-medium">
        {text}
      </p>
      <button
        type="button"
        onClick={() => onPlay(text)}
        aria-label="Play"
        title="Play"
        className="-mt-1 flex size-7 shrink-0 items-center justify-center rounded-full text-muted hover:bg-field hover:text-ink"
      >
        <Volume2 size={14} strokeWidth={1.8} />
      </button>
    </div>
  )
}

function ComparisonChip({ comparison }: { comparison: Comparison }) {
  const label = comparison.kind === 'same' ? 'Matches your answer' : comparison.kind === 'close' ? 'Almost your answer' : 'Different from your answer'
  const notes = comparison.kind === 'close' ? comparison.notes : []
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.75 text-chip font-medium',
        comparison.kind === 'same' && 'bg-sage text-sage-ink',
        comparison.kind === 'close' && 'bg-(--t-sand-soft) text-(--t-sand-ink)',
        comparison.kind === 'different' && 'bg-neutral-chip text-muted',
      )}
    >
      {comparison.kind === 'same' && <Check size={13} strokeWidth={2.4} />}
      {[label, ...notes].join(' · ')}
    </span>
  )
}

function OldResponses({ responses }: { responses: QuestionResponse[] }) {
  const [all, setAll] = useState(false)
  const shown = all ? responses : responses.slice(0, OLD_SHOWN)
  return (
    <section className="flex flex-col gap-2 border-t border-line pt-4" aria-label="Old responses">
      <h3 className="text-small text-muted">Old responses</h3>
      <ul className="flex flex-col gap-1.5">
        {shown.map((r) => (
          <li key={r.id} className="grid grid-cols-[56px_1fr] gap-3 text-body">
            <span className="pt-px text-small text-muted tabular-nums">{formatDayMonthShort(dateKey(r.at))}</span>
            <span lang="de">{r.text}</span>
          </li>
        ))}
      </ul>
      {responses.length > OLD_SHOWN && (
        <button type="button" onClick={() => setAll(!all)} className="self-start text-small font-medium text-sage-ink hover:text-ink">
          {all ? 'Show fewer' : `Show all (${responses.length})`}
        </button>
      )}
    </section>
  )
}

function Finished({ tally, onAgain }: { tally: Tally; onAgain: () => void }) {
  const navigate = useNavigate()
  const parts = [
    tally.answered && `${tally.answered} answered`,
    tally.shown && `${tally.shown} shown`,
    tally.skipped && `${tally.skipped} skipped`,
  ].filter(Boolean)
  return (
    <div className="flex animate-rise flex-col items-center gap-4 rounded-flash border border-line bg-main px-6 py-10 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-sage text-sage-ink">
        <Check size={26} strokeWidth={2} />
      </div>
      <div className="flex flex-col gap-1">
        <h2 className="text-[22px] font-semibold tracking-[-0.01em]">Practice complete</h2>
        <p className="text-body text-muted tabular-nums">{parts.length ? parts.join(' · ') : `${count(0, 'question')} answered`}</p>
      </div>
      <div className="flex flex-wrap justify-center gap-2 pt-2">
        <Button variant="outline" onClick={() => navigate('/questions')}>
          Questions
        </Button>
        <Button variant="primary" onClick={onAgain}>
          Practise again
        </Button>
      </div>
    </div>
  )
}
