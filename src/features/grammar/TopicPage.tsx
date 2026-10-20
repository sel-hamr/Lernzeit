import { useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { ArrowLeft, ChevronDown, Pencil, Play, Volume2 } from 'lucide-react'
import clsx from 'clsx'
import { Button } from '@/components/ui/Button'
import { Chip, EmptyState, ProgressBar, Section } from '@/components/ui/primitives'
import { GermanWord } from '@/components/GermanWord'
import { useCards, useExerciseStats, useGrammarTopic, useLearningText, useSettings } from '@/data/hooks'
import type { Card, GrammarTopic, TopicDrill } from '@/db/types'
import { drillQuestions, TENSE_LABEL } from '@/lib/drills'
import { EXERCISE_KIND, parseExercise, topicProgress, type ExerciseForm } from '@/lib/grammar'
import { speak, voiceOptions } from '@/data/voice'
import { count } from '@/lib/text'
import { practicePath } from './paths'
import { RuleText } from './RuleText'
import { TopicEditorDialog } from './TopicEditor'

/** How many of your words the "From your cards" panel shows. */
const CARDS_SHOWN = 12

const DRILL_ABOUT: Record<TopicDrill['kind'], { unit: string; none: string }> = {
  gender: { unit: 'noun', none: 'None of your cards has a gender yet. Add nouns with der, die or das.' },
  plural: { unit: 'noun', none: 'None of your nouns has a plural yet. Add it in the card editor, such as "die Hunde".' },
  verbs: { unit: 'verb', none: 'None of your verbs has its conjugation yet. Add it in the card editor.' },
}

export default function TopicPage() {
  const { topicId } = useParams()
  const topic = useGrammarTopic(topicId)
  if (topic === undefined) return <div className="h-60" aria-busy="true" />
  if (topic === null) {
    return (
      <Section>
        <EmptyState
          title="This topic does not exist"
          action={
            <Link to="/grammar" className="font-medium text-sage-ink hover:text-ink">
              Back to grammar
            </Link>
          }
        />
      </Section>
    )
  }
  return <Topic topic={topic} />
}

function Topic({ topic }: { topic: GrammarTopic }) {
  const learning = useLearningText()
  const navigate = useNavigate()
  const settings = useSettings()
  const cards = useCards()
  const stats = useExerciseStats()
  const [editing, setEditing] = useState(false)
  const [showExercises, setShowExercises] = useState(false)

  const say = (text: string) => speak(text, voiceOptions(settings))
  const fitting = useMemo(() => {
    const drill = topic.drill
    return drill ? (cards ?? []).filter((c) => drillQuestions(c, drill.kind, drill.tense).length) : []
  }, [cards, topic.drill])
  const progress = useMemo(() => topicProgress(topic, new Map((stats ?? []).map((s) => [s.id, s]))), [topic, stats])
  const weak = progress.weak
  const canPractise = topic.exercises.length > 0 || fitting.length > 0

  return (
    <div className="mx-auto flex w-full max-w-200 flex-col gap-5">
      <Link to="/grammar" className="flex items-center gap-1.5 self-start text-small text-muted hover:text-ink">
        <ArrowLeft size={15} strokeWidth={1.8} /> Grammar
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1.5">
          <h1 {...learning} className="text-title font-semibold">
            {topic.title}
          </h1>
          <div className="flex flex-wrap items-center gap-2 text-body text-muted">
            {topic.english && <span>{topic.english}</span>}
            {topic.level && <Chip tone="soft">{topic.level}</Chip>}
            <Chip tone="neutral">{topic.group}</Chip>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <Button variant="ghost" icon={<Pencil size={15} strokeWidth={1.8} />} onClick={() => setEditing(true)}>
            Edit
          </Button>
          <Button variant="primary" icon={<Play size={15} strokeWidth={1.8} />} disabled={!canPractise} onClick={() => navigate(practicePath(topic.id))}>
            Practise
          </Button>
        </div>
      </header>

      {topic.summary && <p className="text-body text-pretty text-ink-2">{topic.summary}</p>}

      {progress.total > 0 && (
        <div className="flex flex-col gap-1.5">
          <ProgressBar value={progress.share} color="sage" label="How well you know this topic" />
          <span className="text-small text-muted tabular-nums">
            {progress.status === 'new'
              ? 'Not started yet. Read the rule, then practise.'
              : progress.status === 'mastered'
                ? `Mastered: ${progress.known} of ${count(progress.total, 'exercise')} known. The review keeps it fresh.`
                : `${progress.known} of ${count(progress.total, 'exercise')} known${weak ? ` · ${weak} to work on` : ''}`}
          </span>
        </div>
      )}

      {topic.rule && (
        <Panel title="The rule">
          <RuleText text={topic.rule} />
        </Panel>
      )}

      {topic.examples.length > 0 && (
        <Panel title="Examples">
          <ul className="flex flex-col gap-3">
            {topic.examples.map((ex, i) => (
              <li key={i} className="flex items-start gap-2">
                <button
                  type="button"
                  onClick={() => say(ex.de)}
                  aria-label={`Play: ${ex.de}`}
                  title="Play"
                  className="-mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full text-muted hover:bg-field hover:text-ink"
                >
                  <Volume2 size={14} strokeWidth={1.8} />
                </button>
                <div className="flex flex-col gap-0.5">
                  <span {...learning} className="text-body font-medium">
                    {ex.de}
                  </span>
                  {ex.en && <span className="text-small text-muted">{ex.en}</span>}
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {topic.drill && <FromYourCards drill={topic.drill} cards={fitting} />}

      <Panel
        title="Exercises"
        aside={
          topic.exercises.length > 0 && (
            <button type="button" aria-expanded={showExercises} onClick={() => setShowExercises(!showExercises)} className="flex items-center gap-1 text-small font-medium text-sage-ink hover:text-ink">
              {showExercises ? 'Hide' : 'Show all'}
              <ChevronDown size={15} strokeWidth={1.8} className={clsx('transition-transform', showExercises && 'rotate-180')} />
            </button>
          )
        }
      >
        <p className="text-body text-muted">
          {[
            topic.exercises.length ? count(topic.exercises.length, 'exercise') : 'No exercises of its own',
            fitting.length > 0 && `${count(fitting.length, 'word')} from your cards`,
            weak > 0 && `${weak} to work on`,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
        {showExercises && (
          <ol className="flex animate-fade-in list-decimal flex-col gap-3 pt-1 pl-5 marker:text-muted">
            {topic.exercises.map((e) => {
              const form = parseExercise(e.text)
              return (
                <li key={e.id} className="text-body">
                  {form ? <Solved form={form} /> : <span {...learning}>{e.text}</span>}
                  {e.en && <span className="block text-small text-muted">{e.en}</span>}
                  {e.why && <span className="block text-small text-ink-2">{e.why}</span>}
                </li>
              )
            })}
          </ol>
        )}
      </Panel>

      <TopicEditorDialog open={editing} topic={topic} onClose={() => setEditing(false)} onDeleted={() => navigate('/grammar')} />
    </div>
  )
}

/** An exercise with its answer, for reading: the gap filled, the mistake fixed, the sentence in order. */
function Solved({ form }: { form: ExerciseForm }) {
  const learning = useLearningText()
  const answer = <strong className="font-semibold text-sage-ink">{form.answers.join(' / ')}</strong>
  return (
    <span className="flex flex-col">
      <span className="text-chip text-muted">{EXERCISE_KIND[form.type]}</span>
      <span {...learning}>
        {form.type === 'gap' ? (
          <>
            {form.before}
            {answer}
            {form.after}
          </>
        ) : form.type === 'mistake' ? (
          <>
            {form.before}
            <span className="text-red-ink line-through">{form.shown}</span> {answer}
            {form.after}
          </>
        ) : form.type === 'write' ? (
          <>
            {form.prompt} → {answer}
          </>
        ) : (
          answer
        )}
      </span>
    </span>
  )
}

function Panel({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <Section className="flex flex-col gap-3.5 px-5 py-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-section font-semibold">{title}</h2>
        {aside}
      </div>
      {children}
    </Section>
  )
}

/** Your own words that this topic practises too. */
function FromYourCards({ drill, cards }: { drill: TopicDrill; cards: Card[] }) {
  const learning = useLearningText()
  const shown = cards.slice(0, CARDS_SHOWN)
  const about = DRILL_ABOUT[drill.kind]
  return (
    <Panel title="From your cards" aside={cards.length > 0 && <span className="text-small text-muted tabular-nums">{count(cards.length, about.unit)}</span>}>
      {!cards.length ? (
        <p className="text-body text-muted">{about.none}</p>
      ) : drill.kind === 'verbs' ? (
        <ul className="flex flex-col gap-2.5">
          {shown.slice(0, 5).map((card) => (
            <li key={card.id} className="flex flex-col gap-0.5">
              <span {...learning} className="text-body font-medium">
                {card.german}
              </span>
              {(drill.tense ? [drill.tense] : (['present', 'past', 'perfect'] as const)).map((tense) =>
                card.conjugation?.[tense] ? (
                  <span key={tense} className="text-small text-muted">
                    <span className="text-ink-2">{TENSE_LABEL[tense]}:</span> <span {...learning}>{card.conjugation[tense]}</span>
                  </span>
                ) : null,
              )}
            </li>
          ))}
        </ul>
      ) : (
        <ul className="flex flex-wrap gap-x-4 gap-y-1.5" {...learning}>
          {shown.map((card) => (
            <li key={card.id} className="text-body">
              <GermanWord word={card.german} gender={card.gender} />
              {drill.kind === 'plural' && (
                <span className="text-muted"> → {card.plural}</span>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="text-small text-muted">Practice mixes questions about your own words in with the exercises.</p>
    </Panel>
  )
}
