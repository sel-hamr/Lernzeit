import { useId, useMemo, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select, Textarea } from '@/components/ui/form'
import { useFeedback } from '@/components/ui/feedback'
import { useLanguage, useLearningText, useQuestions } from '@/data/hooks'
import { DEFAULT_SET, deleteQuestion, parseWords, saveQuestion } from '@/data/questions'
import { parseLevel, STORY_LEVELS } from '@/data/stories'
import type { Question } from '@/db/types'
import { groupBySet } from '@/lib/questions'

interface EditorProps {
  open: boolean
  question?: Question
  /** A new question starts in this set. */
  set?: string
  onClose: () => void
  onDeleted?: () => void
}

/** Adds a question, or edits `question`. */
export function QuestionEditorDialog(props: EditorProps) {
  // A fresh form each time it opens, so a closed draft never comes back.
  return <QuestionEditor key={props.open ? (props.question?.id ?? 'new') : 'closed'} {...props} />
}

function QuestionEditor({ open, question, set: startSet, onClose, onDeleted }: EditorProps) {
  const learning = useLearningText()
  const language = useLanguage()
  const de = language.code === 'de'
  const questions = useQuestions()
  const { toast, confirm } = useFeedback()
  const formId = useId()
  const setsId = useId()
  const [text, setText] = useState(question?.question ?? '')
  const [english, setEnglish] = useState(question?.english ?? '')
  const [myAnswer, setMyAnswer] = useState(question?.myAnswer ?? '')
  const [suggested, setSuggested] = useState(question?.suggested ?? '')
  const [words, setWords] = useState(question?.words?.join(', ') ?? '')
  const [set, setSet] = useState(question?.set ?? startSet ?? '')
  const [level, setLevel] = useState<string>(question?.level ?? '')
  const [saving, setSaving] = useState(false)

  const sets = useMemo(() => groupBySet(questions ?? []).map((g) => g.set), [questions])
  const ready = !!text.trim() && !saving

  const save = async () => {
    if (!ready) return
    setSaving(true)
    try {
      await saveQuestion(
        { question: text, english, myAnswer, suggested, words: parseWords(words), set, level: parseLevel(level), tags: question?.tags ?? [] },
        question?.id,
      )
      toast(question ? 'Question saved' : 'Question added')
      onClose()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not save the question', { tone: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!question) return
    const ok = await confirm({ title: 'Delete this question?', body: 'Your old responses to it are deleted too.', confirmLabel: 'Delete', danger: true })
    if (!ok) return
    await deleteQuestion(question.id)
    toast('Question deleted')
    onClose()
    onDeleted?.()
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={question ? 'Edit question' : 'New question'}
      size="lg"
      footer={
        <>
          {question && (
            <Button variant="ghost" className="mr-auto text-red-ink hover:text-red-ink" icon={<Trash2 size={15} strokeWidth={1.8} />} onClick={() => void remove()}>
              Delete
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form={formId} disabled={!ready}>
            {question ? 'Save changes' : 'Add question'}
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
        <Field label="Question" htmlFor="question-text">
          <Input id="question-text" value={text} onChange={(e) => setText(e.target.value)} placeholder={de ? 'Was ist dein Beruf?' : undefined} autoComplete="off" {...learning} autoFocus={!question} />
        </Field>
        <Field label={`${language.native.name} (optional)`} htmlFor="question-english">
          <Input
            id="question-english"
            value={english}
            onChange={(e) => setEnglish(e.target.value)}
            placeholder={language.native.code === 'en' ? 'What is your job?' : undefined}
            autoComplete="off"
            dir="auto"
          />
        </Field>
        <Field label="Your answer" htmlFor="question-mine" hint="Your real answer, about your life. This is the one you practise.">
          <Textarea id="question-mine" rows={2} value={myAnswer} onChange={(e) => setMyAnswer(e.target.value)} placeholder={de ? 'Ich bin Softwareentwickler.' : undefined} {...learning} />
        </Field>
        <Field label="Suggested answer (optional)" htmlFor="question-suggested" hint="An example answer that shows the sentence pattern.">
          <Textarea id="question-suggested" rows={2} value={suggested} onChange={(e) => setSuggested(e.target.value)} placeholder={de ? 'Ich arbeite als Lehrerin.' : undefined} {...learning} />
        </Field>
        <Field label="Useful words (optional)" htmlFor="question-words" hint="Separate them with commas. Practice offers them as hints, with the words of your answer.">
          <Input id="question-words" value={words} onChange={(e) => setWords(e.target.value)} placeholder={de ? 'Lehrer, die Ärztin, arbeiten als' : undefined} autoComplete="off" {...learning} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Set" htmlFor="question-set">
            <Input id="question-set" list={setsId} value={set} onChange={(e) => setSet(e.target.value)} placeholder={DEFAULT_SET} autoComplete="off" />
            <datalist id={setsId}>
              {sets.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </Field>
          <Field label="Level" htmlFor="question-level">
            <Select id="question-level" value={level} onChange={(e) => setLevel(e.target.value)}>
              <option value="">No level</option>
              {STORY_LEVELS.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </form>
    </Dialog>
  )
}
