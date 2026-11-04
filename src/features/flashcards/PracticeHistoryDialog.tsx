import { useMemo, useState } from 'react'
import clsx from 'clsx'
import { History } from 'lucide-react'
import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { TextSelect } from '@/components/ui/form'
import { Dot, EmptyState, StatStrip } from '@/components/ui/primitives'
import { useDecks, useLanguage, usePracticeRuns, useTopics } from '@/data/hooks'
import type { PracticeKind, PracticeRun } from '@/db/types'
import { formatPracticeTime, percentCorrect, practiceTotals, runPart, totalsByDeck } from '@/lib/practice'
import { directionLabel } from '@/lib/srs'
import { formatClock, formatLongDate } from '@/lib/time'

const PAGE = 40

const KIND_LABEL: Record<PracticeKind, string> = {
  due: 'Due cards',
  practice: 'Practice ahead',
  all: 'Whole deck',
  picked: 'Picked cards',
  card: 'One card',
}

/** Every review session in Flashcards: totals, time per deck, and the sessions day by day. */
export function PracticeHistoryDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="Practice history" description="Every practice session, with the time you spent on the cards." size="lg">
      {open && <PracticeHistory />}
    </Dialog>
  )
}

function PracticeHistory() {
  const runs = usePracticeRuns()
  const decks = useDecks()
  const topics = useTopics(true)
  const language = useLanguage()
  const [deckId, setDeckId] = useState('all')
  const [shown, setShown] = useState(PAGE)

  const deckById = useMemo(() => new Map(decks.map((d) => [d.id, d])), [decks])
  const deckName = (id: string) => deckById.get(id)?.name ?? 'Deleted deck'
  const deckColor = (id: string) => topics.find((t) => t.id === deckById.get(id)?.topicId)?.color
  const filter = deckId === 'all' ? undefined : deckId
  const list = useMemo(() => (runs ?? []).filter((r) => runPart(r, filter)), [runs, filter])
  const totals = practiceTotals(list, filter)
  const byDeck = useMemo(() => totalsByDeck(runs ?? []), [runs])

  const days = useMemo(() => {
    const groups: { day: string; runs: PracticeRun[] }[] = []
    for (const run of list.slice(0, shown)) {
      const last = groups.at(-1)
      if (last?.day === run.day) last.runs.push(run)
      else groups.push({ day: run.day, runs: [run] })
    }
    return groups
  }, [list, shown])

  if (!runs) return <div className="h-40" aria-busy="true" />
  if (!runs.length) {
    return (
      <EmptyState icon={<History size={20} strokeWidth={1.6} />} title="No practice yet">
        Each review session is saved here with its time, its decks and how it went.
      </EmptyState>
    )
  }

  const directions = (run: PracticeRun) =>
    run.directions.length ? run.directions.map((d) => directionLabel(d, { learning: language.name, native: language.native.name })).join(', ') : 'Every direction'

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-2">
        <TextSelect label="Deck" value={deckId} onChange={(v) => { setDeckId(v); setShown(PAGE) }} className="-ml-1.5">
          <option value="all">All decks</option>
          {byDeck.map(([id]) => (
            <option key={id} value={id}>
              {deckName(id)}
            </option>
          ))}
        </TextSelect>
      </div>

      <StatStrip
        items={[
          { value: formatPracticeTime(totals.ms), label: 'Time practised' },
          { value: totals.sessions, label: totals.sessions === 1 ? 'Session' : 'Sessions' },
          { value: totals.reviewed, label: totals.reviewed ? `Reviews · ${percentCorrect(totals)} correct` : 'Reviews' },
        ]}
      />

      {!filter && byDeck.length > 1 && (
        <section className="flex flex-col gap-1.5">
          <h3 className="text-small font-medium text-ink-2">By deck</h3>
          <div className="flex flex-col rounded-row border border-line">
            {byDeck.map(([id, t], i) => (
              <button
                key={id}
                type="button"
                onClick={() => setDeckId(id)}
                className={clsx('flex min-h-11 items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-soft', i > 0 && 'border-t border-line')}
              >
                <Dot color={deckColor(id)} />
                <span className="min-w-0 flex-1 truncate text-body">{deckName(id)}</span>
                <span className="shrink-0 text-small text-muted tabular-nums">
                  {t.sessions} {t.sessions === 1 ? 'session' : 'sessions'} · {t.reviewed} reviews · {percentCorrect(t)}
                </span>
                <span className="w-18 shrink-0 text-right text-small font-medium tabular-nums">{formatPracticeTime(t.ms)}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="flex flex-col gap-4">
        {days.map((group) => (
          <div key={group.day} className="flex flex-col gap-1.5">
            <h3 className="text-small font-medium text-ink-2">{formatLongDate(group.day)}</h3>
            <ol className="flex flex-col rounded-row border border-line">
              {group.runs.map((run, i) => {
                const part = runPart(run, filter)!
                const deckIds = Object.keys(run.decks)
                return (
                  <li key={run.id} className={clsx('flex items-start gap-3 px-3 py-2.5', i > 0 && 'border-t border-line')}>
                    <span className="w-24 shrink-0 pt-px text-small text-muted tabular-nums">
                      {formatClock(run.start)}–{formatClock(run.end)}
                    </span>
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="truncate text-body">{deckIds.length > 2 ? `${deckIds.length} decks` : deckIds.map(deckName).join(', ')}</span>
                      <span className="truncate text-chip text-muted">
                        {KIND_LABEL[run.kind]} · {directions(run)}
                      </span>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-0.5">
                      <span className="text-small font-medium tabular-nums">{formatPracticeTime(part.ms)}</span>
                      <span className="text-chip text-muted tabular-nums">
                        {part.reviewed} {part.reviewed === 1 ? 'review' : 'reviews'} · {percentCorrect(part)}
                      </span>
                    </div>
                  </li>
                )
              })}
            </ol>
          </div>
        ))}
        {list.length > shown && (
          <Button variant="outline" className="self-center" onClick={() => setShown((n) => n + PAGE)}>
            Show more ({list.length - shown})
          </Button>
        )}
      </section>
    </div>
  )
}
