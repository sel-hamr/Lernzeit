import { useEffect, useId, useRef, useState } from 'react'
import clsx from 'clsx'
import { ArrowRight, Check, Search } from 'lucide-react'
import { Kbd } from '@/components/ui/primitives'
import { filterByLabel } from '@lernzeit/core/tabs'

export interface DeckTab {
  value: string
  label: string
  count: number
}

/**
 * A command menu of decks in the middle of the screen: a search field, the
 * list, and a footer with the keys. Arrow keys, Home and End move, Enter
 * opens, Escape or a click outside closes. Used for the decks that do not fit
 * the Flashcards tabs and the sidebar, and on phones for every deck. Below `md`
 * it is a sheet from the bottom. Closing gives the focus back to `anchor`.
 * `current` marks the open deck.
 */
export function DeckMenu({
  decks,
  anchor,
  onPick,
  onClose,
  heading = 'More decks',
  current,
}: {
  decks: DeckTab[]
  anchor: React.RefObject<HTMLElement | null>
  onPick: (value: string) => void
  onClose: () => void
  heading?: string
  current?: string
}) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const ref = useRef<HTMLDialogElement>(null)
  const pointerDownOnBackdrop = useRef(false)
  const listId = useId()
  const matches = filterByLabel(decks, query)
  const activeIndex = Math.min(active, Math.max(0, matches.length - 1))

  // A modal <dialog> sits in the top layer, keeps the focus inside and dims the page.
  useEffect(() => {
    const dialog = ref.current
    if (!dialog || dialog.open) return
    dialog.showModal()
    // On a phone the list comes first: focusing the search field would raise the keyboard over it.
    if (typeof matchMedia === 'function' && matchMedia('(pointer: coarse) and (max-width: 767.98px)').matches) dialog.focus()
  }, [])

  // Leave the top layer first: the page outside a modal dialog cannot take the focus.
  const close = () => {
    ref.current?.close()
    onClose()
    anchor.current?.focus()
  }

  const choose = (value: string) => {
    ref.current?.close()
    onPick(value)
  }

  useEffect(() => {
    document.getElementById(`${listId}-${activeIndex}`)?.scrollIntoView({ block: 'nearest' })
  }, [listId, activeIndex])

  const onKeyDown = (e: React.KeyboardEvent) => {
    const last = matches.length - 1
    const moves: Record<string, number> = { ArrowDown: Math.min(activeIndex + 1, last), ArrowUp: Math.max(activeIndex - 1, 0), Home: 0, End: last }
    if (e.key in moves && matches.length > 0) {
      e.preventDefault()
      setActive(moves[e.key])
    } else if (e.key === 'Enter' && matches[activeIndex]) {
      e.preventDefault()
      choose(matches[activeIndex].value)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      close()
    }
  }

  return (
    <dialog
      ref={ref}
      aria-label="Find a deck"
      onCancel={(e) => {
        e.preventDefault()
        close()
      }}
      onPointerDown={(e) => {
        pointerDownOnBackdrop.current = e.target === ref.current
      }}
      onClick={(e) => {
        // Only a press that starts and ends on the backdrop closes the menu.
        if (e.target === ref.current && pointerDownOnBackdrop.current) close()
      }}
      tabIndex={-1}
      className="m-0 mt-auto w-full max-w-none overflow-visible bg-transparent p-0 text-ink outline-none backdrop:bg-scrim open:animate-rise md:m-auto md:w-[calc(100%-32px)] md:max-w-lg"
    >
      <div className="flex flex-col overflow-hidden rounded-t-[20px] border border-line bg-main pb-safe shadow-popup md:rounded-section md:pb-0">
        <div className="p-1.5 pb-0">
          <label className="flex h-9 items-center gap-2 rounded-img border border-line bg-field px-2.5 text-muted transition-colors focus-within:border-line-strong">
            <Search size={15} strokeWidth={1.8} aria-hidden />
            <input
              type="text"
              role="combobox"
              aria-expanded
              aria-autocomplete="list"
              aria-controls={listId}
              aria-activedescendant={matches.length > 0 ? `${listId}-${activeIndex}` : undefined}
              aria-label="Find a deck"
              placeholder="Find a deck…"
              autoFocus
              autoComplete="off"
              spellCheck={false}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setActive(0)
              }}
              onKeyDown={onKeyDown}
              className="w-full min-w-0 bg-transparent text-small text-ink outline-none placeholder:text-muted"
            />
          </label>
        </div>

        <div id={listId} role="listbox" aria-label={heading} className="max-h-[min(20rem,50dvh)] scrollbar-none overflow-y-auto p-1.5">
          {matches.length === 0 ? (
            <div className="py-6 text-center text-small text-muted">No deck found.</div>
          ) : (
            <>
              <div aria-hidden className="px-2.5 pt-1 pb-1.5 text-chip text-muted">
                {heading}
              </div>
              {matches.map((tab, i) => (
                <div
                  key={tab.value}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === activeIndex}
                  // Keep the focus in the search field.
                  onPointerDown={(e) => e.preventDefault()}
                  onPointerMove={() => i !== activeIndex && setActive(i)}
                  onClick={() => choose(tab.value)}
                  className={clsx(
                    'flex h-9 cursor-pointer items-center gap-2.5 rounded-img border px-2.5 text-small select-none',
                    i === activeIndex ? 'border-line bg-field text-ink' : 'border-transparent text-ink-2',
                  )}
                >
                  {tab.value === current ? (
                    <Check size={14} strokeWidth={2.2} aria-hidden className="shrink-0 text-sage-ink" />
                  ) : (
                    <ArrowRight size={14} strokeWidth={1.8} aria-hidden className="shrink-0 text-muted" />
                  )}
                  <span className={clsx('min-w-0 flex-1 truncate', tab.value === current && 'font-medium text-ink')}>
                    {tab.label}
                    {tab.value === current && <span className="sr-only">, open</span>}
                  </span>
                  <span className="text-chip text-muted tabular-nums">{tab.count}</span>
                </div>
              ))}
            </>
          )}
        </div>

        <div aria-hidden className="flex items-center gap-4 border-t border-line bg-soft px-3 py-2 text-chip text-muted pointer-coarse:hidden">
          <span className="flex items-center gap-1.5">
            <Kbd>↵</Kbd> Open deck
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> Move
          </span>
          <span className="ml-auto flex items-center gap-1.5">
            <Kbd>Esc</Kbd> Close
          </span>
        </div>
      </div>
    </dialog>
  )
}
