import { useEffect, useRef, type ReactNode } from 'react'
import clsx from 'clsx'
import { X } from 'lucide-react'

export interface DialogProps {
  open: boolean
  onClose: () => void
  title: ReactNode
  description?: ReactNode
  children?: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg'
  /** Keeps Escape / outside clicks from closing (e.g. while saving). */
  locked?: boolean
}

const widths = { sm: 'sm:max-w-100', md: 'sm:max-w-130', lg: 'sm:max-w-170' }

/**
 * Modal built on the native <dialog> element: focus trapping, Escape and the
 * top layer come for free. On phones it becomes a bottom sheet.
 */
export function Dialog({ open, onClose, title, description, children, footer, size = 'md', locked }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const pointerDownOnBackdrop = useRef(false)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    else if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault()
        if (!locked) onClose()
      }}
      onPointerDown={(e) => {
        pointerDownOnBackdrop.current = e.target === ref.current
      }}
      onClick={(e) => {
        // Only a press that starts and ends on the backdrop closes the dialog.
        if (e.target === ref.current && pointerDownOnBackdrop.current && !locked) onClose()
      }}
      className={clsx(
        'm-0 mt-auto w-full max-w-none bg-transparent p-0 text-ink',
        'sm:m-auto sm:w-[calc(100%-32px)]',
        widths[size],
        'max-h-[92dvh] overflow-visible backdrop:bg-scrim open:animate-rise',
      )}
    >
      {open && (
        <div className="flex max-h-[92dvh] flex-col overflow-hidden rounded-t-[20px] border border-line bg-main shadow-popup sm:rounded-section">
          <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-3">
            <div className="flex min-w-0 flex-col gap-1">
              <h2 className="text-[19px] font-semibold tracking-[-0.01em]">{title}</h2>
              {description && <p className="text-small text-muted">{description}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="-mr-2 flex size-9 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-field hover:text-ink"
            >
              <X size={18} strokeWidth={1.7} />
            </button>
          </div>
          <div className={clsx('min-h-0 flex-1 overflow-y-auto px-6', footer ? 'pb-5' : 'pb-[max(20px,env(safe-area-inset-bottom))]')}>{children}</div>
          {footer && (
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-soft px-6 py-3.5 pb-[max(14px,env(safe-area-inset-bottom))]">
              {footer}
            </div>
          )}
        </div>
      )}
    </dialog>
  )
}
