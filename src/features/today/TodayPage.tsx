import { Link, useNavigate } from 'react-router'
import clsx from 'clsx'
import { Check, Clock3, ListTodo, Play, Plus, Volume2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Chip, Dot, EmptyState, PageHeader, PriorityChip, ProgressBar, Section, SectionHeader, StatStrip } from '@/components/ui/primitives'
import { CardImage } from '@/components/CardImage'
import { CardGerman } from '@/components/GermanWord'
import { useUI } from '@/app/ui'
import { useCards, useLanguage, useSettings, useStudyQueue, useTasks, useTopics } from '@/data/hooks'
import { useTodayProgress, type TopicProgress } from '@/data/progress'
import { useStreaks, useWordOfTheDay } from '@/data/stats'
import { isDueToday, isOverdue, toggleTaskDone } from '@/data/tasks'
import { useStartTimer } from '@/features/timer/useStartTimer'
import { PRIORITY_ORDER } from '@/lib/colors'
import { germanText } from '@/lib/german'
import { speak, voiceOptions } from '@/data/voice'
import { dateKey, formatClock, formatDayMonthShort, formatHM, formatLongDate } from '@/lib/time'
import { isPaused } from '@/lib/timer'

function GoalRow({ row, running, onStart }: { row: TopicProgress; running: boolean; onStart: () => void }) {
  const { topic, goal, done, left, hit } = row
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-t border-line py-3.5">
      <div className="flex min-w-50 flex-[1_1_220px] flex-col gap-2">
        <div className="flex justify-between gap-3 text-body">
          <span className="flex items-center gap-2 font-medium">
            <Dot color={topic.color} />
            {topic.name}
          </span>
          <span className="text-muted tabular-nums">
            {formatHM(done)} of {formatHM(goal)} h
          </span>
        </div>
        <ProgressBar value={goal ? done / goal : 0} color={topic.color} label={`${topic.name} progress`} />
      </div>
      {/* Once this wraps under the bar (row narrower than 420px), spread it across the row. */}
      <div className="ml-auto flex items-center gap-4 @max-[420px]:w-full @max-[420px]:justify-between">
        <div className="w-19 text-right text-body font-medium tabular-nums @max-[420px]:w-auto @max-[420px]:text-left">
          {goal === 0 ? (
            <span className="text-muted">No goal</span>
          ) : hit ? (
            <span className="inline-flex items-center gap-1 text-sage-ink">
              <Check size={15} strokeWidth={2.2} /> Done
            </span>
          ) : (
            `${formatHM(left)} left`
          )}
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={onStart}
          className={clsx('w-23', running && 'border-sage-border bg-sage text-sage-ink hover:bg-sage')}
          icon={running ? <span className="size-1.5 animate-pulse rounded-full bg-sage-dot" /> : <Play size={10} fill="currentColor" strokeWidth={0} />}
        >
          {running ? 'Running' : 'Start'}
        </Button>
      </div>
    </div>
  )
}

function DailyGoals() {
  const language = useLanguage()
  const progress = useTodayProgress()
  const startTimer = useStartTimer()
  const navigate = useNavigate()
  return (
    <Section className="flex flex-col px-6 pt-5 pb-2 @container">
      <SectionHeader title="Daily goals" action={<span className="text-small text-muted">Resets at midnight</span>} className="pb-2" />
      {progress.topics.length === 0 ? (
        <EmptyState title="No topics yet" action={<Button onClick={() => navigate('/settings')}>Add a topic</Button>}>
          Topics hold your daily goals, for example {language.name} 30 min a day.
        </EmptyState>
      ) : (
        progress.topics.map((row) => (
          <GoalRow
            key={row.topic.id}
            row={row}
            running={progress.timer?.topicId === row.topic.id && !isPaused(progress.timer)}
            onStart={() => void startTimer(row.topic.id, { leftMinutes: row.left })}
          />
        ))
      )}
    </Section>
  )
}

