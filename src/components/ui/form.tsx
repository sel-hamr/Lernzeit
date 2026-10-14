import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import clsx from 'clsx'
import { ChevronDown } from 'lucide-react'

const control =
  'w-full rounded-img border border-line bg-main px-3 text-body text-ink outline-none transition-[border-color,box-shadow] placeholder:text-muted hover:border-line-strong focus:border-sage-dot focus:ring-3 focus:ring-sage-dot/15 focus-visible:outline-none disabled:opacity-60'

export function Field({ label, hint, error, children, htmlFor, className }: { label: ReactNode; hint?: ReactNode; error?: ReactNode; children: ReactNode; htmlFor?: string; className?: string }) {
  return (
    <div className={clsx('flex flex-col gap-1.5', className)}>
      <label htmlFor={htmlFor} className="text-small font-medium text-ink-2">
        {label}
      </label>
      {children}
      {error ? <div className="text-chip text-red-ink">{error}</div> : hint ? <div className="text-chip text-muted">{hint}</div> : null}
    </div>
  )
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={clsx(control, 'h-10', className)} {...rest} />
})

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={clsx(control, 'resize-none py-2.5 leading-normal', className)} {...rest} />
})

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...rest }, ref) {
  return (
    <div className={clsx('relative', className)}>
      <select ref={ref} className={clsx(control, 'h-10 appearance-none pr-9')} {...rest}>
        {children}
      </select>
      <ChevronDown size={14} strokeWidth={2} className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-muted" />
    </div>
  )
})

/**
 * The "Session" panel row: label on the left, value and chevron on the
 * right, on bg-field. A transparent native <select> covers it, so phones get
 * their own picker and keyboards work as usual.
 */
export function SelectRow({
  label,
  display,
  value,
  onChange,
  children,
  disabled,
}: {
  label: string
  display: ReactNode
  value: string
  onChange: (value: string) => void
  children: ReactNode
  disabled?: boolean
}) {
  const id = useId()
  return (
    <div className={clsx('relative flex h-12 items-center gap-2.5 rounded-row bg-field px-3.5 text-body transition-colors', !disabled && 'hover:bg-track', disabled && 'opacity-60')}>
      <label htmlFor={id} className="w-22.5 shrink-0 text-muted">
        {label}
      </label>
      <span className="flex min-w-0 flex-1 items-center gap-2 truncate font-medium">{display}</span>
      <ChevronDown size={14} strokeWidth={2} className="shrink-0 text-ink" />
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 size-full cursor-pointer appearance-none opacity-0 disabled:cursor-not-allowed"
      >
        {children}
      </select>
    </div>
  )
}

export function Switch({ checked, onChange, label, description, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; description?: ReactNode; disabled?: boolean }) {
  const id = useId()
  return (
    <div className="flex items-center justify-between gap-4 py-1">
      <label htmlFor={id} className="flex min-w-0 flex-col gap-0.5">
        <span className="text-body font-medium">{label}</span>
        {description && <span className="text-small text-muted">{description}</span>}
      </label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={clsx(
          'relative h-6 w-10 shrink-0 rounded-full transition-colors duration-200',
          checked ? 'bg-button-dark' : 'bg-line-strong',
        )}
      >
        <span
          className={clsx(
            'absolute top-0.5 left-0.5 size-5 rounded-full bg-main shadow-tab transition-transform duration-200',
            checked && 'translate-x-4',
          )}
        />
      </button>
    </div>
  )
}

/** Pill tab group on bg-field (Flashcards deck tabs, filters, toggles). */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
  size = 'md',
}: {
  options: { value: T; label: ReactNode; count?: number }[]
  value: T
  onChange: (value: T) => void
  label: string
  className?: string
  size?: 'sm' | 'md'
}) {
  return (
    <div role="tablist" aria-label={label} className={clsx('flex max-w-full gap-0.5 overflow-x-auto rounded-row bg-field p-1 scrollbar-none', className)}>
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={clsx(
              'flex shrink-0 items-center gap-1.5 rounded-[9px] text-small whitespace-nowrap transition-[background-color,color,box-shadow] duration-150',
              size === 'md' ? 'h-8.5 px-3.5' : 'h-8 px-3',
              active ? 'bg-main font-medium text-ink shadow-tab' : 'text-ink-2 hover:text-ink',
            )}
          >
            {o.label}
            {o.count !== undefined && <span className="text-chip text-muted tabular-nums">{o.count}</span>}
          </button>
        )
      })}
    </div>
  )
}

/** Compact select shown as plain text with a chevron ("Due first ⌄"). */
export function TextSelect({ value, onChange, children, label, className }: { value: string; onChange: (v: string) => void; children: ReactNode; label: string; className?: string }) {
  return (
    <div className={clsx('relative inline-flex h-8.5 items-center', className)}>
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-full cursor-pointer appearance-none bg-transparent pr-6 pl-1.5 text-small text-ink outline-none"
      >
        {children}
      </select>
      <ChevronDown size={14} strokeWidth={2} className="pointer-events-none absolute right-1 text-ink" />
    </div>
  )
}

/** Minutes input that shows hours and minutes ("2 h 30 min"). */
export function DurationInput({ minutes, onChange, id, max = 24 * 60 }: { minutes: number; onChange: (m: number) => void; id?: string; max?: number }) {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  const set = (hours: number, mins: number) => onChange(Math.max(0, Math.min(max, hours * 60 + mins)))
  return (
    <div className="flex items-center gap-1.5">
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={0}
        max={24}
        value={h}
        aria-label="Hours"
        onChange={(e) => set(Number(e.target.value) || 0, m)}
        className={clsx(control, 'h-10 w-16 text-center tabular-nums')}
      />
      <span className="text-small text-muted">h</span>
      <input
        type="number"
        inputMode="numeric"
        min={0}
        max={59}
        step={5}
        value={m}
        aria-label="Minutes"
        onChange={(e) => set(h, Math.min(59, Number(e.target.value) || 0))}
        className={clsx(control, 'h-10 w-16 text-center tabular-nums')}
      />
      <span className="text-small text-muted">min</span>
    </div>
  )
}
