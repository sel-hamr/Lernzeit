import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import { ChevronDown, Search } from 'lucide-react'
import { fitTabs } from '@/lib/tabs'

export interface DeckTab {
  value: string
  label: string
  count: number
  due: number
}

const TAB_GAP = 2 // gap-0.5
const PILL_PADDING = 8 // p-1 on both sides

const tabClass = (active: boolean) =>
  clsx(
    'flex h-8.5 shrink-0 items-center gap-1.5 rounded-[9px] px-3.5 text-small whitespace-nowrap transition-[background-color,color,box-shadow] duration-150',
    active ? 'bg-main font-medium text-ink shadow-tab' : 'text-ink-2 hover:text-ink',
  )

function TabContent({ tab }: { tab: DeckTab }) {
  return (
    <>
      {tab.label}
      <span className="text-chip text-muted tabular-nums">{tab.count}</span>
    </>
  )
}

const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss')

/**
 * The Flashcards deck tabs. The bar fills its row; the decks that fit show as
 * tabs and the rest go in a "3 more" menu at its end, so any number of decks
 * keeps to one line. The open deck always shows as a tab.
 */
export function DeckTabs({ tabs, value, onChange }: { tabs: DeckTab[]; value: string; onChange: (value: string) => void }) {
  const barRef = useRef<HTMLDivElement>(null)
  const measureRef = useRef<HTMLDivElement>(null)
  const moreRef = useRef<HTMLButtonElement>(null)
  // Each tab's width (measured as if open), the More button's, and the room in the bar.
  const [size, setSize] = useState<{ widths: number[]; more: number; available: number } | null>(null)
  const [open, setOpen] = useState(false)

  useLayoutEffect(() => {
    const bar = barRef.current
    const measure = measureRef.current
    if (!bar || !measure) return
    const update = () => {
      const items = [...measure.children] as HTMLElement[]
      const more = items.pop()!.offsetWidth
      const widths = items.map((el) => el.offsetWidth)
      const available = bar.clientWidth - PILL_PADDING
      setSize((prev) =>
        prev && prev.more === more && prev.available === available && prev.widths.length === widths.length && prev.widths.every((w, i) => w === widths[i])
          ? prev
          : { widths, more, available },
      )
    }
    update()
    // The measuring row resizes when the font loads or a label changes.
    const observer = new ResizeObserver(update)
    observer.observe(bar)
    observer.observe(measure)
    return () => observer.disconnect()
  }, [tabs])

  const selected = tabs.findIndex((t) => t.value === value)
  const shown = size && size.widths.length === tabs.length ? fitTabs(size.widths, size.available, size.more, selected, TAB_GAP) : tabs.map((_, i) => i)
  const hidden = tabs.filter((_, i) => !shown.includes(i))

  const pick = (v: string) => {
    setOpen(false)
    onChange(v)
  }

  return (
    <div className="relative min-w-0 flex-1">
      <div ref={barRef} role="tablist" aria-label="Decks" className="flex w-full min-w-0 gap-0.5 overflow-hidden rounded-row bg-field p-1">
        {shown.map((i) => {
          const tab = tabs[i]
          return (
            <button key={tab.value} type="button" role="tab" aria-selected={tab.value === value} onClick={() => onChange(tab.value)} className={tabClass(tab.value === value)}>
              <TabContent tab={tab} />
            </button>
          )
        })}
        {hidden.length > 0 && (
          <button
            ref={moreRef}
            type="button"
            aria-haspopup="listbox"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
            className={clsx(tabClass(false), 'ml-auto', open && 'text-ink')}
          >
            {hidden.length} more
            <ChevronDown size={14} strokeWidth={2} aria-hidden className={clsx('transition-transform', open && 'rotate-180')} />
          </button>
        )}
      </div>

      <div aria-hidden className="pointer-events-none invisible absolute h-0 w-0 overflow-hidden">
        <div ref={measureRef} inert className="flex w-max gap-0.5">
          {tabs.map((tab) => (
            <span key={tab.value} className={tabClass(true)}>
              <TabContent tab={tab} />
            </span>
          ))}
          <span className={tabClass(false)}>
            {tabs.length} more
            <ChevronDown size={14} strokeWidth={2} />
          </span>
        </div>
      </div>

      {open && hidden.length > 0 && <DeckMenu tabs={hidden} anchor={moreRef} onPick={pick} onClose={() => setOpen(false)} />}
    </div>
  )
}

