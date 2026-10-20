import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import clsx from 'clsx'
import { ChevronDown, MessageCircleQuestionMark, Play, Plus, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { buttonClass } from '@/components/ui/buttonClass'
import { Chip, EmptyState, PageHeader, Section } from '@/components/ui/primitives'
import { useFeedback } from '@/components/ui/feedback'
import { useLanguage, useLearningText, useQuestions, useResponses } from '@/data/hooks'
import { addStarterContent } from '@/data/languages'
import type { Question } from '@/db/types'
import { groupBySet } from '@/lib/questions'
import { count } from '@/lib/text'
import { practicePath } from './paths'
import { QuestionEditorDialog } from './QuestionEditor'

function QuestionRow({ question, responses, onOpen }: { question: Question; responses: number; onOpen: () => void }) {
  const learning = useLearningText()
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full flex-wrap items-center gap-x-4 gap-y-1.5 px-5 py-3.5 text-left transition-colors hover:bg-soft"
      >
        <div className="flex min-w-0 flex-[999_1_240px] flex-col gap-0.5">
          <span {...learning} className="text-body font-medium">
            {question.question}
          </span>
          {question.english && <span className="text-small text-muted">{question.english}</span>}
        </div>
        <div className="flex flex-[1_1_auto] items-center justify-end gap-2.5">
          {responses > 0 && <span className="text-chip text-muted tabular-nums">{count(responses, 'answer')}</span>}
          {question.myAnswer ? <Chip tone="sage">Your answer</Chip> : <Chip tone="soft">No answer yet</Chip>}
        </div>
      </button>
    </li>
  )
}

export default function QuestionsPage() {
  const learning = useLearningText()
  const language = useLanguage()
  const questions = useQuestions()
  const responses = useResponses()
  const { toast } = useFeedback()
  const [editing, setEditing] = useState<{ question?: Question; set?: string } | null>(null)
  const [installing, setInstalling] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())

  const toggle = (set: string) =>
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(set)) next.delete(set)
      else next.add(set)
      return next
    })

  const groups = useMemo(() => groupBySet(questions ?? []), [questions])
  const answers = useMemo(() => {
    const byQuestion = new Map<string, number>()
    for (const r of responses ?? []) byQuestion.set(r.questionId, (byQuestion.get(r.questionId) ?? 0) + 1)
    return byQuestion
  }, [responses])

  const addStarter = async () => {
    setInstalling(true)
    try {
      const added = await addStarterContent('questions')
      toast(added ? `Added ${count(added, 'starter question')}` : 'All starter questions are already here')
    } finally {
      setInstalling(false)
    }
  }

  const total = questions?.length ?? 0
  const prepared = questions?.filter((q) => q.myAnswer).length ?? 0

  return (
    <>
      <PageHeader
        title="Questions"
        subtitle={`${count(total, 'question')} · ${prepared} with your answer`}
        actions={
          <>
            {total > 0 && (
              <Button
                variant="ghost"
                disabled={installing}
                icon={<Sparkles size={15} strokeWidth={1.8} />}
                onClick={() => void addStarter()}
                title="Adds the starter questions you do not have yet"
              >
                Starter questions
              </Button>
            )}
            <Button variant="soft" icon={<Plus size={16} strokeWidth={1.8} />} onClick={() => setEditing({})}>
              New question
            </Button>
            {total > 0 && (
              <Link to={practicePath()} className={buttonClass({ variant: 'primary' })}>
                <Play size={15} strokeWidth={1.8} />
                Practise all
              </Link>
            )}
          </>
        }
      />

      {questions && !total ? (
        <div className="rounded-section border border-line">
          <EmptyState
            icon={<MessageCircleQuestionMark size={20} strokeWidth={1.6} />}
            title="No questions yet"
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button variant="outline" disabled={installing} icon={<Sparkles size={15} strokeWidth={1.8} />} onClick={() => void addStarter()}>
                  Add starter questions
                </Button>
                <Button variant="soft" icon={<Plus size={16} strokeWidth={1.8} />} onClick={() => setEditing({})}>
                  Write a question
                </Button>
              </div>
            }
          >
            Practise answering {language.name} questions, like in the speaking part of an exam. Write your own answer once, then answer from memory and compare.
          </EmptyState>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {groups.map(({ set, questions: items }) => {
            const open = expanded.has(set)
            const withAnswer = items.filter((q) => q.myAnswer).length
            return (
              <Section key={set} className="overflow-hidden">
                <div className="flex flex-wrap items-center gap-x-6 gap-y-3 px-5 py-4">
                  <div className="flex min-w-0 flex-[999_1_220px] flex-col gap-0.5">
                    <h2 {...learning} className="text-section font-semibold">
                      {set}
                    </h2>
                    <p className="text-small text-muted tabular-nums">
                      {count(items.length, 'question')} · {withAnswer} with your answer
                    </p>
                  </div>
                  <div className="flex flex-[1_1_auto] items-center justify-between gap-2 sm:justify-end">
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-expanded={open}
                      icon={<ChevronDown size={15} strokeWidth={1.8} className={clsx('transition-transform', open && 'rotate-180')} />}
                      onClick={() => toggle(set)}
                    >
                      {open ? 'Hide questions' : 'Show questions'}
                    </Button>
                    <div className="flex gap-2">
                      <Button variant="soft" size="sm" aria-label={`Add a question to ${set}`} icon={<Plus size={15} strokeWidth={1.8} />} onClick={() => setEditing({ set })}>
                        <span className="hidden sm:inline">Add</span>
                      </Button>
                      <Link to={practicePath(set)} className={buttonClass({ variant: 'primary', size: 'sm' })}>
                        <Play size={14} strokeWidth={1.8} />
                        Practise
                      </Link>
                    </div>
                  </div>
                </div>
                {open && (
                  <ul className="animate-fade-in divide-y divide-line border-t border-line">
                    {items.map((q) => (
                      <QuestionRow key={q.id} question={q} responses={answers.get(q.id) ?? 0} onOpen={() => setEditing({ question: q })} />
                    ))}
                  </ul>
                )}
              </Section>
            )
          })}
        </div>
      )}

      <QuestionEditorDialog open={!!editing} question={editing?.question} set={editing?.set} onClose={() => setEditing(null)} />
    </>
  )
}
