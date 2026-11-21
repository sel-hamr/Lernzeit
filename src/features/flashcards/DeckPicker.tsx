import { useEffect, useId, useRef, useState } from 'react'
import clsx from 'clsx'
import { Check, ChevronDown, Search } from 'lucide-react'
import { filterByLabel } from '@lernzeit/core/tabs'
import { count } from '@lernzeit/core/text'
import { toggleId } from '@lernzeit/core/deckPick'
import type { DeckTab } from './DeckMenu'

/** The panel keeps to this width at least, wider than a narrow field. */
const MIN_WIDTH = 340
const GAP = 6
const EDGE = 16

/** Below the field, or above it when there is more room there. */
function placePanel(trigger: HTMLElement | null, panel: HTMLElement | null) {
  if (!trigger || !panel) return
  const rect = trigger.getBoundingClientRect()
  const width = Math.min(Math.max(rect.width, MIN_WIDTH), innerWidth - 2 * EDGE)
  const left = Math.min(Math.max(EDGE, rect.left), innerWidth - EDGE - width)
  const below = innerHeight - rect.bottom - GAP - EDGE
  const above = rect.top - GAP - EDGE
  const down = below >= 360 || below >= above
  Object.assign(panel.style, {
    left: `${left}px`,
    width: `${width}px`,
    top: down ? `${rect.bottom + GAP}px` : 'auto',
    bottom: down ? 'auto' : `${innerHeight - rect.top + GAP}px`,
    maxHeight: `${Math.min(down ? below : above, 440)}px`,
  })
}

/**
 * A field for choosing several decks. No deck chosen means all decks. The
 * panel opens in the top layer (the Popover API), so it shows whole even
 * inside a dialog, and clicking outside or Escape closes it.
 * `count` on each deck is what `unit` counts, such as its words.
 */
export function DeckPicker({ id, decks, value, onChange, unit = 'card' }: { id?: string; decks: DeckTab[]; value: string[]; onChange: (ids: string[]) => void; unit?: string }) {
  const popoverId = useId()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const selected = decks.filter((d) => value.includes(d.value))

  useEffect(() => {
    const panel = panelRef.current
    if (!panel) return
    const beforeToggle = (e: Event) => {
      if ((e as ToggleEvent).newState === 'open') placePanel(triggerRef.current, panelRef.current)
    }
    const toggle = (e: Event) => setOpen((e as ToggleEvent).newState === 'open')
    panel.addEventListener('beforetoggle', beforeToggle)
    panel.addEventListener('toggle', toggle)
    return () => {
      panel.removeEventListener('beforetoggle', beforeToggle)
      panel.removeEventListener('toggle', toggle)
    }
  }, [])

  // The field moves when the dialog around it scrolls or the window resizes.
  useEffect(() => {
    if (!open) return
    const place = () => placePanel(triggerRef.current, panelRef.current)
    addEventListener('resize', place)
    addEventListener('scroll', place, true)
    return () => {
      removeEventListener('resize', place)
      removeEventListener('scroll', place, true)
    }
  }, [open])

  return (
    <>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        popoverTarget={popoverId}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={clsx(
          'flex h-10 w-full items-center gap-2 rounded-img border bg-main pr-3 pl-3 text-left text-body text-ink outline-none transition-[border-color,box-shadow] hover:border-line-strong focus-visible:border-sage-dot focus-visible:ring-3 focus-visible:ring-sage-dot/15',
          open ? 'border-sage-dot ring-3 ring-sage-dot/15' : 'border-line',
        )}
      >
        <span className="min-w-0 flex-1 truncate">{selected.length ? selected[0].label : 'All decks'}</span>
        {selected.length > 1 && (
          <span className="shrink-0 rounded-full bg-field px-1.5 py-px text-chip font-medium text-ink-2 tabular-nums" aria-label={`and ${selected.length - 1} more`}>
            +{selected.length - 1}
          </span>
        )}
        <ChevronDown size={14} strokeWidth={2} aria-hidden className={clsx('shrink-0 text-muted transition-transform', open && 'rotate-180')} />
      </button>

      <div
        ref={panelRef}
        id={popoverId}
        popover="auto"
        className="fixed inset-auto m-0 overflow-visible border-0 bg-transparent p-0 text-ink open:animate-fade-in"
      >
        {open && <DeckPickerPanel decks={decks} value={value} onChange={onChange} unit={unit} onDone={() => panelRef.current?.hidePopover()} />}
      </div>
    </>
  )
}

