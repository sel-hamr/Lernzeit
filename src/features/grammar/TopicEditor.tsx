import { useId, useMemo, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select, Textarea } from '@/components/ui/form'
import { useFeedback } from '@/components/ui/feedback'
import { DEFAULT_GROUP, deleteTopic, saveTopic } from '@/data/grammar'
import { useGrammarTopics, useLanguage, useLearningText } from '@/data/hooks'
import { parseLevel, STORY_LEVELS } from '@/data/stories'
import { newId } from '@/db/db'
import type { GrammarTopic, TopicDrill } from '@/db/types'
import { exerciseProblem, formatLines, groupTopics, mergeExercises, parseLines } from '@/lib/grammar'

/** The card drills a topic can add, as select values. */
const DRILLS: { value: string; label: string; drill?: TopicDrill }[] = [
  { value: '', label: 'No, only this topic’s exercises' },
  { value: 'gender', label: 'der / die / das of my nouns', drill: { kind: 'gender' } },
  { value: 'plural', label: 'Plurals of my nouns', drill: { kind: 'plural' } },
  { value: 'verbs', label: 'My verbs, every tense', drill: { kind: 'verbs' } },
  { value: 'verbs:present', label: 'My verbs, present', drill: { kind: 'verbs', tense: 'present' } },
  { value: 'verbs:past', label: 'My verbs, past', drill: { kind: 'verbs', tense: 'past' } },
  { value: 'verbs:perfect', label: 'My verbs, perfect', drill: { kind: 'verbs', tense: 'perfect' } },
]

function drillValue(drill?: TopicDrill): string {
  return drill ? [drill.kind, drill.tense].filter(Boolean).join(':') : ''
}

interface EditorProps {
  open: boolean
  topic?: GrammarTopic
  onClose: () => void
  /** After a new topic is saved. */
  onCreated?: (topic: GrammarTopic) => void
  onDeleted?: () => void
}

/** Adds a grammar topic, or edits `topic`. */
export function TopicEditorDialog(props: EditorProps) {
  // A fresh form each time it opens, so a closed draft never comes back.
  return <TopicEditor key={props.open ? (props.topic?.id ?? 'new') : 'closed'} {...props} />
}

