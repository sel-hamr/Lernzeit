import { useMemo } from 'react'
import clsx from 'clsx'
import { parseInline, parseRule } from '@/lib/grammar'

/** Text with **bold** and *italic*. */
export function Inline({ text }: { text: string }) {
  return (
    <>
      {parseInline(text).map((part, i) => {
        if (part.bold && part.italic)
          return (
            <strong key={i} className="font-semibold text-sage-ink italic">
              {part.text}
            </strong>
          )
        if (part.bold)
          return (
            <strong key={i} className="font-semibold text-sage-ink">
              {part.text}
            </strong>
          )
        if (part.italic) return <em key={i}>{part.text}</em>
        return <span key={i}>{part.text}</span>
      })}
    </>
  )
}

/** A topic's explanation: paragraphs, lists, tables and headings. */
export function RuleText({ text }: { text: string }) {
  const blocks = useMemo(() => parseRule(text), [text])
  return (
    <div className="flex flex-col gap-3.5 text-body leading-relaxed text-pretty">
      {blocks.map((block, i) => {
        if (block.type === 'heading') {
          return (
            <h3 key={i} className="pt-1 text-small font-semibold text-ink">
              <Inline text={block.text} />
            </h3>
          )
        }
        if (block.type === 'paragraph') {
          return (
            <p key={i}>
              <Inline text={block.text} />
            </p>
          )
        }
        if (block.type === 'list') {
          return (
            <ul key={i} className="flex list-disc flex-col gap-1.5 pl-5 marker:text-muted">
              {block.items.map((item, j) => (
                <li key={j}>
                  <Inline text={item} />
                </li>
              ))}
            </ul>
          )
        }
        return (
          // Wide tables scroll on their own on a phone instead of the page.
          <div key={i} className="overflow-x-auto">
            {/* The border sits on a wrapper, so the rounded corners do not clip the cells' lines. */}
            <div className="w-full min-w-max overflow-hidden rounded-row border border-line">
              <table className="w-full border-collapse text-small">
                <thead>
                  <tr className="border-b border-line bg-field">
                    {block.header.map((cell, j) => (
                      <th key={j} className="border-r border-line px-3 py-2 text-left font-medium text-ink-2 last:border-r-0">
                        <Inline text={cell} />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map((row, j) => (
                    <tr key={j} className="border-b border-line last:border-b-0">
                      {row.map((cell, k) => (
                        <td key={k} className={clsx('border-r border-line px-3 py-2 last:border-r-0', k === 0 && 'font-medium text-ink-2')}>
                          <Inline text={cell} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      })}
    </div>
  )
}