function TodaysSessions() {
  const { sessions } = useTodayProgress()
  const topics = useTopics(true)
  const { openLogTime } = useUI()
  const ordered = [...sessions].sort((a, b) => a.start - b.start)
  return (
    <Section className="flex flex-col px-6 pt-5 pb-2">
      <SectionHeader
        title="Today's sessions"
        className="pb-3"
        action={
          <>
            <Button variant="quiet" size="sm" className="h-auto px-0" onClick={() => openLogTime()}>
              Log time
            </Button>
            <span aria-hidden className="h-3.5 w-px bg-line-strong" />
            <Link to="/history" className="text-small text-sage-ink hover:text-ink">
              See history
            </Link>
          </>
        }
      />
      {ordered.length === 0 ? (
        <EmptyState icon={<Clock3 size={20} strokeWidth={1.6} />} title="No sessions yet today" className="border-t border-line">
          Start the timer on a goal. When you stop, the time shows up here.
        </EmptyState>
      ) : (
        ordered.map((s) => {
          const topic = topics.find((t) => t.id === s.topicId)
          return (
            <div key={s.id} className="flex items-center gap-3.5 border-t border-line py-3">
              <div className="w-24 shrink-0 text-small text-muted tabular-nums">
                {formatClock(s.start)}–{formatClock(s.end)}
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-body font-medium">{topic?.name ?? 'Deleted topic'}</span>
                {s.note && <span className="truncate text-small text-muted">{s.note}</span>}
              </div>
              <Chip tone="topic" color={topic?.color}>
                {Math.max(1, Math.round(s.minutes))} min
              </Chip>
            </div>
          )
        })
      )}
    </Section>
  )
}

function WordOfTheDay() {
  const { card, loaded } = useWordOfTheDay()
  const settings = useSettings()
  const language = useLanguage()
  const { openCardEditor } = useUI()
  if (!loaded) return <Section className="h-75" />
  if (!card) {
    return (
      <Section>
        <EmptyState title="Word of the day" action={<Button variant="soft" icon={<Plus size={16} strokeWidth={1.8} />} onClick={() => openCardEditor()}>Add card</Button>}>
          Add flashcards and a learned word will show up here every day.
        </EmptyState>
      </Section>
    )
  }
  return (
    <Section className="flex flex-col gap-3.5 p-3">
      <Link to={`/flashcards?card=${card.id}`} aria-label={`Open ${card.german}`}>
        <CardImage imageId={card.imageId} emoji={card.emoji} label={card.german} seed={card.id} alt={card.english} className="h-37.5" />
      </Link>
      <div className="flex items-start justify-between gap-3 px-2 pb-1.5">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="text-chip text-muted">Word of the day</div>
          <div className="text-[24px] font-semibold tracking-[-0.01em]">
            <CardGerman card={card} />
          </div>
          <div className="self-start text-body text-muted" dir="auto">
            {card.gender && language.native.code === 'en' ? 'the ' : ''}
            {card.english}
            {card.plural && (
              <>
                {' · plural '}
                {card.plural}
              </>
            )}
          </div>
          {card.exampleDe && (
            <div className="pt-1.5 text-body" lang={language.speech} dir="auto">
              {card.exampleDe}
            </div>
          )}
        </div>
        <Button
          variant="outline"
          iconOnly
          aria-label={`Play ${language.name} audio`}
          onClick={() => speak(germanText(card), voiceOptions(settings))}
        >
          <Volume2 size={18} strokeWidth={1.8} />
        </Button>
      </div>
    </Section>
  )
}