function TopicEditor({ open, topic, onClose, onCreated, onDeleted }: EditorProps) {
  const learning = useLearningText()
  const language = useLanguage()
  const de = language.code === 'de'
  const topics = useGrammarTopics()
  const { toast, confirm } = useFeedback()
  const formId = useId()
  const groupsId = useId()
  const [title, setTitle] = useState(topic?.title ?? '')
  const [english, setEnglish] = useState(topic?.english ?? '')
  const [group, setGroup] = useState(topic?.group ?? '')
  const [level, setLevel] = useState<string>(topic?.level ?? '')
  const [summary, setSummary] = useState(topic?.summary ?? '')
  const [rule, setRule] = useState(topic?.rule ?? '')
  const [examples, setExamples] = useState(formatLines(topic?.examples ?? []))
  const [exercises, setExercises] = useState(formatLines(topic?.exercises ?? []))
  const [drill, setDrill] = useState(drillValue(topic?.drill))
  const [saving, setSaving] = useState(false)

  const groups = useMemo(() => groupTopics(topics ?? []).map((g) => g.group), [topics])
  const exerciseError = useMemo(() => {
    const lines = parseLines(exercises)
    const bad = lines.findIndex((l) => exerciseProblem(l.de))
    return bad < 0 ? undefined : `Line ${bad + 1}: ${exerciseProblem(lines[bad].de)}`
  }, [exercises])
  const ready = !!title.trim() && !exerciseError && !saving

  const save = async () => {
    if (!ready) return
    setSaving(true)
    try {
      const saved = await saveTopic(
        {
          title,
          english,
          group,
          level: parseLevel(level),
          summary,
          rule,
          examples: parseLines(examples),
          exercises: mergeExercises(topic?.exercises ?? [], parseLines(exercises), newId),
          drill: DRILLS.find((d) => d.value === drill)?.drill,
        },
        topic?.id,
      )
      toast(topic ? 'Topic saved' : 'Topic added')
      onClose()
      if (!topic) onCreated?.(saved)
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not save the topic', { tone: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!topic) return
    const ok = await confirm({ title: 'Delete this topic?', body: 'Its exercises and their scores are deleted too.', confirmLabel: 'Delete', danger: true })
    if (!ok) return
    await deleteTopic(topic.id)
    toast('Topic deleted')
    onClose()
    onDeleted?.()
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={topic ? 'Edit topic' : 'New topic'}
      size="lg"
      footer={
        <>
          {topic && (
            <Button variant="ghost" className="mr-auto text-red-ink hover:text-red-ink" icon={<Trash2 size={15} strokeWidth={1.8} />} onClick={() => void remove()}>
              Delete
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form={formId} disabled={!ready}>
            {topic ? 'Save changes' : 'Add topic'}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
        className="flex flex-col gap-5"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Title" htmlFor="topic-title">
            <Input id="topic-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={de ? 'Der Dativ' : undefined} autoComplete="off" {...learning} autoFocus={!topic} />
          </Field>
          <Field label={`${language.native.name} (optional)`} htmlFor="topic-english">
            <Input
              id="topic-english"
              value={english}
              onChange={(e) => setEnglish(e.target.value)}
              placeholder={de && language.native.code === 'en' ? 'The dative case' : undefined}
              autoComplete="off"
              dir="auto"
            />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Section" htmlFor="topic-group">
            <Input id="topic-group" list={groupsId} value={group} onChange={(e) => setGroup(e.target.value)} placeholder={DEFAULT_GROUP} autoComplete="off" />
            <datalist id={groupsId}>
              {groups.map((g) => (
                <option key={g} value={g} />
              ))}
            </datalist>
          </Field>
          <Field label="Level" htmlFor="topic-level">
            <Select id="topic-level" value={level} onChange={(e) => setLevel(e.target.value)}>
              <option value="">No level</option>
              {STORY_LEVELS.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Summary (optional)" htmlFor="topic-summary" hint="One line under the title.">
          <Input id="topic-summary" value={summary} onChange={(e) => setSummary(e.target.value)} placeholder={de ? 'To whom? dem, der, dem, den.' : undefined} autoComplete="off" dir="auto" />
        </Field>
        <Field
          label="Rule"
          htmlFor="topic-rule"
          hint="A blank line starts a new paragraph. Lines starting with - make a list, lines like | a | b | a table, ### a heading. **bold**, *italic*."
        >
          <Textarea id="topic-rule" rows={8} value={rule} onChange={(e) => setRule(e.target.value)} placeholder={de ? 'The dative answers *Wem?*\n\n| | masculine | feminine |\n|---|---|---|\n| Dativ | dem | der |' : undefined}
            dir="auto"
          />
        </Field>
        <Field label="Examples" htmlFor="topic-examples" hint={`One per line: ${language.name} = ${language.native.name}. The ${language.native.name} is optional.`}>
          <Textarea id="topic-examples" rows={4} value={examples} onChange={(e) => setExamples(e.target.value)} placeholder={de ? 'Ich helfe dem Mann. = I help the man.' : undefined} {...learning} />
        </Field>
        <Field
          label="Exercises"
          htmlFor="topic-exercises"
          error={exerciseError}
          hint={
            <>
              One per line, then <code>= {language.native.name}</code> and <code>{'// why'}</code> if you like. Fill the gap: <code>{'{{dem}}'}</code> typed, <code>{'{{dem|den|der}}'}</code> choices, the first
              one right. Find the mistake: <code>{'{{den>dem}}'}</code>. Word order: start with <code>~</code>. Write a sentence: <code>{'prompt => answer'}</code>.
            </>
          }
        >
          <Textarea
            id="topic-exercises"
            rows={8}
            value={exercises}
            onChange={(e) => setExercises(e.target.value)}
            placeholder={[
              'Ich helfe {{dem|den|der}} Mann. = I help the man. // helfen takes the dative.',
              'Ich danke {{den>dem}} Arzt. = I thank the doctor. // danken takes the dative.',
              '~ Ich gebe dem Mann das Buch. = I give the man the book.',
              'die Kinder: Ich helfe … => Ich helfe den Kindern.',
            ].join('\n')}
            aria-invalid={!!exerciseError}
            {...learning}
          />
        </Field>
        {/* The card drills ask German genders, plurals and verb tables. */}
        {(de || drill) && (
          <Field label="Also practise with my cards" htmlFor="topic-drill" hint="Adds questions about your own words to this topic's practice.">
            <Select id="topic-drill" value={drill} onChange={(e) => setDrill(e.target.value)}>
              {DRILLS.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </Select>
          </Field>
        )}
      </form>
    </Dialog>
  )
}
