import clsx from 'clsx'
import type { DiffPart } from '@/lib/answer'

/** A space on its own is too thin to see, so extra and missing ones show as ␣. */
const visible = (part: DiffPart) => (part.kind === 'extra' || part.kind === 'missing' ? part.text.replace(/ /g, '␣') : part.text)

/** What was typed, letter by letter against the answer: wrong and extra letters in red, missing ones in green. */
export function Diff({ parts }: { parts: DiffPart[] }) {
  return (
    <span className="font-medium tracking-[0.01em]">
      {parts.map((p, i) => (
        <span
          key={i}
          className={clsx(
            p.kind === 'wrong' && 'rounded-[3px] bg-red-soft text-red-ink',
            p.kind === 'extra' && 'rounded-[3px] bg-red-soft text-red-ink line-through',
            p.kind === 'missing' && 'rounded-[3px] bg-sage text-sage-ink underline decoration-dotted underline-offset-4',
          )}
        >
          {visible(p)}
        </span>
      ))}
    </span>
  )
}
