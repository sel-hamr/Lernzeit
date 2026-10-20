import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router'
import { EmptyState, ProgressBar } from '@/components/ui/primitives'
import { useCards, useDrillStats, useExerciseStats, useGrammarTopic, useLearningText } from '@/data/hooks'
import type { Card, DrillStat, ExerciseStat, GrammarTopic } from '@/db/types'
import { buildTopicRound, topicProgress } from '@/lib/grammar'
import { topicPath } from './paths'
import { Round } from './Round'

/** A practice round of one topic: its exercises, and your words when it links a card drill. */
export default function PracticePage() {
  const { topicId } = useParams()
  const topic = useGrammarTopic(topicId)
  const cards = useCards()
  const drillStats = useDrillStats()
  const exerciseStats = useExerciseStats()
  const [round, setRound] = useState(0)

  if (topic === null) {
    return (
      <div className="rounded-flash border border-line bg-main">
        <EmptyState
          title="This topic does not exist"
          action={
            <Link to="/grammar" className="font-medium text-sage-ink hover:text-ink">
              Back to grammar
            </Link>
          }
        />
      </div>
    )
  }
  if (!topic || !cards || !drillStats || !exerciseStats) return <div className="h-60" aria-busy="true" />
  return (
    <TopicRound
      // A new round picks again, with the answers just given.
      key={`${topic.id}:${round}`}
      topic={topic}
      cards={cards}
      drillStats={drillStats}
      exerciseStats={exerciseStats}
      onAgain={() => setRound((r) => r + 1)}
    />
  )
}

function TopicRound({
  topic,
  cards,
  drillStats,
  exerciseStats,
  onAgain,
}: {
  topic: GrammarTopic
  cards: Card[]
  drillStats: DrillStat[]
  exerciseStats: ExerciseStat[]
  onAgain: () => void
}) {
  const learning = useLearningText()
  // How much of the topic you knew when the round started, to show how far it moved.
  const [before] = useState(() => topicProgress(topic, new Map(exerciseStats.map((s) => [s.id, s]))))
  const after = useMemo(() => topicProgress(topic, new Map(exerciseStats.map((s) => [s.id, s]))), [topic, exerciseStats])
  const cardsById = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards])
  const topics = useMemo(() => new Map([[topic.id, topic]]), [topic])

  return (
    <Round
      title={topic.title}
      exit={topicPath(topic.id)}
      exitLabel="Back to the topic"
      initial={() => buildTopicRound({ topic, exerciseStats: new Map(exerciseStats.map((s) => [s.id, s])), cards, drillStats })}
      topics={topics}
      cards={cardsById}
      timeId={topic.id}
      timeTitle={topic.title}
      empty={{ title: 'Nothing to practise here', body: 'This topic has no exercises yet. Add some in the editor.' }}
      summary={
        after.total > 0 && (
          <div className="flex w-full max-w-sm flex-col gap-2 text-left">
            <div className="flex items-baseline justify-between gap-3 text-small">
              <span {...learning} className="font-medium">
                {topic.title}
              </span>
              <span className="text-muted tabular-nums">
                {Math.round(before.share * 100)}% → <span className="font-semibold text-ink">{Math.round(after.share * 100)}%</span> known
              </span>
            </div>
            <ProgressBar value={after.share} color="sage" label={`${topic.title}: how much you know`} />
            {after.status === 'mastered' && before.status !== 'mastered' && <p className="text-small font-medium text-sage-ink">Mastered. The review keeps it fresh from now on.</p>}
          </div>
        )
      }
      onAgain={onAgain}
    />
  )
}
