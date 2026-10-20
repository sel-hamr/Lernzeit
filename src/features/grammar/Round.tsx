import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import clsx from 'clsx'
import { ArrowRight, BookA, Check, Delete, Lightbulb, MessageCircle, Volume2, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { LetterButtons } from '@/components/LetterButtons'
import { EmptyState, Kbd } from '@/components/ui/primitives'
import { CardImage } from '@/components/CardImage'
import { Diff } from '@/components/Diff'
import { CardGerman, GermanWord } from '@/components/GermanWord'
import { saveDrillAnswer } from '@/data/drills'
import { saveExerciseAnswer } from '@/data/grammar'
import { useDecks, useLanguage, useLearningText, useSettings, useTopics } from '@/data/hooks'
import { pickStoryTopic } from '@/data/stories'
import { useActiveStudyTime, type ActiveRun } from '@/data/studyTime'
import { recordGrammarTime } from '@/data/timer'
import type { Card, Gender, GrammarTopic } from '@/db/types'
import { isTypingTarget } from '@/lib/browser'
import { PERSON_LABEL, requeue, TENSE_LABEL, type DrillResult } from '@/lib/drills'
import {
  askClaudePrompt,
  checkQuestion,
  claudeChatUrl,
  EXERCISE_KIND,
  filledSentence,
  questionKey,
  spokenQuestion,
  type ExerciseQuestion,
  type RoundItem,
  type RoundQuestion,
} from '@/lib/grammar'
import { germanText } from '@/lib/german'
import { speak, stopSpeaking, voiceOptions, warmUpVoice } from '@/data/voice'

const GENDERS: Gender[] = ['der', 'die', 'das']

const GENDER_BUTTON: Record<Gender, string> = {
  der: 'border-der/35 bg-der/8 text-der hover:bg-der/14',
  die: 'border-die/35 bg-die/8 text-die hover:bg-die/14',
  das: 'border-das/35 bg-das/8 text-das hover:bg-das/14',
}

/** Stays the same between renders, so hooks that use the tiles do not rerun. */
const NO_TILES: string[] = []

const BIG = 'text-[26px] leading-tight font-semibold tracking-[-0.01em] text-balance sm:text-[30px]'

/** The article a choice is, for its colour: "Die" → die. */
function articleOf(choice: string): Gender | undefined {
  const lower = choice.toLowerCase()
  return GENDERS.find((g) => g === lower)
}

/** The choices of a question, for the buttons and the 1–4 keys. Articles always come as der, die, das. */
function choicesOf(question: RoundQuestion): string[] | undefined {
  if (question.kind === 'gender') return GENDERS
  if (question.kind !== 'exercise' || question.form.type !== 'gap' || !question.form.options) return undefined
  const { options } = question.form
  if (!options.every(articleOf)) return options
  return [...options].sort((a, b) => GENDERS.indexOf(articleOf(a)!) - GENDERS.indexOf(articleOf(b)!))
}

/** How a question is answered. */
function modeOf(question: RoundQuestion): 'choose' | 'type' | 'tap' | 'order' {
  if (choicesOf(question)) return 'choose'
  if (question.kind === 'exercise' && question.form.type === 'mistake') return 'tap'
  if (question.kind === 'exercise' && question.form.type === 'order') return 'order'
  return 'type'
}

export interface RoundProps {
  /** Shown at the top. */
  title: string
  /** Where End and Esc go. */
  exit: string
  exitLabel: string
  /** The questions, fixed when the round starts. */
  initial: () => RoundItem[]
  /** Topics by id, for the exercise's topic and Ask Claude. */
  topics: Map<string, GrammarTopic>
  /** Your cards by id, looked up live. */
  cards: Map<string, Card>
  /** Show which topic each exercise is from (in a review). */
  showTopic?: boolean
  /** Names the study session, e.g. the topic's title. */
  timeId: string
  timeTitle: string
  empty: { title: string; body: string }
  /** Shown on the end screen, e.g. how far the topic moved. */
  summary?: ReactNode
  onAgain: () => void
}

/** A practice or review round: one question at a time, wrong answers come back, a summary at the end. */
export function Round({ title, exit, exitLabel, initial, topics, cards, showTopic, timeId, timeTitle, empty, summary, onAgain }: RoundProps) {
  const learning = useLearningText()
  const navigate = useNavigate()
  const settings = useSettings()
  const decks = useDecks()
  const studyTopics = useTopics()
  const [items, setItems] = useState<RoundItem[]>(initial)
  const [index, setIndex] = useState(0)
  const [typed, setTyped] = useState('')
  const [built, setBuilt] = useState<number[]>([])
  const [given, setGiven] = useState<string | null>(null)
  const [result, setResult] = useState<DrillResult | null>(null)
  const [firstTry, setFirstTry] = useState<Map<string, { question: RoundQuestion; correct: boolean }>>(() => new Map())
  const inputRef = useRef<HTMLInputElement>(null)
  const nextRef = useRef<HTMLButtonElement>(null)

  // A card deleted during the round is passed over.
  const gone = (q: RoundQuestion) => q.kind !== 'exercise' && !cards.has(q.cardId)
  let at = index
  while (at < items.length && gone(items[at].question)) at++
  const item = items[at]
  const question = item?.question
  const card = question && question.kind !== 'exercise' ? cards.get(question.cardId) : undefined
  const topic = question?.kind === 'exercise' ? topics.get(question.topicId) : undefined

  const timeTopic = pickStoryTopic(decks, studyTopics)
  const saveTime = useCallback((run: ActiveRun) => recordGrammarTime({ ...run, title: timeTitle }), [timeTitle])
  useActiveStudyTime({ kind: 'grammar', id: timeId, topicId: timeTopic, enabled: settings.countGrammarTime, save: saveTime })

  // Speech started here stops when you leave practice.
  useEffect(() => stopSpeaking, [])

  useEffect(() => {
    if (result) nextRef.current?.focus()
    else inputRef.current?.focus()
  }, [result, at])

  const say = useCallback(
    (text: string) => speak(text, voiceOptions(settings)),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only the voice settings matter
    [settings.voiceEngine, settings.voiceURI, settings.speechRate],
  )
  // Loads the offline voice now, so the first answer plays without waiting.
  useEffect(() => warmUpVoice({ engine: settings.voiceEngine }), [settings.voiceEngine])
  const spoken = question ? (question.kind === 'gender' && card ? germanText(card) : spokenQuestion(question)) : ''
  const choices = question ? choicesOf(question) : undefined
  const mode = question ? modeOf(question) : 'type'
  const tiles = question?.kind === 'exercise' && question.form.type === 'order' ? question.form.words : NO_TILES

  const answer = useCallback(
    (value: string) => {
      if (!question || result) return
      const checked = checkQuestion(question, value)
      setResult(checked)
      setGiven(value)
      if (item.attempt === 0) setFirstTry((m) => new Map(m).set(questionKey(question), { question, correct: checked.correct }))
      if (!checked.correct) setItems((list) => requeue(list, at))
      if (question.kind === 'exercise') void saveExerciseAnswer(question.topicId, question.exerciseId, checked.correct)
      else void saveDrillAnswer(question.cardId, question.kind, checked.correct)
      if (settings.autoPlayAudio) say(spoken)
    },
    [question, item, result, at, settings.autoPlayAudio, say, spoken],
  )

  const checkOrder = useCallback(() => answer(built.map((i) => tiles[i]).join(' ')), [answer, built, tiles])

  const next = useCallback(() => {
    setIndex(at + 1)
    setTyped('')
    setBuilt([])
    setGiven(null)
    setResult(null)
    stopSpeaking()
  }, [at])

  // 1–4 pick a choice; Enter checks or goes on; Backspace takes back a word; Escape leaves.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === 'Escape') {
        navigate(exit)
        return
      }
      if (isTypingTarget(e.target)) return
      const n = Number(e.key)
      if (!result && choices && n >= 1 && n <= choices.length) {
        e.preventDefault()
        answer(choices[n - 1])
        return
      }
      if (!result && mode === 'order' && e.key === 'Backspace') {
        e.preventDefault()
        setBuilt((b) => b.slice(0, -1))
        return
      }
      if (e.key !== 'Enter' || (e.target as HTMLElement).closest('button')) return
      if (result) {
        e.preventDefault()
        next()
      } else if (mode === 'order' && built.length === tiles.length) {
        e.preventDefault()
        checkOrder()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [result, choices, mode, built, tiles, answer, checkOrder, next, navigate, exit])

  if (!items.length) {
    return (
      <Shell title={title} exit={exit} progress={0}>
        <div className="rounded-flash border border-line bg-main">
          <EmptyState
            icon={<BookA size={20} strokeWidth={1.6} />}
            title={empty.title}
            action={
              <Button variant="primary" onClick={() => navigate(exit)}>
                {exitLabel}
              </Button>
            }
          >
            {empty.body}
          </EmptyState>
        </div>
      </Shell>
    )
  }

  if (!question) {
    const answers = [...firstTry.values()]
    const missed = answers.filter((a) => !a.correct).map((a) => a.question)
    return (
      <Shell title={title} exit={exit} progress={1}>
        <Finished right={answers.length - missed.length} total={answers.length} missed={missed} cards={cards} summary={summary} exit={exit} exitLabel={exitLabel} onAgain={onAgain} />
      </Shell>
    )
  }

  const label =
    question.kind === 'exercise'
      ? [EXERCISE_KIND[question.form.type], showTopic && topic?.title].filter(Boolean).join(' · ')
      : question.kind === 'verbs'
        ? `Your verbs · ${TENSE_LABEL[question.tense]}`
        : `Your words · ${card?.english ?? ''}`

  return (
    <Shell title={title} exit={exit} progress={at / items.length} position={`${at + 1} / ${items.length}`}>
      <article key={`${questionKey(question)}:${at}`} className="flex animate-flip-in flex-col items-center gap-4 rounded-flash border border-line bg-main p-3 pb-6 text-center shadow-panel sm:p-4 sm:pb-7">
        <div className="flex w-full items-center justify-between gap-3 px-1 text-chip text-muted">
          <span {...learning} className="min-w-0 truncate">
            {label}
          </span>
          <button
            type="button"
            onClick={() => say(spoken)}
            aria-label="Play the answer"
            title="Play the answer"
            className={clsx('flex size-8 items-center justify-center rounded-full hover:bg-field hover:text-ink', !result && 'invisible')}
          >
            <Volume2 size={16} strokeWidth={1.8} />
          </button>
        </div>

        {card && question.kind !== 'verbs' && <CardImage imageId={card.imageId} emoji={card.emoji} label={card.german} seed={card.id} alt="" className="h-40 w-full sm:h-48" />}

        {question.kind === 'exercise' ? (
          <ExercisePrompt question={question} answered={!!result} given={given} built={built.map((i) => tiles[i])} onTap={(i) => answer(String(i))} />
        ) : (
          <CardPrompt question={question} card={card} answered={!!result} />
        )}

        {mode === 'order' && !result && (
          <WordBank
            tiles={tiles}
            used={built}
            onPick={(i) => setBuilt((b) => [...b, i])}
            onUndo={() => setBuilt((b) => b.slice(0, -1))}
            onClear={() => setBuilt([])}
          />
        )}

        {result && <Feedback question={question} result={result} given={given} typed={typed} />}
        {result && question.kind === 'exercise' && <Explain question={question} topic={topic} given={given ?? ''} correct={result.correct} />}

        {mode === 'type' && !result && (
          <form
            className="flex w-full flex-col gap-2 px-1"
            onSubmit={(e) => {
              e.preventDefault()
              if (typed.trim()) answer(typed)
            }}
          >
            <input
              ref={inputRef}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={placeholderOf(question)}
              aria-label="Your answer"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              {...learning}
              className="h-12 rounded-row border border-line-strong bg-main px-4 text-center text-[18px] outline-none transition-colors focus:border-sage-dot"
            />
            <LetterButtons
              onLetter={(ch) => {
                setTyped((t) => t + ch)
                inputRef.current?.focus()
              }}
            />
          </form>
        )}
      </article>

      <div className="sticky bottom-[calc(68px+env(safe-area-inset-bottom))] z-10 -mx-1 bg-main/95 px-1 pt-3 pb-1 backdrop-blur-sm md:bottom-4">
        {result ? (
          <Button ref={nextRef} variant="primary" size="lg" className="w-full" onClick={next}>
            {at + 1 < items.length ? 'Next' : 'Finish'}
            <ArrowRight size={16} strokeWidth={1.8} />
          </Button>
        ) : mode === 'choose' ? (
          <div className={clsx('grid gap-2', choices!.length === 2 ? 'grid-cols-2' : choices!.length === 4 ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3')} role="group" aria-label="Choices">
            {choices!.map((choice, i) => (
              <button
                key={choice}
                type="button"
                {...learning}
                onClick={() => answer(choice)}
                className={clsx(
                  'flex min-h-14 items-center justify-center gap-2 rounded-row border px-3 py-2 font-semibold transition-[background-color,transform] active:scale-[0.98]',
                  articleOf(choice) ? `text-[19px] ${GENDER_BUTTON[articleOf(choice)!]}` : 'border-line-strong bg-main text-[17px] text-ink hover:bg-soft',
                )}
              >
                {choice}
                <span className="hidden text-chip font-normal opacity-50 sm:inline">{i + 1}</span>
              </button>
            ))}
          </div>
        ) : mode === 'tap' ? (
          <Button variant="ghost" size="lg" className="w-full" onClick={() => answer('')}>
            Don&apos;t know
          </Button>
        ) : (
          <div className="grid grid-cols-[2fr_1fr] gap-2">
            <Button
              variant="primary"
              size="lg"
              disabled={mode === 'order' ? built.length < tiles.length : !typed.trim()}
              onClick={() => (mode === 'order' ? checkOrder() : answer(typed))}
            >
              Check
            </Button>
            <Button variant="ghost" size="lg" onClick={() => answer('')}>
              Don&apos;t know
            </Button>
          </div>
        )}
        <div className="hidden justify-center gap-1.5 pt-2.5 text-chip text-muted sm:flex">
          {result ? (
            <>
              <Kbd>Enter</Kbd> next · <Kbd>Esc</Kbd> end
            </>
          ) : mode === 'choose' ? (
            <>
              <Kbd>1</Kbd>–<Kbd>{String(choices!.length)}</Kbd> choose · <Kbd>Esc</Kbd> end
            </>
          ) : mode === 'tap' ? (
            <>
              Tap the wrong word · <Kbd>Esc</Kbd> end
            </>
          ) : mode === 'order' ? (
            <>
              <Kbd>Enter</Kbd> check · <Kbd>⌫</Kbd> take back · <Kbd>Esc</Kbd> end
            </>
          ) : (
            <>
              <Kbd>Enter</Kbd> check · <Kbd>Esc</Kbd> end
            </>
          )}
        </div>
      </div>
    </Shell>
  )
}

function placeholderOf(question: RoundQuestion): string {
  if (question.kind === 'plural') return 'die …'
  if (question.kind === 'verbs') return 'Type the verb form…'
  if (question.kind === 'exercise' && question.form.type === 'write') return 'Type the whole sentence…'
  return 'Type the missing word…'
}

/** An exercise: the gap, the words to tap or order, or the sentence to rewrite. Once answered, the right sentence. */
function ExercisePrompt({ question, answered, given, built, onTap }: { question: ExerciseQuestion; answered: boolean; given: string | null; built: string[]; onTap: (i: number) => void }) {
  const learning = useLearningText()
  const { form } = question
  const english = question.english && <p className="text-body text-muted">{question.english}</p>

  if (form.type === 'gap') {
    return (
      <div className="flex flex-col items-center gap-1.5 px-2 pt-4">
        <h2 {...learning} className={BIG}>
          {form.before}
          <span className={answered ? 'text-sage-ink' : 'text-muted'}>{answered ? form.answers[0] : '___'}</span>
          {form.after}
        </h2>
        {english}
      </div>
    )
  }

  if (form.type === 'mistake') {
    if (answered) {
      const tapped = given ? form.words[Number(given)] : undefined
      return (
        <div className="flex flex-col items-center gap-1.5 px-2 pt-4">
          <h2 {...learning} className={BIG}>
            {form.before}
            <span className="text-sage-ink">{form.answers[0]}</span>
            {form.after}
          </h2>
          <p {...learning} className="text-body text-muted">
            The mistake was <span className="text-red-ink line-through">{form.words[form.wrongIndex]}</span>
            {tapped && Number(given) !== form.wrongIndex && <> · you tapped “{tapped}”</>}
          </p>
          {english}
        </div>
      )
    }
    return (
      <div className="flex flex-col items-center gap-3 px-1 pt-3">
        <p className="text-body text-muted">Tap the wrong word.</p>
        <div {...learning} className="flex flex-wrap justify-center gap-1.5">
          {form.words.map((word, i) => (
            <button
              key={i}
              type="button"
              onClick={() => onTap(i)}
              className="rounded-row border border-line bg-main px-2.5 py-1.5 text-[20px] font-semibold transition-colors hover:border-red-ink/40 hover:bg-red-soft sm:text-[22px]"
            >
              {word}
            </button>
          ))}
        </div>
        {english}
      </div>
    )
  }

  if (form.type === 'order') {
    return (
      <div className="flex w-full flex-col items-center gap-2 px-1 pt-3">
        {english ?? <p className="text-body text-muted">Build the sentence.</p>}
        <div
          {...learning}
          aria-label="Your sentence"
          className={clsx(
            'flex min-h-16 w-full flex-wrap items-center justify-center gap-x-2 gap-y-1 rounded-row border border-dashed px-3 py-3 text-[22px] font-semibold',
            answered ? 'border-transparent' : 'border-line-strong',
          )}
        >
          {answered ? (
            <span className="text-sage-ink">{form.answers[0]}</span>
          ) : built.length ? (
            <>
              {built.join(' ')}
              {built.length === form.words.length && form.end}
            </>
          ) : (
            <span className="text-body font-normal text-muted">Tap the words in order</span>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-1.5 px-2 pt-4">
      <h2 {...learning} className="text-[22px] leading-snug font-semibold text-balance sm:text-[24px]">
        {form.prompt}
      </h2>
      {answered && (
        <p {...learning} className="pt-1 text-[20px] font-semibold text-sage-ink">
          {form.answers[0]}
        </p>
      )}
      {english}
    </div>
  )
}

/** The words still to place, and buttons to take them back. */
function WordBank({ tiles, used, onPick, onUndo, onClear }: { tiles: string[]; used: number[]; onPick: (i: number) => void; onUndo: () => void; onClear: () => void }) {
  const learning = useLearningText()
  return (
    <div className="flex w-full flex-col items-center gap-3 px-1">
      <div {...learning} className="flex flex-wrap justify-center gap-2" role="group" aria-label="Words">
        {tiles.map((word, i) =>
          used.includes(i) ? (
            <span key={i} aria-hidden className="rounded-row border border-dashed border-line px-3 py-2 text-[18px] text-transparent">
              {word}
            </span>
          ) : (
            <button
              key={i}
              type="button"
              onClick={() => onPick(i)}
              className="rounded-row border border-line-strong bg-main px-3 py-2 text-[18px] font-medium shadow-nav transition-[background-color,transform] hover:bg-soft active:scale-[0.97]"
            >
              {word}
            </button>
          ),
        )}
      </div>
      {used.length > 0 && (
        <div className="flex gap-3 text-small">
          <button type="button" onClick={onUndo} className="flex items-center gap-1 font-medium text-muted hover:text-ink">
            <Delete size={14} strokeWidth={1.8} /> Take back
          </button>
          <button type="button" onClick={onClear} className="font-medium text-muted hover:text-ink">
            Start over
          </button>
        </div>
      )}
    </div>
  )
}

/** A question about one of your cards. */
function CardPrompt({ question, card, answered }: { question: Exclude<RoundQuestion, ExerciseQuestion>; card?: Card; answered: boolean }) {
  const learning = useLearningText()
  if (!card) return null
  if (question.kind === 'gender') {
    return (
      <h2 {...learning} className={BIG}>
        {answered ? <CardGerman card={card} /> : <>___ {card.german}</>}
      </h2>
    )
  }
  if (question.kind === 'plural') {
    return (
      <div className="flex flex-col items-center gap-1">
        <h2 {...learning} className={BIG}>
          <GermanWord word={card.german} gender={card.gender} />
        </h2>
        <p className="text-body text-muted">Plural?</p>
      </div>
    )
  }
  const pronoun = question.impersonal ? 'es' : PERSON_LABEL[question.person]
  return (
    <div className="flex flex-col items-center gap-1.5 px-2 pt-4">
      <h2 {...learning} className={BIG}>
        {pronoun} <span className={answered ? 'text-sage-ink' : 'text-muted'}>{answered ? question.answers[0] : '___'}</span>
      </h2>
      <p className="text-body text-muted">
        <span {...learning} className="font-medium text-ink-2">
          {question.infinitive}
        </span>
        {card.english && ` · ${card.english}`}
      </p>
      {answered && card.conjugation?.[question.tense] && (
        <p {...learning} className="text-small text-muted">
          {TENSE_LABEL[question.tense]}: {card.conjugation[question.tense]}
        </p>
      )}
    </div>
  )
}

/** What a wrong answer was: nothing, the wrong word, the wrong choice, or just not quite right. */
function wrongLabel(question: RoundQuestion, given: string | null): string {
  if (!given?.trim()) return 'The answer'
  if (question.kind === 'exercise' && question.form.type === 'mistake') return 'Not that word'
  const picked = question.kind === 'gender' || (question.kind === 'exercise' && question.form.type === 'gap' && question.form.options)
  return picked ? `Not ${given}` : 'Not quite'
}

function Feedback({ question, result, given, typed }: { question: RoundQuestion; result: DrillResult; given: string | null; typed: string }) {
  const learning = useLearningText()
  const { check } = result
  const exact = check ? check.verdict === 'exact' : result.correct
  const blank = !given?.trim()
  const label = result.correct ? (exact ? 'Right' : 'Almost') : wrongLabel(question, given)
  const notes = check?.notes ?? []
  const others =
    question.kind === 'verbs' ? question.answers.slice(1) : question.kind === 'exercise' && question.form.type !== 'mistake' ? question.form.answers.slice(1) : []
  const yourOrder = question.kind === 'exercise' && question.form.type === 'order' && !result.correct && !blank
  return (
    <div className="flex animate-fade-in flex-col items-center gap-2">
      <span
        role="status"
        className={clsx(
          'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-chip font-medium',
          exact && result.correct && 'bg-sage text-sage-ink',
          result.correct && !exact && 'bg-(--t-sand-soft) text-(--t-sand-ink)',
          !result.correct && 'bg-red-soft text-red-ink',
        )}
      >
        {result.correct && <Check size={13} strokeWidth={2.4} />}
        {[label, ...notes].join(' · ')}
      </span>
      {check && typed.trim() && check.verdict !== 'exact' && (
        <div className="text-body">
          <span className="text-muted">You typed </span>
          <Diff parts={check.diff} />
        </div>
      )}
      {yourOrder && (
        <p {...learning} className="text-body">
          <span className="text-muted">You built </span>
          <span className="text-red-ink">{given}</span>
        </p>
      )}
      {question.kind === 'plural' && (
        <p {...learning} className="text-[22px] font-semibold">
          {question.answer}
        </p>
      )}
      {others.length > 0 && (
        <p {...learning} className="text-small text-muted">
          Also right: {others.join(' · ')}
        </p>
      )}
    </div>
  )
}

/** Why the answer is right, and a way to ask Claude for more. */
function Explain({ question, topic, given, correct }: { question: ExerciseQuestion; topic?: GrammarTopic; given: string; correct: boolean }) {
  const { name, native } = useLanguage()
  const href = useMemo(
    () => (topic ? claudeChatUrl(askClaudePrompt({ topic, question, answer: given, correct, language: { name, native: native.name } })) : undefined),
    [topic, question, given, correct, name, native.name],
  )
  if (!question.why && !href) return null
  return (
    <div className="flex w-full max-w-md animate-fade-in flex-col gap-2.5 rounded-row bg-field px-4 py-3 text-left">
      {question.why && (
        <p className="flex gap-2 text-body text-pretty" dir={native.rtl ? 'rtl' : 'ltr'}>
          <Lightbulb size={16} strokeWidth={1.8} className="mt-0.5 shrink-0 text-(--t-sand-ink)" aria-hidden />
          <span>{question.why}</span>
        </p>
      )}
      {href && (
        <a href={href} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 self-start text-small font-medium text-sage-ink hover:text-ink">
          <MessageCircle size={14} strokeWidth={1.8} />
          {correct ? 'Ask Claude for more examples' : 'Ask Claude why'}
        </a>
      )}
    </div>
  )
}

function Shell({ title, exit, progress, position, children }: { title: string; exit: string; progress: number; position?: string; children: ReactNode }) {
  const learning = useLearningText()
  return (
    <div className="mx-auto flex w-full max-w-160 flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <Link to={exit} className="flex items-center gap-1.5 text-small text-muted hover:text-ink">
          <X size={16} strokeWidth={1.8} /> End
        </Link>
        <span {...learning} className="min-w-0 truncate text-small font-medium">
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

/** A missed question with its answer. */
function MissedRow({ question, card }: { question: RoundQuestion; card?: Card }) {
  if (question.kind === 'exercise') return <>{filledSentence(question)}</>
  if (!card) return null
  if (question.kind === 'gender') return <CardGerman card={card} />
  if (question.kind === 'plural') {
    return (
      <>
        <GermanWord word={card.german} gender={card.gender} /> <span className="text-muted">→</span> {question.answer}
      </>
    )
  }
  return (
    <>
      <span className="text-muted">
        {question.impersonal ? 'es' : PERSON_LABEL[question.person]} ___ ({question.infinitive}) →
      </span>{' '}
      {question.answers[0]} <span className="text-chip text-muted">{TENSE_LABEL[question.tense].toLowerCase()}</span>
    </>
  )
}

function Finished({
  right,
  total,
  missed,
  cards,
  summary,
  exit,
  exitLabel,
  onAgain,
}: {
  right: number
  total: number
  missed: RoundQuestion[]
  cards: Map<string, Card>
  summary?: ReactNode
  exit: string
  exitLabel: string
  onAgain: () => void
}) {
  const learning = useLearningText()
  const navigate = useNavigate()
  return (
    <div className="flex animate-rise flex-col items-center gap-4 rounded-flash border border-line bg-main px-6 py-10 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-sage text-sage-ink">
        <Check size={26} strokeWidth={2} />
      </div>
      <div className="flex flex-col gap-1">
        <h2 className="text-[22px] font-semibold tracking-[-0.01em]">Round done</h2>
        <p className="text-body text-muted tabular-nums">
          {right} of {total} right the first time
        </p>
      </div>
      {summary}
      {missed.length > 0 && (
        <section className="flex w-full max-w-md flex-col gap-2 border-t border-line pt-4 text-left" aria-label="To work on">
          <h3 className="text-small text-muted">To work on · they come back in your review</h3>
          <ul className="flex flex-col gap-1.5">
            {missed.map((q) => (
              <li key={questionKey(q)} {...learning} className="text-body">
                <MissedRow question={q} card={q.kind === 'exercise' ? undefined : cards.get(q.cardId)} />
              </li>
            ))}
          </ul>
        </section>
      )}
      <div className="flex flex-wrap justify-center gap-2 pt-2">
        <Button variant="outline" onClick={() => navigate(exit)}>
          {exitLabel}
        </Button>
        <Button variant="primary" onClick={onAgain}>
          Practise again
        </Button>
      </div>
    </div>
  )
}
