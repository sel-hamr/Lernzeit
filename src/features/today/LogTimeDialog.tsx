import { useState } from 'react'
import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { DurationInput, Field, Input, Select } from '@/components/ui/form'
import { useFeedback } from '@/components/ui/feedback'
import { useTopics } from '@/data/hooks'
import { logManualSession } from '@/data/topics'
import { dateKey, formatClock, formatMinutesShort, MINUTE, parseDateKey, parseTimeOfDay } from '@/lib/time'

/** Add study time that happened away from the timer (a class, a book, a podcast). */
export function LogTimeDialog({ request, onClose }: { request: { topicId?: string } | null; onClose: () => void }) {
  return (
    <Dialog open={!!request} onClose={onClose} title="Log study time" description="For time spent away from the timer." size="sm">
      {request && <LogTimeForm initialTopicId={request.topicId} onDone={onClose} />}
    </Dialog>
  )
}

function LogTimeForm({ initialTopicId, onDone }: { initialTopicId?: string; onDone: () => void }) {
  const topics = useTopics()
  const { toast } = useFeedback()
  const [topicId, setTopicId] = useState(initialTopicId ?? topics[0]?.id ?? '')
  const [minutes, setMinutes] = useState(30)
  const [day, setDay] = useState(() => dateKey())
  const [start, setStart] = useState(() => formatClock(Date.now() - 30 * MINUTE))
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const effectiveTopic = topicId || topics[0]?.id || ''

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!effectiveTopic || minutes <= 0) return
    setSaving(true)
    const startTs = parseDateKey(day).getTime() + parseTimeOfDay(start) * MINUTE
    await logManualSession({ topicId: effectiveTopic, start: startTs, minutes, note })
    const name = topics.find((t) => t.id === effectiveTopic)?.name ?? ''
    toast(`Logged ${formatMinutesShort(minutes)} of ${name}`)
    onDone()
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <Field label="Topic" htmlFor="log-topic">
        <Select id="log-topic" value={effectiveTopic} onChange={(e) => setTopicId(e.target.value)}>
          {topics.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Duration" htmlFor="log-duration">
        <DurationInput id="log-duration" minutes={minutes} onChange={setMinutes} max={16 * 60} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Day" htmlFor="log-day">
          <Input id="log-day" type="date" value={day} max={dateKey()} onChange={(e) => setDay(e.target.value || dateKey())} />
        </Field>
        <Field label="Started at" htmlFor="log-start">
          <Input id="log-start" type="time" value={start} onChange={(e) => setStart(e.target.value || '09:00')} />
        </Field>
      </div>
      <Field label="What did you learn?" htmlFor="log-note">
        <Input id="log-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" maxLength={200} />
      </Field>
      <div className="flex justify-end gap-2 pt-1">
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button variant="primary" type="submit" disabled={saving || !effectiveTopic || minutes <= 0}>
          Log time
        </Button>
      </div>
    </form>
  )
}