/** The decks that did not fit, with a filter for long lists. Arrow keys move, Enter opens, Escape closes. */
function DeckMenu({ tabs, anchor, onPick, onClose }: { tabs: DeckTab[]; anchor: React.RefObject<HTMLButtonElement | null>; onPick: (value: string) => void; onClose: () => void }) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const listId = useId()
  const q = fold(query.trim())
  const matches = q ? tabs.filter((t) => fold(t.label).includes(q)) : tabs
  const activeIndex = Math.min(active, Math.max(0, matches.length - 1))
  const searchable = tabs.length > 6

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node
      if (!ref.current?.contains(target) && !anchor.current?.contains(target)) onClose()
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [anchor, onClose])

  useEffect(() => {
    listRef.current?.children[activeIndex]?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  // Without the filter the list takes the keys itself.
  useEffect(() => {
    if (!searchable) listRef.current?.focus()
  }, [searchable])

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive(Math.min(activeIndex + 1, matches.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive(Math.max(activeIndex - 1, 0))
    } else if (e.key === 'Enter' && matches[activeIndex]) {
      e.preventDefault()
      onPick(matches[activeIndex].value)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
      anchor.current?.focus()
    }
  }

  return (
    <div ref={ref} className="absolute top-[calc(100%+6px)] right-0 z-40 flex w-72 max-w-[calc(100vw-32px)] animate-fade-in flex-col rounded-section border border-line bg-main p-1.5 shadow-popup">
      {searchable && (
        <label className="mb-1 flex h-9 shrink-0 items-center gap-2 rounded-img bg-field px-2.5 text-muted">
          <Search size={14} strokeWidth={1.8} aria-hidden />
          <input
            type="search"
            role="combobox"
            aria-expanded
            aria-controls={listId}
            aria-activedescendant={matches.length ? `${listId}-${activeIndex}` : undefined}
            aria-label="Find a deck"
            placeholder="Find a deck"
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setActive(0)
            }}
            onKeyDown={onKeyDown}
            className="w-full min-w-0 bg-transparent text-small text-ink outline-none"
          />
        </label>
      )}
      <div
        ref={listRef}
        id={listId}
        role="listbox"
        aria-label="More decks"
        tabIndex={searchable ? undefined : -1}
        aria-activedescendant={!searchable && matches.length ? `${listId}-${activeIndex}` : undefined}
        onKeyDown={searchable ? undefined : onKeyDown}
        className="flex max-h-80 flex-col overflow-y-auto outline-none"
      >
        {matches.length === 0 ? (
          <div className="px-2.5 py-3 text-small text-muted">No deck matches “{query.trim()}”.</div>
        ) : (
          matches.map((tab, i) => (
            <button
              key={tab.value}
              id={`${listId}-${i}`}
              type="button"
              role="option"
              tabIndex={-1}
              aria-selected={i === activeIndex}
              onMouseEnter={() => setActive(i)}
              onClick={() => onPick(tab.value)}
              className={clsx('flex min-h-9 w-full shrink-0 items-center gap-2.5 rounded-img px-2.5 py-1.5 text-left text-small transition-colors', i === activeIndex && 'bg-field')}
            >
              <span className="min-w-0 flex-1 truncate">{tab.label}</span>
              {tab.due > 0 && <span className="text-chip text-red-ink tabular-nums">{tab.due} due</span>}
              <span className="w-9 text-right text-chip text-muted tabular-nums">{tab.count}</span>
            </button>
          ))
        )}
      </div>
    </div>
  )
}
