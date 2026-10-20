import { useState, type KeyboardEvent } from 'react'
import clsx from 'clsx'
import { Volume2 } from 'lucide-react'
import type { Gender } from '@/db/types'
import type { Piece, WordStatus } from '@/lib/reader'
import { statusOf, type AnnotatedStory, type Vocabulary } from './vocabulary'
import { useLanguage, useLearningText, useNativeText } from '@/data/hooks'

/** A word in the story, by its paragraph and its offset in that paragraph. */
export interface WordRef {
  paragraph: number
  start: number
}

const wordKey = (ref: WordRef) => `${ref.paragraph}:${ref.start}`

const STATUS_CLASS: Record<WordStatus, string> = {
  unknown: 'hover:bg-field',
  new: 'bg-word-new shadow-[inset_0_-2px_0_var(--color-word-new-line)]',
  learning: 'bg-word-learning shadow-[inset_0_-2px_0_var(--color-word-learning-line)]',
  known: 'shadow-[inset_0_-2px_0_var(--color-word-known-line)] hover:bg-field',
}

const GENDER_CLASS: Record<Gender, string> = { der: 'text-der', die: 'text-die', das: 'text-das' }

/** The gender every noun card behind a word agrees on; none when the cards disagree or are not nouns. */
function genderOf(piece: Piece, vocabulary: Vocabulary): Gender | undefined {
  const genders = new Set(piece.cardIds.map((id) => vocabulary.cards.get(id)?.gender))
  return genders.size === 1 ? [...genders][0] : undefined
}

/** Arrow keys move between words, so the whole text is a single stop for Tab. */
function moveBetweenWords(e: KeyboardEvent<HTMLElement>) {
  if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
  const current = e.target as HTMLElement
  if (!current.matches('[data-word]')) return
  const words = [...e.currentTarget.querySelectorAll<HTMLElement>('[data-word]')]
  const next = words[words.indexOf(current) + (e.key === 'ArrowRight' ? 1 : -1)]
  if (!next) return
  e.preventDefault()
  next.focus()
}

/**
 * The story with every word as a button. Words from your decks are
 * highlighted by how well you know them, and nouns take their gender colour.
 */
export function StoryText({
  story,
  vocabulary,
  highlights,
  showTranslation,
  selected,
  onSelect,
  onSpeak,
}: {
  story: AnnotatedStory
  vocabulary: Vocabulary
  highlights: boolean
  showTranslation: boolean
  selected: WordRef | null
  onSelect: (ref: WordRef) => void
  onSpeak: (text: string) => void
}) {
  const learning = useLearningText()
  const nativeText = useNativeText()
  const [focused, setFocused] = useState<string | null>(null)
  const keys = story.paragraphs.flatMap((p, paragraph) => p.pieces.filter((piece) => piece.words).map((piece) => wordKey({ paragraph, start: piece.start })))
  // After an edit the focused word may be gone; then the first word takes the tab stop.
  const tabStop = focused && keys.includes(focused) ? focused : keys[0]
  const selectedKey = selected && wordKey(selected)

  return (
    <div role="group" aria-label="Story. Use the arrow keys to move between words." className="flex flex-col gap-6" onKeyDown={moveBetweenWords}>
      {story.paragraphs.map((paragraph, index) => (
        <div key={index} className="grid grid-cols-[1fr_auto] items-start gap-x-3 gap-y-2">
          <p {...learning} className="text-[17px] leading-[1.9] text-pretty sm:text-[19px]">
            {paragraph.pieces.map((piece) => {
              if (!piece.words) return piece.text
              const ref = { paragraph: index, start: piece.start }
              const key = wordKey(ref)
              const gender = highlights ? genderOf(piece, vocabulary) : undefined
              return (
                <button
                  key={key}
                  type="button"
                  data-word
                  tabIndex={key === tabStop ? 0 : -1}
                  aria-current={key === selectedKey ? 'true' : undefined}
                  onFocus={() => setFocused(key)}
                  onClick={() => onSelect(ref)}
                  className={clsx(
                    // A tight line height keeps the highlight around the letters; the paragraph keeps its spacing.
                    '-mx-px rounded-sm px-px leading-[1.35] box-decoration-clone transition-colors duration-150',
                    highlights ? STATUS_CLASS[statusOf(piece, vocabulary)] : 'hover:bg-field',
                    gender && GENDER_CLASS[gender],
                    key === selectedKey && 'outline-2 outline-offset-1 outline-sage-dot',
                  )}
                >
                  {piece.text}
                </button>
              )
            })}
          </p>
          <button
            type="button"
            onClick={() => onSpeak(paragraph.text)}
            aria-label={`Listen to paragraph ${index + 1}`}
            title="Listen"
            className="mt-1 flex size-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-field hover:text-ink"
          >
            <Volume2 size={16} strokeWidth={1.7} />
          </button>
          {showTranslation && story.translation && (
            <p {...nativeText} className="col-start-1 text-body text-pretty text-muted">
              {story.translation[index]}
            </p>
          )}
        </div>
      ))}
    </div>
  )
}

const GERMAN_SAMPLES = ['Haus', 'gehen', 'gut', 'Nudeln']

/** What the highlights mean, with a sample of each: German words, or the words of the language's voice sample. */
export function HighlightKey() {
  const learning = useLearningText()
  const language = useLanguage()
  const german = language.code === 'de'
  const words = german ? GERMAN_SAMPLES : (language.sample.match(/[\p{L}\p{M}]+/gu) ?? [])
  const sample = (i: number) => words[i % Math.max(words.length, 1)] ?? language.name
  const rows: { sample: string; status: WordStatus; text: string }[] = [
    { sample: sample(0), status: 'new', text: 'In a deck, not studied yet' },
    { sample: sample(1), status: 'learning', text: 'Learning' },
    { sample: sample(2), status: 'known', text: 'Known: next review three weeks or more away' },
    { sample: sample(3), status: 'unknown', text: 'Not in your decks: tap it to add it' },
  ]
  return (
    <div className="flex flex-col gap-3 text-small">
      <ul className="flex flex-col gap-2.5">
        {rows.map((row) => (
          <li key={row.status} className="flex items-baseline gap-3">
            <span {...learning} className={clsx('min-w-16 shrink-0 rounded-sm px-1 text-center text-body', STATUS_CLASS[row.status])}>
              {row.sample}
            </span>
            <span className="text-muted">{row.text}</span>
          </li>
        ))}
      </ul>
      {german && (
        <p className="text-muted">
          Nouns take their gender colour: <span className="font-medium text-der">der</span>, <span className="font-medium text-die">die</span>,{' '}
          <span className="font-medium text-das">das</span>.
        </p>
      )}
    </div>
  )
}
