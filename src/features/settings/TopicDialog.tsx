import { useState } from 'react'
import clsx from 'clsx'
import { Archive, Check, Trash2 } from 'lucide-react'
import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { DurationInput, Field, Input, Switch } from '@/components/ui/form'
import { useFeedback } from '@/components/ui/feedback'
import type { Topic, TopicColor, WeekGoals } from '@/db/types'
import { createTopic, deleteTopic, updateTopic } from '@/data/topics'
import { useTopics } from '@/data/hooks'
import { nextTopicColor, TOPIC_COLOR_NAME, TOPIC_COLORS, topicVars } from '@/lib/colors'
import { uniformGoals } from '@/lib/goals'
import { WEEKDAY_LONG, WEEKDAYS } from '@/lib/time'

export function TopicDialog({ topicId, open, onClose }: { topicId: string | null; open: boolean; onClose: () => void }) {
  const topics = useTopics(true)
  const topic = topicId ? topics.find((t) => t.id === topicId) : undefined
  return (
    <Dialog open={open} onClose={onClose} title={topic ? 'Edit topic' : 'New topic'} description="A topic has a colour and a daily goal.">
      {open && (!topicId || topic) && <TopicForm key={topicId ?? 'new'} topic={topic} usedColors={topics.map((t) => t.color)} onDone={onClose} />}
    </Dialog>
  )
}

function TopicForm({ topic, usedColors, onDone }: { topic?: Topic; usedColors: TopicColor[]; onDone: () => void }) {
  const { toast, confirm } = useFeedback()
  const [name, setName] = useState(topic?.name ?? '')
  const [color, setColor] = useState<TopicColor>(topic?.color ?? nextTopicColor(usedColors))
  const [goals, setGoals] = useState<WeekGoals>(topic?.goalMinutes ?? uniformGoals(60))
  const [perDay, setPerDay] = useState(() => (topic ? new Set(Object.values(topic.goalMinutes)).size > 1 : false))
  const [error, setError] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      setError('Give the topic a name')
      return
    }
    const finalGoals = perDay ? goals : uniformGoals(goals.mon)
    if (topic) await updateTopic(topic.id, { name, color, goals: finalGoals })
    else await createTopic({ name, color, goals: finalGoals })
    toast(topic ? 'Topic saved' : 'Topic added')
    onDone()
  }

  const archive = async () => {
    if (!topic) return
    await updateTopic(topic.id, { archived: !topic.archived })
    toast(topic.archived ? 'Topic restored' : 'Topic archived. Its history is kept.')
    onDone()
  }

  const remove = async () => {
    if (!topic) return
    const ok = await confirm({
      title: `Delete “${topic.name}”?`,
      body: 'All of its study sessions are deleted too. To keep the history, archive the topic instead.',
      confirmLabel: 'Delete topic',
      danger: true,
    })
    if (!ok) return
    await deleteTopic(topic.id)
    toast('Topic deleted')
    onDone()
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <Field label="Name" htmlFor="topic-name" error={error}>
        <Input
          id="topic-name"
          autoFocus={!topic}
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            setError('')
          }}
          placeholder="German"
          maxLength={40}
        />
      </Field>
      <Field label="Colour">
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Colour">
          {TOPIC_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={color === c}
              aria-label={TOPIC_COLOR_NAME[c]}
              title={TOPIC_COLOR_NAME[c]}
              onClick={() => setColor(c)}
              style={topicVars(c)}
              className={clsx(
                'flex size-9 items-center justify-center rounded-full border-2 bg-(--t-soft) transition-transform hover:scale-105',
                color === c ? 'border-(--t-dot)' : 'border-transparent',
              )}
            >
              <span className="flex size-4 items-center justify-center rounded-full bg-(--t-dot)">{color === c && <Check size={11} strokeWidth={3} className="text-main" />}</span>
            </button>
          ))}
        </div>
      </Field>
      <div className="flex flex-col gap-3 rounded-row bg-field px-4 py-3.5">
        <Switch label="Different goal per weekday" description="For example more German on Saturdays." checked={perDay} onChange={setPerDay} />
        {perDay ? (
          <div className="flex flex-col gap-2 pt-1">
            {WEEKDAYS.map((d) => (
              <div key={d} className="flex items-center justify-between gap-3">
                <span className="text-body">{WEEKDAY_LONG[d]}</span>
                <DurationInput minutes={goals[d]} onChange={(m) => setGoals((g) => ({ ...g, [d]: m }))} />
              </div>
            ))}
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3 pt-1">
            <span className="text-body">Every day</span>
            <DurationInput minutes={goals.mon} onChange={(m) => setGoals(uniformGoals(m))} />
          </div>
        )}
      </div>
      {topic && <p className="-mt-2 text-chip text-muted">Goal changes apply from today. Past days keep the goal they had.</p>}
      <div className="flex flex-wrap items-center gap-2">
        {topic && (
          <>
            <Button variant="ghost" icon={<Archive size={15} strokeWidth={1.8} />} onClick={() => void archive()}>
              {topic.archived ? 'Restore' : 'Archive'}
            </Button>
            <Button variant="ghost" iconOnly aria-label="Delete topic" className="text-red-ink hover:text-red-ink" onClick={() => void remove()}>
              <Trash2 size={16} strokeWidth={1.8} />
            </Button>
          </>
        )}
        <div className="ml-auto flex gap-2">
          <Button variant="ghost" onClick={onDone}>
            Cancel
          </Button>
          <Button variant="primary" type="submit">
            {topic ? 'Save' : 'Add topic'}
          </Button>
        </div>
      </div>
    </form>
  )
}
