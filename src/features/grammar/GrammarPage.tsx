import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import clsx from 'clsx'
import { ArrowRight, BookA, Check, ChevronRight, Plus, RotateCcw, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { buttonClass } from '@/components/ui/buttonClass'
import { Segmented } from '@/components/ui/form'
import { Chip, EmptyState, PageHeader, ProgressBar, Section } from '@/components/ui/primitives'
import { useFeedback } from '@/components/ui/feedback'
import { installStarterTopics } from '@/data/grammar'
import { useExerciseStats, useGrammarTopics, useNow } from '@/data/hooks'
import type { ExerciseStat, GrammarTopic } from '@/db/types'
import { useStoredToggle } from '@/lib/browser'
import { dueExercises, groupTopics, levelGroups, nextTopic, topicProgress, type TopicProgress } from '@/lib/grammar'
import { count } from '@/lib/text'
import { formatNextReview, MINUTE } from '@/lib/time'
import { practicePath, topicPath } from './paths'
import { TopicEditorDialog } from './TopicEditor'

function TopicRow({ topic, progress }: { topic: GrammarTopic; progress: TopicProgress }) {
  return (
    <li>
      <Link to={topicPath(topic.id)} className="flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-soft">
        <StatusMark progress={progress} />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex flex-wrap items-baseline gap-x-2">
            <span lang="de" className="text-body font-medium">
              {topic.title}
            </span>
            {topic.english && <span className="text-small text-muted">{topic.english}</span>}
          </span>
          {topic.summary && <span className="text-small text-pretty text-muted">{topic.summary}</span>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {progress.weak > 0 && <Chip tone="red">{progress.weak} to work on</Chip>}
          {progress.status === 'learning' && <span className="hidden text-small text-muted tabular-nums sm:inline">{Math.round(progress.share * 100)}%</span>}
          <ChevronRight size={16} strokeWidth={1.8} className="text-muted" aria-hidden />
        </div>
      </Link>
    </li>
  )
}

/** A ring that fills as you learn a topic, with a tick once it is mastered. */
function StatusMark({ progress }: { progress: TopicProgress }) {
  const label = progress.status === 'mastered' ? 'Mastered' : progress.status === 'new' ? 'Not started' : `${Math.round(progress.share * 100)}% known`
  if (progress.status === 'mastered') {
    return (
      <span title={label} aria-label={label} className="flex size-7 shrink-0 items-center justify-center rounded-full bg-sage text-sage-ink">
        <Check size={15} strokeWidth={2.4} />
      </span>
    )
  }
  const r = 11
  const c = 2 * Math.PI * r
  return (
    <svg viewBox="0 0 28 28" className="size-7 shrink-0" role="img" aria-label={label}>
      <title>{label}</title>
      <circle cx="14" cy="14" r={r} fill="none" strokeWidth="3" className="stroke-track" />
      {progress.share > 0 && (
        <circle
          cx="14"
          cy="14"
          r={r}
          fill="none"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={`${progress.share * c} ${c}`}
          transform="rotate(-90 14 14)"
          className="stroke-sage-bar"
        />
      )}
    </svg>
  )
}

/** The next topic on your path, and today's review. */
function Course({ topics, stats, progressOf }: { topics: GrammarTopic[]; stats: ExerciseStat[]; progressOf: (t: GrammarTopic) => TopicProgress }) {
  const navigate = useNavigate()
  const now = useNow(MINUTE)
  const statsById = useMemo(() => new Map(stats.map((s) => [s.id, s])), [stats])
  const next = nextTopic(topics, statsById)
  const due = dueExercises(topics, stats, now).length
  const nextDue = stats.length ? Math.min(...stats.map((s) => s.due ?? s.lastAt)) : undefined
  const progress = next && progressOf(next)

  return (
    <div className="grid gap-3 md:grid-cols-[3fr_2fr]">
      <Section className="flex flex-col gap-3.5 px-5 py-5">
        <div className="text-small font-medium text-muted">{progress?.status === 'learning' ? 'Continue' : 'Next on your path'}</div>
        {next && progress ? (
          <>
            <div className="flex flex-col gap-1">
              <h2 lang="de" className="text-[22px] leading-tight font-semibold tracking-[-0.01em]">
                {next.title}
              </h2>
              <p className="flex flex-wrap items-center gap-2 text-body text-muted">
                {next.english}
                {next.level && <Chip tone="soft">{next.level}</Chip>}
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <ProgressBar value={progress.share} color="sage" label={`${next.title} progress`} />
              <span className="text-small text-muted tabular-nums">
                {progress.known} of {count(progress.total, 'exercise')} known
              </span>
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              {progress.status === 'learning' ? (
                <>
                  <Button variant="primary" icon={<ArrowRight size={15} strokeWidth={1.8} />} onClick={() => navigate(practicePath(next.id))}>
                    Practise
                  </Button>
                  <Button variant="ghost" onClick={() => navigate(topicPath(next.id))}>
                    Read the rule
                  </Button>
                </>
              ) : (
                <Button variant="primary" icon={<ArrowRight size={15} strokeWidth={1.8} />} onClick={() => navigate(topicPath(next.id))}>
                  Start: read the rule
                </Button>
              )}
            </div>
          </>
        ) : (
          <p className="text-body text-pretty">You have mastered every topic. Keep them fresh with the review, or add your own topics.</p>
        )}
      </Section>

      <Section className="flex flex-col gap-3.5 px-5 py-5">
        <div className="text-small font-medium text-muted">Review</div>
        <div className="flex items-baseline gap-2">
          <span className="text-[32px] leading-none font-semibold tabular-nums">{due}</span>
          <span className="text-body text-muted">{due === 1 ? 'exercise due' : 'exercises due'}</span>
        </div>
        <p className="text-small text-pretty text-muted">
          {due
            ? 'Exercises come back days after you get them right, and soon after a mistake, so they stay learned.'
            : nextDue
              ? `Nothing due. The next one is due ${formatNextReview(nextDue, now).toLowerCase()}.`
              : 'Practise a topic, and its exercises come back here to stay learned.'}
        </p>
        <Link
          to="/grammar/review"
          aria-disabled={!due}
          tabIndex={due ? undefined : -1}
          onClick={(e) => !due && e.preventDefault()}
          className={clsx(buttonClass({ variant: due ? 'primary' : 'outline' }), 'mt-auto self-start', !due && 'pointer-events-none opacity-45')}
        >
          <RotateCcw size={15} strokeWidth={1.8} />
          Start review
        </Link>
      </Section>
    </div>
  )
}

export default function GrammarPage() {
  const topics = useGrammarTopics()
  const stats = useExerciseStats()
  const navigate = useNavigate()
  const { toast } = useFeedback()
  const [editing, setEditing] = useState(false)
  const [installing, setInstalling] = useState(false)
  const [bySection, setBySection] = useStoredToggle('lernzeit-grammar-sections', false)

  const statsById = useMemo(() => new Map((stats ?? []).map((s) => [s.id, s])), [stats])
  const progress = useMemo(() => new Map((topics ?? []).map((t) => [t.id, topicProgress(t, statsById)])), [topics, statsById])
  const progressOf = (t: GrammarTopic) => progress.get(t.id) ?? topicProgress(t, statsById)
  const groups = useMemo(() => (bySection ? groupTopics(topics ?? []) : levelGroups(topics ?? [])), [topics, bySection])

  const addStarter = async () => {
    setInstalling(true)
    try {
      const added = await installStarterTopics()
      toast(added ? `Added ${count(added, 'starter topic')}` : 'All starter topics are already here')
    } finally {
      setInstalling(false)
    }
  }

  const total = topics?.length ?? 0
  const mastered = [...progress.values()].filter((p) => p.status === 'mastered').length

  return (
    <>
      <PageHeader
        title="Grammar"
        subtitle={total ? `${mastered} of ${count(total, 'topic')} mastered` : undefined}
        actions={
          <>
            {total > 0 && (
              <Button variant="ghost" disabled={installing} icon={<Sparkles size={15} strokeWidth={1.8} />} onClick={() => void addStarter()} title="Adds the starter topics you do not have yet">
                Starter topics
              </Button>
            )}
            <Button variant="soft" icon={<Plus size={16} strokeWidth={1.8} />} onClick={() => setEditing(true)}>
              New topic
            </Button>
          </>
        }
      />

      {topics && !total ? (
        <div className="rounded-section border border-line">
          <EmptyState
            icon={<BookA size={20} strokeWidth={1.6} />}
            title="No grammar topics yet"
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button variant="outline" disabled={installing} icon={<Sparkles size={15} strokeWidth={1.8} />} onClick={() => void addStarter()}>
                  Add starter topics
                </Button>
                <Button variant="soft" icon={<Plus size={16} strokeWidth={1.8} />} onClick={() => setEditing(true)}>
                  Write a topic
                </Button>
              </div>
            }
          >
            Each topic has the rule, examples and exercises. The starter topics cover A1 to B1.
          </EmptyState>
        </div>
      ) : (
        <>
          {topics && stats && <Course topics={topics} stats={stats} progressOf={progressOf} />}

          <Segmented
            label="Show topics"
            value={bySection ? 'sections' : 'path'}
            onChange={(v) => setBySection(v === 'sections')}
            className="self-start"
            options={[
              { value: 'path', label: 'Your path' },
              { value: 'sections', label: 'By section' },
            ]}
          />

          <div className="flex flex-col gap-6">
            {groups.map(({ group, topics: items }) => {
              const done = items.filter((t) => progressOf(t).status === 'mastered').length
              return (
                <section key={group} className="flex flex-col gap-2.5" aria-label={group}>
                  <h2 className="flex items-baseline justify-between gap-3 px-1 text-small font-medium text-muted">
                    <span>{group}</span>
                    <span className="font-normal tabular-nums">
                      {done} of {items.length} mastered
                    </span>
                  </h2>
                  <Section className="overflow-hidden">
                    <ul className="divide-y divide-line">
                      {items.map((t) => (
                        <TopicRow key={t.id} topic={t} progress={progressOf(t)} />
                      ))}
                    </ul>
                  </Section>
                </section>
              )
            })}
          </div>
        </>
      )}

      <TopicEditorDialog open={editing} onClose={() => setEditing(false)} onCreated={(t) => navigate(topicPath(t.id))} />
    </>
  )
}
