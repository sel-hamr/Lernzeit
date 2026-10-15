import clsx from 'clsx'
import { Chip } from '@/components/ui/primitives'
import type { Coverage, WordStatus } from '@/lib/reader'
import { difficulty, percent } from './difficulty'

const PARTS: { status: WordStatus; label: string; bar: string }[] = [
  { status: 'known', label: 'Known', bar: 'bg-sage-dot' },
  { status: 'learning', label: 'Learning', bar: 'bg-sage-bar' },
  { status: 'new', label: 'New', bar: 'bg-word-new-line' },
  { status: 'unknown', label: 'Not in your decks', bar: 'bg-track' },
]

/** One stacked bar: known, learning, new, not in your decks. */
export function CoverageBar({ coverage, className }: { coverage: Coverage; className?: string }) {
  const label = PARTS.map((p) => `${p.label} ${percent(coverage[p.status], coverage.words)}%`).join(', ')
  return (
    <div role="img" aria-label={label} className={clsx('flex h-2 overflow-hidden rounded-full bg-track', className)}>
      {PARTS.map((p) =>
        coverage[p.status] ? <div key={p.status} className={clsx('h-full', p.bar)} style={{ width: `${(coverage[p.status] / coverage.words) * 100}%` }} /> : null,
      )}
    </div>
  )
}

export function CoverageLegend({ coverage }: { coverage: Coverage }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-chip text-muted">
      {PARTS.map((p) => (
        <li key={p.status} className="flex items-center gap-1.5">
          <span aria-hidden className={clsx('size-2 rounded-full', p.bar, p.status === 'unknown' && 'ring-1 ring-line-strong ring-inset')} />
          {p.label}
          <span className="text-ink tabular-nums">{percent(coverage[p.status], coverage.words)}%</span>
        </li>
      ))}
    </ul>
  )
}

export function DifficultyChip({ coverage, className }: { coverage: Coverage; className?: string }) {
  const level = difficulty(coverage)
  if (!level) return null
  return (
    <Chip tone={level.tone} className={className}>
      {level.label}
    </Chip>
  )
}
