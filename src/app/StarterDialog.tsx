import { useState, type FormEvent, type ReactNode } from 'react'
import clsx from 'clsx'
import { useLiveQuery } from 'dexie-react-hooks'
import { Check, Cpu, Languages, Plus, Shapes } from 'lucide-react'
import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { DurationInput, Input, Segmented } from '@/components/ui/form'
import { useFeedback } from '@/components/ui/feedback'
import type { TopicColor } from '@/db/types'
import { GERMAN_SUMMARY, loadStarterFile, setUpLernzeit, shouldOfferStarter, startEmpty } from '@/data/starter'
import { nextTopicColor, topicVars } from '@/lib/colors'
import { formatMinutesShort } from '@/lib/time'
import { count } from '@/lib/text'

const GERMAN = 'German'

interface Choice {
  name: string
  color: TopicColor
  description: string
  icon: ReactNode
}

const PRESETS: Choice[] = [
  {
    name: GERMAN,
    color: 'sage',
    description: `Ready to practise: ${count(GERMAN_SUMMARY.cards, 'word and phrase', 'words and phrases')} in ${GERMAN_SUMMARY.decks} decks, ${GERMAN_SUMMARY.stories} short stories, ${GERMAN_SUMMARY.questions} speaking questions and ${GERMAN_SUMMARY.grammar} grammar topics.`,
    icon: <Languages size={18} strokeWidth={1.7} />,
  },
  {
    name: 'AI',
    color: 'blue',
    description: 'Courses, papers and projects. Track your study time with a daily goal.',
    icon: <Cpu size={18} strokeWidth={1.7} />,
  },
]

const PRESET_MINUTES = [15, 30, 45, 60, 90]
const DEFAULT_MINUTES = 30
const CUSTOM = 'custom'

/**
 * The first visit of a browser with no data: what you want to learn, then
 * how long a day. Closing it without an answer asks again next visit.
 */
export function StarterDialog() {
  const offer = useLiveQuery(() => shouldOfferStarter(), [], false)
  const [dismissed, setDismissed] = useState(false)
  const [busy, setBusy] = useState(false)
  const open = offer && !dismissed
  return (
    // The dialog stays mounted, so it can animate; the steps start fresh each time it opens.
    <WelcomeSteps key={String(open)} open={open} busy={busy} setBusy={setBusy} onDismiss={() => setDismissed(true)} />
  )
}

