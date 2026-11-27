import { useLayoutEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import { ChevronDown } from 'lucide-react'
import { fitTabs } from '@lernzeit/core/tabs'
import { DeckMenu, type DeckTab } from './DeckMenu'
import { deckButtonLabel } from './labels'

export type { DeckTab }

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

/**
 * The Flashcards deck tabs. The bar fills its row; the decks that fit show as
 * tabs and the rest go in a "3 more" button at its end, which opens them in a
 * centred search menu, so any number of decks
 * keeps to one line. The open deck always shows as a tab.
 * Phones get one button with the open deck instead, which opens every deck in that menu as a sheet.
 */
export function DeckTabs({ tabs, value, onChange }: { tabs: DeckTab[]; value: string; onChange: (value: string) => void }) {
  const barRef = useRef<HTMLDivElement>(null)
  const measureRef = useRef<HTMLDivElement>(null)
  const moreRef = useRef<HTMLButtonElement>(null)
  const phoneRef = useRef<HTMLButtonElement>(null)
  // Each tab's width (measured as if open), the More button's, and the room in the bar.
  const [size, setSize] = useState<{ widths: number[]; more: number; available: number } | null>(null)
  const [open, setOpen] = useState(false)
  const [phoneOpen, setPhoneOpen] = useState(false)

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
    setPhoneOpen(false)
    onChange(v)
  }
  const current = deckButtonLabel(tabs, value)
  // The sheet lists every deck; All reads as on the button.
  const sheetDecks = tabs.map((t) => (t.value === 'all' ? { ...t, label: 'All decks' } : t))

  return (
    <div className="relative min-w-0 flex-1">
      <button
        ref={phoneRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={phoneOpen}
        aria-label={`Deck: ${current.text}`}
        onClick={() => setPhoneOpen(true)}
        className="flex h-10.5 w-full min-w-0 items-center gap-2 rounded-row bg-field px-3.5 text-small text-ink transition-colors hover:bg-track md:hidden"
      >
        <span className="min-w-0 truncate font-medium">{current.name}</span>
        <span className="shrink-0 text-chip text-muted tabular-nums">· {current.count}</span>
        <ChevronDown size={15} strokeWidth={1.8} aria-hidden className="ml-auto shrink-0 text-muted" />
      </button>

      <div ref={barRef} role="tablist" aria-label="Decks" className="hidden w-full min-w-0 gap-0.5 overflow-hidden rounded-row bg-field p-1 md:flex">
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
            aria-haspopup="dialog"
            aria-expanded={open}
            onClick={() => setOpen(true)}
            className={clsx(tabClass(false), 'ml-auto', open && 'text-ink')}
          >
            {hidden.length} more
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
          <span className={tabClass(false)}>{tabs.length} more</span>
        </div>
      </div>

      {open && hidden.length > 0 && <DeckMenu decks={hidden} anchor={moreRef} onPick={pick} onClose={() => setOpen(false)} />}
      {phoneOpen && <DeckMenu decks={sheetDecks} heading="Decks" current={value} anchor={phoneRef} onPick={pick} onClose={() => setPhoneOpen(false)} />}
    </div>
  )
}
