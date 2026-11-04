import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import clsx from 'clsx'
import { Check } from 'lucide-react'
import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { useAllReviews, useLanguage } from '@/data/hooks'
import type { Deck, Direction } from '@/db/types'
import { ALL_DIRECTIONS, planHref } from '@/lib/practice'
import { directionLabel } from '@/lib/srs'

/** Practises every card of a deck, or of every deck when `deck` is undefined, in the practice directions you tick. */
export function PractiseDialog({ deck, open, onClose }: { deck?: Deck; open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title={deck ? `Practise ${deck.name}` : 'Practise all decks'} description="Pick the practice directions." size="sm">
      {open && <PractiseForm deck={deck} onClose={onClose} />}
    </Dialog>
  )
}

function PractiseForm({ deck, onClose }: { deck?: Deck; onClose: () => void }) {
  const navigate = useNavigate()
  const reviews = useAllReviews()
  const language = useLanguage()
  const [ticked, setTicked] = useState<ReadonlySet<Direction>>(() => new Set(ALL_DIRECTIONS))

  // Cards per direction. A direction no card practises is left out.
  const counts = useMemo(() => {
    const map = new Map<Direction, number>()
    for (const r of reviews ?? []) if (!deck || r.deckId === deck.id) map.set(r.direction, (map.get(r.direction) ?? 0) + 1)
    return map
  }, [reviews, deck])
  const available = ALL_DIRECTIONS.filter((d) => counts.has(d))
  const directions = available.filter((d) => ticked.has(d))
  const total = directions.reduce((n, d) => n + (counts.get(d) ?? 0), 0)

  const toggle = (d: Direction) =>
    setTicked((set) => {
      const next = new Set(set)
      if (!next.delete(d)) next.add(d)
      return next
    })

  const start = () => {
    navigate(planHref({ deckIds: deck ? [deck.id] : [], directions, scope: 'all' }, available))
    onClose()
  }

  if (!reviews) return <div className="h-40" aria-busy="true" />
  if (!available.length) {
    return (
      <div className="flex flex-col gap-4 pb-1">
        <p className="text-body text-muted">{deck ? 'This deck has no cards yet.' : 'There are no cards yet.'} Add a card to practise it.</p>
        <Button variant="outline" className="self-end" onClick={onClose}>
          Close
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <div role="group" aria-label="Practice directions" className="flex flex-col rounded-row border border-line">
        {available.map((d, i) => {
          const on = ticked.has(d)
          return (
            <button
              key={d}
              type="button"
              role="checkbox"
              aria-checked={on}
              onClick={() => toggle(d)}
              className={clsx('flex min-h-12 items-center gap-3 px-3.5 py-2 text-left transition-colors hover:bg-soft', i > 0 && 'border-t border-line')}
            >
              <span
                aria-hidden
                className={clsx(
                  'flex size-5 shrink-0 items-center justify-center rounded-md border transition-colors',
                  on ? 'border-button-dark bg-button-dark text-on-dark' : 'border-line-strong bg-main',
                )}
              >
                {on && <Check size={13} strokeWidth={2.6} />}
              </span>
              <span className="min-w-0 flex-1 text-body">{directionLabel(d, { learning: language.name, native: language.native.name })}</span>
              <span className="shrink-0 text-chip text-muted tabular-nums">{counts.get(d)} cards</span>
            </button>
          )
        })}
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" disabled={!total} onClick={start}>
          {total ? `Practise ${total} ${total === 1 ? 'question' : 'questions'}` : 'Practise'}
        </Button>
      </div>
    </div>
  )
}