function TodoToday() {
  const tasks = useTasks()
  const { openTaskEditor } = useUI()
  const today = dateKey()
  const list = (tasks ?? [])
    .filter((t) => isDueToday(t, today) || t.status === 'doing' || (t.status === 'done' && t.doneAt && dateKey(t.doneAt) === today && (t.dueDate ?? '') <= today))
    .sort((a, b) => {
      const doneA = a.status === 'done' ? 1 : 0
      const doneB = b.status === 'done' ? 1 : 0
      return doneA - doneB || PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority) || (a.dueDate ?? '9').localeCompare(b.dueDate ?? '9')
    })
  return (
    <Section className="flex flex-col px-6 pt-5 pb-2">
      <SectionHeader
        title="To do today"
        className="pb-3"
        action={
          <Link to="/board" className="text-small text-sage-ink hover:text-ink">
            Open board
          </Link>
        }
      />
      {list.length === 0 ? (
        <EmptyState
          icon={<ListTodo size={20} strokeWidth={1.6} />}
          title="Nothing due today"
          className="border-t border-line"
          action={
            <Button size="sm" icon={<Plus size={15} strokeWidth={1.8} />} onClick={() => openTaskEditor({ status: 'todo', dueDate: today })}>
              Add task
            </Button>
          }
        >
          Tasks due today, overdue ones and anything in Doing appear here.
        </EmptyState>
      ) : (
        list.map((task) => {
          const done = task.status === 'done'
          const overdue = isOverdue(task, today)
          return (
            <div key={task.id} className="flex items-center gap-3 border-t border-line py-3 text-body">
              <input
                type="checkbox"
                checked={done}
                onChange={() => void toggleTaskDone(task.id)}
                aria-label={done ? `Mark "${task.title}" as not done` : `Mark "${task.title}" as done`}
                className="size-4.5 shrink-0 cursor-pointer accent-button-dark"
              />
              <button type="button" onClick={() => openTaskEditor({ taskId: task.id })} className="flex min-w-0 flex-1 flex-col text-left">
                <span className={clsx('truncate', done && 'text-muted line-through')}>{task.title}</span>
                {overdue && <span className="text-chip font-medium text-red-ink">Overdue · {formatDayMonthShort(task.dueDate!)}</span>}
              </button>
              <PriorityChip priority={task.priority} />
            </div>
          )
        })
      )}
    </Section>
  )
}

export function TodayPage() {
  const progress = useTodayProgress()
  const queue = useStudyQueue()
  const hasCards = (useCards()?.length ?? 0) > 0
  const streaks = useStreaks()
  const { openCardEditor } = useUI()
  const navigate = useNavigate()
  const mainTopic = progress.topics[0]?.topic
  const streak = mainTopic ? (streaks?.get(mainTopic.id)?.current ?? 0) : 0

  let subtitle = formatLongDate(progress.today)
  if (progress.goalCount === 0) subtitle += ' · no goals today'
  else if (progress.totalLeft === 0) subtitle += ' · every goal reached'
  else subtitle += ` · ${formatHM(progress.totalLeft)} h left to reach your goals`

  return (
    <>
      <PageHeader
        title="Today"
        subtitle={subtitle}
        actions={
          <>
            <Button variant="soft" icon={<Plus size={16} strokeWidth={1.8} />} onClick={() => openCardEditor()}>
              Add card
            </Button>
            <Button variant="primary" icon={<Play size={12} fill="currentColor" strokeWidth={0} />} onClick={() => navigate('/timer')}>
              {progress.timer ? 'Open timer' : 'Start timer'}
            </Button>
          </>
        }
      />

      <StatStrip
        items={[
          { value: `${formatHM(progress.totalDone)} h`, label: `studied of ${formatHM(progress.totalGoal)} h today` },
          {
            value: queue.total,
            label: `cards due · ${queue.newCount} new`,
            to: hasCards ? '/flashcards/review' : '/flashcards',
            title: queue.total ? 'Start reviewing' : hasCards ? 'Practise cards ahead of schedule' : 'Open flashcards',
          },
          {
            value: `${streak} ${streak === 1 ? 'day' : 'days'}`,
            label: mainTopic ? `${mainTopic.name} streak` : 'streak',
          },
        ]}
      />

      <div className="flex flex-wrap items-start gap-5">
        <div className="flex min-w-0 flex-[3_1_420px] flex-col gap-5">
          <DailyGoals />
          <TodaysSessions />
        </div>
        <div className="flex min-w-0 flex-[2_1_300px] flex-col gap-5">
          <WordOfTheDay />
          <TodoToday />
        </div>
      </div>
    </>
  )
}