function WelcomeSteps({ open, busy, setBusy, onDismiss }: { open: boolean; busy: boolean; setBusy: (busy: boolean) => void; onDismiss: () => void }) {
  const { toast } = useFeedback()
  const [step, setStep] = useState<1 | 2>(1)
  const [choices, setChoices] = useState<Choice[]>(PRESETS)
  const [picked, setPicked] = useState<string[]>([])
  const [custom, setCustom] = useState('')
  const [minutes, setMinutes] = useState<Record<string, number>>({})
  /** Topics whose goal is typed in rather than picked. */
  const [customGoals, setCustomGoals] = useState<string[]>([])
  const goalOf = (name: string) => minutes[name] ?? DEFAULT_MINUTES

  const selected = choices.filter((c) => picked.includes(c.name))
  const total = selected.reduce((sum, c) => sum + goalOf(c.name), 0)

  const pickGoal = (name: string, value: string) => {
    if (value === CUSTOM) {
      setCustomGoals((all) => (all.includes(name) ? all : [...all, name]))
      return
    }
    setCustomGoals((all) => all.filter((n) => n !== name))
    setMinutes((all) => ({ ...all, [name]: Number(value) }))
  }

  const toggle = (name: string) => setPicked((p) => (p.includes(name) ? p.filter((n) => n !== name) : [...p, name]))

  const addCustom = (e: FormEvent) => {
    e.preventDefault()
    const name = custom.trim()
    if (!name) return
    const same = choices.find((c) => c.name.toLowerCase() === name.toLowerCase())
    if (same) {
      if (!picked.includes(same.name)) toggle(same.name)
    } else {
      const choice: Choice = {
        name,
        color: nextTopicColor(choices.map((c) => c.color)),
        description: 'Your own topic, with a daily goal. Add cards and notes for it any time.',
        icon: <Shapes size={18} strokeWidth={1.7} />,
      }
      setChoices((c) => [...c, choice])
      setPicked((p) => [...p, name])
    }
    setCustom('')
  }

  const finish = async () => {
    setBusy(true)
    try {
      const german = picked.includes(GERMAN) ? await loadStarterFile() : undefined
      const result = await setUpLernzeit(
        selected.map((c) => ({ name: c.name, color: c.color, minutes: goalOf(c.name) })),
        german,
      )
      toast(
        german
          ? `German is ready: ${count(result.cards, 'card')}, ${count(result.stories, 'story', 'stories')}, ${count(result.questions, 'question')} and ${count(result.grammar, 'grammar topic')}`
          : `Your daily goals are set: ${formatMinutesShort(total)} a day`,
      )
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not set up Lernzeit', { tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const skip = async () => {
    try {
      await startEmpty()
    } catch (err) {
      console.error('Saving the choice failed', err)
      onDismiss()
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onDismiss}
      locked={busy}
      title={step === 1 ? 'What do you want to learn?' : 'How much time a day?'}
      description={
        step === 1
          ? 'Pick one or more. Each gets a daily goal, and German comes with everything ready to practise.'
          : 'Minutes a day for each topic. Today shows how far you are, and you can change it any time in Settings.'
      }
      footer={
        step === 1 ? (
          <>
            <span className="mr-auto text-chip text-muted">Step 1 of 2</span>
            <Button variant="ghost" onClick={() => void skip()}>
              Start empty
            </Button>
            <Button variant="primary" disabled={!selected.length} onClick={() => setStep(2)}>
              Continue
            </Button>
          </>
        ) : (
          <>
            <span className="mr-auto text-chip text-muted">Step 2 of 2</span>
            <Button variant="ghost" disabled={busy} onClick={() => setStep(1)}>
              Back
            </Button>
            <Button variant="primary" disabled={busy} onClick={() => void finish()}>
              {busy ? (picked.includes(GERMAN) ? 'Adding German…' : 'Setting up…') : 'Start learning'}
            </Button>
          </>
        )
      }
    >
      {step === 1 ? (
        <div className="flex flex-col gap-2.5 pt-1">
          {choices.map((choice) => (
            <ChoiceRow key={choice.name} choice={choice} selected={picked.includes(choice.name)} onToggle={() => toggle(choice.name)} />
          ))}
          <form onSubmit={addCustom} className="flex gap-2 pt-1">
            <Input
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              placeholder="Something else, like Spanish or Piano"
              aria-label="Your own topic"
              maxLength={40}
              className="min-w-0 flex-1"
            />
            <Button type="submit" variant="outline" icon={<Plus size={15} strokeWidth={1.8} />} disabled={!custom.trim()}>
              Add
            </Button>
          </form>
        </div>
      ) : (
        <div className="flex flex-col pt-1">
          {selected.map((choice) => (
            <div key={choice.name} className="flex flex-col gap-2 border-t border-line py-3 first:border-t-0">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <span className="flex items-center gap-2.5 font-medium" style={topicVars(choice.color)}>
                  <span aria-hidden className="size-2.5 rounded-full bg-(--t-dot)" />
                  {choice.name}
                </span>
                <Segmented
                  label={`Daily goal for ${choice.name}`}
                  size="sm"
                  // Bare numbers, so all six fit on a phone; the description and the total say they are minutes.
                  options={[...PRESET_MINUTES.map((m) => ({ value: String(m), label: String(m) })), { value: CUSTOM, label: 'Custom' }]}
                  value={customGoals.includes(choice.name) || !PRESET_MINUTES.includes(goalOf(choice.name)) ? CUSTOM : String(goalOf(choice.name))}
                  onChange={(value) => pickGoal(choice.name, value)}
                />
              </div>
              {customGoals.includes(choice.name) && (
                <div className="flex items-center justify-between gap-3 sm:justify-end">
                  <span className="text-small text-muted">Your daily goal</span>
                  <DurationInput minutes={goalOf(choice.name)} onChange={(m) => setMinutes((all) => ({ ...all, [choice.name]: m }))} max={12 * 60} />
                </div>
              )}
            </div>
          ))}
          <p className="border-t border-line pt-3 text-small text-muted" aria-live="polite">
            {formatMinutesShort(total)} a day in total
          </p>
        </div>
      )}
    </Dialog>
  )
}

function ChoiceRow({ choice, selected, onToggle }: { choice: Choice; selected: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onToggle}
      style={topicVars(choice.color)}
      className={clsx(
        'flex items-start gap-3 rounded-row border px-4 py-3.5 text-left transition-colors duration-150',
        selected ? 'border-(--t-border) bg-(--t-soft)' : 'border-line hover:bg-field',
      )}
    >
      <span className={clsx('mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full', selected ? 'bg-main text-(--t-ink)' : 'bg-field text-ink-2')}>
        {choice.icon}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="font-medium">{choice.name}</span>
        <span className="text-small text-muted">{choice.description}</span>
      </span>
      <span
        aria-hidden
        className={clsx(
          'mt-2 flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors',
          selected ? 'border-transparent bg-(--t-ink) text-main' : 'border-line-strong bg-main',
        )}
      >
        {selected && <Check size={12} strokeWidth={2.6} />}
      </span>
    </button>
  )
}
