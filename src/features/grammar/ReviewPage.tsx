import { useMemo, useState } from 'react'
import { useCards, useExerciseStats, useGrammarTopics } from '@/data/hooks'
import { buildReviewRound } from '@/lib/grammar'
import { Round } from './Round'

/** Today's review: the exercises from every topic that are due again. */
export default function ReviewPage() {
  const topics = useGrammarTopics()
  const stats = useExerciseStats()
  const cards = useCards()
  const [round, setRound] = useState(0)
  const topicsById = useMemo(() => new Map((topics ?? []).map((t) => [t.id, t])), [topics])
  const cardsById = useMemo(() => new Map((cards ?? []).map((c) => [c.id, c])), [cards])

  if (!topics || !stats || !cards) return <div className="h-60" aria-busy="true" />
  return (
    <Round
      key={round}
      title="Review"
      exit="/grammar"
      exitLabel="Grammar"
      initial={() => buildReviewRound(topics, stats, Date.now())}
      topics={topicsById}
      cards={cardsById}
      showTopic
      timeId="review"
      timeTitle="Review"
      empty={{
        title: 'Nothing to review right now',
        body: 'Exercises you have practised come back here: soon after a mistake, and days later after right answers.',
      }}
      onAgain={() => setRound((r) => r + 1)}
    />
  )
}
