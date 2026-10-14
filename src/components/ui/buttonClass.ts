import clsx from 'clsx'

export type ButtonVariant = 'primary' | 'outline' | 'soft' | 'ghost' | 'danger' | 'quiet'
export type ButtonSize = 'sm' | 'md' | 'lg'

const base =
  'inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap rounded-full font-medium transition-[background-color,border-color,color,opacity,transform] duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45'

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-button-dark text-on-dark hover:opacity-90',
  outline: 'border border-line-strong bg-main text-ink hover:bg-soft hover:border-muted/40',
  soft: 'bg-button-soft text-ink hover:brightness-[0.97]',
  ghost: 'text-ink-2 hover:bg-field hover:text-ink',
  quiet: 'text-sage-ink hover:text-ink',
  danger: 'border border-red-soft bg-red-soft text-red-ink hover:brightness-[0.97]',
}

const sizes: Record<ButtonSize, string> = {
  sm: 'h-9 px-3.5 text-small',
  md: 'h-10 px-4 text-body',
  lg: 'h-11 px-[22px] text-[15px]',
}

const iconSizes: Record<ButtonSize, string> = { sm: 'size-9', md: 'size-10', lg: 'size-11' }

/** Pill button classes (40px tall by default), used by <Button>. */
export function buttonClass({ variant = 'outline', size = 'md', iconOnly = false, className }: { variant?: ButtonVariant; size?: ButtonSize; iconOnly?: boolean; className?: string }) {
  return clsx(base, variants[variant], iconOnly ? clsx(iconSizes[size], 'p-0') : sizes[size], className)
}