/** The search field, "All decks", a box to tick for each deck, and a footer with the total. */
function DeckPickerPanel({ decks, value, onChange, unit, onDone }: { decks: DeckTab[]; value: string[]; onChange: (ids: string[]) => void; unit: string; onDone: () => void }) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const listId = useId()
  const matches = filterByLabel(decks, query)
  // "All decks" leads the list until you search.
  const rows: (DeckTab | null)[] = query.trim() ? matches : [null, ...matches]
  const activeIndex = Math.min(active, Math.max(0, rows.length - 1))
  const selected = decks.filter((d) => value.includes(d.value))
  const total = (selected.length ? selected : decks).reduce((sum, d) => sum + d.count, 0)

  useEffect(() => {
    document.getElementById(`${listId}-${activeIndex}`)?.scrollIntoView({ block: 'nearest' })
  }, [listId, activeIndex])

  const choose = (row: DeckTab | null) => onChange(row ? toggleId(value, row.value) : [])

  const onKeyDown = (e: React.KeyboardEvent) => {
    const last = rows.length - 1
    const moves: Record<string, number> = { ArrowDown: Math.min(activeIndex + 1, last), ArrowUp: Math.max(activeIndex - 1, 0), Home: 0, End: last }
    if (e.key in moves && rows.length > 0) {
      e.preventDefault()
      setActive(moves[e.key])
    } else if (e.key === 'Enter' && rows.length > 0) {
      e.preventDefault()
      choose(rows[activeIndex])
    } else if (e.key === 'Escape') {
      // Close only this panel, not a dialog it sits in.
      e.preventDefault()
      e.stopPropagation()
      onDone()
    }
  }

  return (
    <div className="flex max-h-[inherit] flex-col overflow-hidden rounded-section border border-line bg-main shadow-popup">
      <div className="p-1.5 pb-0">
        <label className="flex h-9 items-center gap-2 rounded-img border border-line bg-field px-2.5 text-muted transition-colors focus-within:border-line-strong">
          <Search size={15} strokeWidth={1.8} aria-hidden />
          <input
            type="text"
            role="combobox"
            aria-expanded
            aria-autocomplete="list"
            aria-controls={listId}
            aria-activedescendant={rows.length > 0 ? `${listId}-${activeIndex}` : undefined}
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

      <div id={listId} role="listbox" aria-label="Decks" aria-multiselectable className="min-h-0 flex-1 scrollbar-none overflow-y-auto p-1.5">
        {rows.length === 0 ? (
          <div className="py-6 text-center text-small text-muted">No deck found.</div>
        ) : (
          rows.map((row, i) => {
            const checked = row ? value.includes(row.value) : value.length === 0
            return (
              <div key={row?.value ?? 'all'}>
                {i === 1 && rows[0] === null && <div aria-hidden className="mx-2.5 my-1.5 border-t border-line" />}
                <div
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={checked}
                  // Keep the focus in the search field.
                  onPointerDown={(e) => e.preventDefault()}
                  onPointerMove={() => i !== activeIndex && setActive(i)}
                  onClick={() => choose(row)}
                  className={clsx(
                    'flex h-9 cursor-pointer items-center gap-2.5 rounded-img border px-2.5 text-small select-none',
                    i === activeIndex ? 'border-line bg-field text-ink' : 'border-transparent text-ink-2',
                  )}
                >
                  <span
                    aria-hidden
                    className={clsx(
                      'flex size-4 shrink-0 items-center justify-center rounded-[5px] border transition-colors',
                      checked ? 'border-sage-dot bg-sage-dot text-on-dark' : 'border-line-strong bg-main',
                    )}
                  >
                    {checked && <Check size={11} strokeWidth={3} />}
                  </span>
                  <span className={clsx('min-w-0 flex-1 truncate', checked && 'font-medium text-ink')}>{row ? row.label : 'All decks'}</span>
                  <span className="text-chip text-muted tabular-nums">{row ? row.count : decks.reduce((sum, d) => sum + d.count, 0)}</span>
                </div>
              </div>
            )
          })
        )}
      </div>

      <div className="flex items-center gap-3 border-t border-line bg-soft py-2 pr-2 pl-3.5 text-chip text-muted">
        <span className="min-w-0 flex-1 truncate tabular-nums" aria-live="polite">
          {selected.length ? count(selected.length, 'deck') : 'All decks'} · {count(total, unit)}
        </span>
        {selected.length > 0 && (
          <button type="button" onClick={() => onChange([])} className="rounded-img px-2 py-1 text-small text-ink-2 transition-colors hover:bg-field hover:text-ink">
            Clear
          </button>
        )}
        <button type="button" onClick={onDone} className="rounded-img bg-button-dark px-3 py-1 text-small font-medium text-on-dark transition-colors hover:bg-button-dark-hover">
          Done
        </button>
      </div>
    </div>
  )
}
