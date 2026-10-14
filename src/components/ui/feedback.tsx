import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import clsx from 'clsx'
import { Dialog } from './Dialog'
import { Button } from './Button'

/* ------------------------------------------------------------- Toasts ---- */

interface ToastItem {
  id: number
  message: ReactNode
  action?: { label: string; onClick: () => void }
  tone?: 'default' | 'error'
}

type ToastFn = (message: ReactNode, opts?: { action?: ToastItem['action']; tone?: ToastItem['tone']; duration?: number }) => void

/* ------------------------------------------------------------ Confirm ---- */

interface ConfirmOptions {
  title: string
  body?: ReactNode
  confirmLabel?: string
  danger?: boolean
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>

const FeedbackContext = createContext<{ toast: ToastFn; confirm: ConfirmFn } | null>(null)

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const nextId = useRef(1)
  const [pending, setPending] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null)

  const dismiss = useCallback((id: number) => setToasts((list) => list.filter((t) => t.id !== id)), [])

  const toast = useCallback<ToastFn>(
    (message, opts = {}) => {
      const id = nextId.current++
      setToasts((list) => [...list.slice(-2), { id, message, action: opts.action, tone: opts.tone }])
      setTimeout(() => dismiss(id), opts.duration ?? (opts.action ? 6000 : 3500))
    },
    [dismiss],
  )

  const confirm = useCallback<ConfirmFn>((opts) => new Promise((resolve) => setPending({ ...opts, resolve })), [])

  const close = (value: boolean) => {
    pending?.resolve(value)
    setPending(null)
  }

  const value = useMemo(() => ({ toast, confirm }), [toast, confirm])

  return (
    <FeedbackContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(76px+env(safe-area-inset-bottom))] z-50 flex flex-col items-center gap-2 px-4 md:bottom-6"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={clsx(
              'pointer-events-auto flex max-w-md animate-rise items-center gap-3 rounded-full py-2 pr-2 pl-4 text-small shadow-popup',
              t.tone === 'error' ? 'bg-red-soft text-red-ink' : 'bg-button-dark text-on-dark',
              !t.action && 'pr-4',
            )}
          >
            <span className="min-w-0">{t.message}</span>
            {t.action && (
              <button
                type="button"
                onClick={() => {
                  t.action?.onClick()
                  dismiss(t.id)
                }}
                className="h-7 shrink-0 rounded-full px-3 font-medium underline-offset-2 hover:underline"
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
      <Dialog
        open={!!pending}
        onClose={() => close(false)}
        title={pending?.title ?? ''}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => close(false)}>
              Cancel
            </Button>
            <Button variant={pending?.danger ? 'danger' : 'primary'} onClick={() => close(true)} autoFocus>
              {pending?.confirmLabel ?? 'Confirm'}
            </Button>
          </>
        }
      >
        {pending?.body && <div className="text-body text-ink-2">{pending.body}</div>}
      </Dialog>
    </FeedbackContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useFeedback() {
  const ctx = useContext(FeedbackContext)
  if (!ctx) throw new Error('useFeedback must be used inside FeedbackProvider')
  return ctx
}
