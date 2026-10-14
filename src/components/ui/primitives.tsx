import type { CSSProperties, HTMLAttributes, ReactNode } from 'react'
import clsx from 'clsx'
import { Link } from 'react-router'
import type { Priority, TopicColor } from '@/db/types'
import { PRIORITY_LABEL, topicVars } from '@/lib/colors'

/* Section: the white rounded card used everywhere (16px radius, 1px line). */
export function Section({ className, children, ...rest }: HTMLAttributes<HTMLElement>) {
  return (
    <section className={clsx('rounded-section border border-line bg-main', className)} {...rest}>
      {children}
    </section>
  )
}

export function SectionHeader({ title, subtitle, action, className }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={clsx('flex items-start justify-between gap-3', className)}>
      <div className="flex min-w-0 flex-col gap-1">
        <h2 className="text-section font-semibold">{title}</h2>
        {subtitle && <div className="text-small text-muted">{subtitle}</div>}
      </div>
      {action && <div className="flex shrink-0 items-center gap-2 pt-0.5">{action}</div>}
    </div>
  )
}

export function PageHeader({ title, subtitle, actions, inline }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; inline?: boolean }) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className={clsx('flex min-w-0', inline ? 'flex-wrap items-baseline gap-x-3 gap-y-1' : 'flex-col gap-1.5')}>
        <h1 className="text-title font-semibold">{title}</h1>
        {subtitle && <div className="text-body text-muted tabular-nums">{subtitle}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2.5">{actions}</div>}
    </header>
  )
}

/* Stats strip: one bordered card split by thin vertical lines. */
export function StatStrip({ items, className }: { items: { value: ReactNode; label: ReactNode; to?: string; title?: string }[]; className?: string }) {
  return (
    <div className={clsx('grid grid-cols-3 overflow-hidden rounded-section border border-line bg-main', className)}>
      {items.map((item, i) => {
        const cls = clsx(
          'flex min-w-0 flex-col gap-1 px-3.5 py-4 sm:gap-1.5 sm:px-6 sm:py-5',
          i > 0 && 'border-l border-line',
          item.to && 'transition-colors hover:bg-soft',
        )
        const body = (
          <>
            <div className="truncate text-[24px] leading-tight font-normal tracking-[-0.03em] tabular-nums sm:text-stat">{item.value}</div>
            <div className="text-chip text-muted sm:text-body">{item.label}</div>
          </>
        )
        return item.to ? (
          <Link key={i} to={item.to} className={cls} title={item.title}>
            {body}
          </Link>
        ) : (
          <div key={i} className={cls}>
            {body}
          </div>
        )
      })}
    </div>
  )
}

export type ChipTone = 'sage' | 'blue' | 'red' | 'neutral' | 'soft' | 'topic'

const chipTones: Record<Exclude<ChipTone, 'topic'>, string> = {
  sage: 'bg-sage text-sage-ink',
  blue: 'bg-blue-soft text-blue-ink',
  red: 'bg-red-soft text-red-ink',
  neutral: 'bg-neutral-chip text-neutral-ink',
  soft: 'bg-neutral-chip text-muted',
}

export function Chip({
  tone = 'sage',
  color,
  className,
  children,
  style,
}: {
  tone?: ChipTone
  /** For tone="topic": the topic colour set. */
  color?: TopicColor
  className?: string
  children: ReactNode
  style?: CSSProperties
}) {
  return (
    <span
      className={clsx(
        'inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.75 text-chip font-medium tabular-nums',
        tone === 'topic' ? 'bg-(--t-soft) text-(--t-ink)' : chipTones[tone],
        className,
      )}
      style={tone === 'topic' ? { ...topicVars(color), ...style } : style}
    >
      {children}
    </span>
  )
}

const priorityTone: Record<Priority, ChipTone> = { high: 'red', medium: 'neutral', low: 'sage' }

export function PriorityChip({ priority, className }: { priority: Priority; className?: string }) {
  return (
    <Chip tone={priorityTone[priority]} className={className}>
      {PRIORITY_LABEL[priority]}
    </Chip>
  )
}

export function Dot({ color, className }: { color?: TopicColor; className?: string }) {
  return (
    <span
      aria-hidden
      className={clsx('inline-block size-2 shrink-0 rounded-full bg-(--t-dot)', className)}
      style={topicVars(color)}
    />
  )
}

export function ProgressBar({ value, color, className, label }: { value: number; color?: TopicColor; className?: string; label?: string }) {
  const pct = Math.max(0, Math.min(1, value)) * 100
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      aria-label={label}
      className={clsx('h-2 overflow-hidden rounded-full bg-track', className)}
      style={topicVars(color)}
    >
      <div className="h-full rounded-full bg-(--t-bar) transition-[width] duration-500 ease-out" style={{ width: `${pct}%` }} />
    </div>
  )
}

export function EmptyState({ icon, title, children, action, className }: { icon?: ReactNode; title: ReactNode; children?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={clsx('flex flex-col items-center gap-2 px-6 py-8 text-center', className)}>
      {icon && <div className="mb-1 flex size-11 items-center justify-center rounded-full bg-field text-muted">{icon}</div>}
      <div className="text-body font-medium">{title}</div>
      {children && <div className="max-w-sm text-small text-muted">{children}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded-[5px] border border-line-strong bg-main px-1 font-sans text-[11px] font-medium text-muted">
      {children}
    </kbd>
  )
}

/** Small uppercase-free label used above sidebar groups. */
export function GroupLabel({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex justify-between text-chip text-muted">
      <span>{children}</span>
      {aside !== undefined && <span className="tabular-nums">{aside}</span>}
    </div>
  )
}
