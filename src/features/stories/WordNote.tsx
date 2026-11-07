import type { ReactNode } from 'react'
import clsx from 'clsx'
import { Lightbulb, Volume2 } from 'lucide-react'
import { useLanguage, useLearningText, useNativeText } from '@/data/hooks'
import { Inline } from '@/features/grammar/RuleText'
import { GENDER_LABEL } from '@/lib/german'
import { lookupKey } from '@/lib/reader'
import { baseFormText, type StoryWordMatch } from '@/lib/storyWords'

function Speaker({ label, size, onClick }: { label: string; size: 'md' | 'sm'; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title="Listen"
      className={clsx(
        'flex shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:text-ink',
        size === 'md' ? 'size-8 bg-field hover:bg-line' : 'size-7 hover:bg-field',
      )}
    >
      <Volume2 size={size === 'md' ? 16 : 14} strokeWidth={1.8} />
    </button>
  )
}

/** The AI's teaching note on a tapped word: the word on one side, why it has this form on the other. */
export function WordNote({ word, match, onSpeak, children }: { word: string; match: StoryWordMatch; onSpeak: (text: string) => void; children?: ReactNode }) {
  const learning = useLearningText()
  const nativeText = useNativeText()
  const language = useLanguage()
  const { note, here } = match
  // A split verb reads and sounds as one: "steigt ... ein".
  const parts = here && note.alsoTap?.length ? [note.word, ...note.alsoTap] : [word]
  const kind = [note.partOfSpeech, note.gender && GENDER_LABEL[note.gender]].filter(Boolean).join(', ')
  const isBaseForm = lookupKey(note.baseForm) === lookupKey(word)
  const grammar = here ? note.grammar : undefined

  return (
    <article className={clsx('grid', grammar && 'sm:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]')}>
      {/* The two parts arrive just after the box, one after the other. */}
      <div className="flex min-w-0 animate-note-part flex-col gap-3 p-5 [animation-delay:40ms]">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-start justify-between gap-2">
            <h3 {...learning} className="min-w-0 text-[24px] leading-tight font-semibold tracking-[-0.02em] break-words">
              {parts.join(' … ')}
            </h3>
            <Speaker label={`Play ${language.name} audio`} size="md" onClick={() => onSpeak(parts.join(' '))} />
          </div>
          <p {...nativeText} className="text-section leading-snug font-medium text-sage-ink">
            {note.translation}
          </p>
          <p className="text-chip text-muted">
            {kind}
            {!isBaseForm && (
              <>
                {' · '}
                <span {...learning}>{baseFormText(note)}</span>
              </>
            )}
          </p>
        </div>

        {note.meaning && (
          <p {...nativeText} className="text-body text-pretty text-ink-2">
            <Inline text={note.meaning} />
          </p>
        )}
        {/* Only grammar belongs to one sentence: a short note is as true for this one. */}
        {!here && note.grammar && <p className="text-chip text-muted">From another sentence in this story.</p>}

        {note.tip && (
          <p className="mt-auto flex items-start gap-1.5 text-chip text-pretty text-muted">
            <Lightbulb size={13} strokeWidth={1.8} aria-hidden className="mt-px shrink-0" />
            <span {...nativeText}>
              <Inline text={note.tip} />
            </span>
          </p>
        )}
        {children}
      </div>

      {grammar && (
        <section className="flex min-w-0 animate-note-part flex-col gap-2 border-t border-line bg-field/50 p-5 [animation-delay:90ms] sm:border-t-0 sm:border-l">
          <h4 className="text-chip font-medium text-muted">Why this form?</h4>
          <div {...nativeText} className="flex flex-col gap-1.5 text-pretty">
            <p className="text-body leading-snug font-medium text-ink">
              <Inline text={grammar.rule} />
            </p>
            <p className="text-small text-ink-2">
              <Inline text={grammar.why} />
            </p>
          </div>
          <div className="mt-auto flex items-center justify-between gap-2 border-t border-line pt-2.5">
            <div className="flex min-w-0 flex-col">
              <p {...learning} className="text-small font-medium">
                {grammar.example.text}
              </p>
              <p {...nativeText} className="text-chip text-muted">
                {grammar.example.translation}
              </p>
            </div>
            <Speaker label="Listen to the example" size="sm" onClick={() => onSpeak(grammar.example.text)} />
          </div>
        </section>
      )}
    </article>
  )
}
