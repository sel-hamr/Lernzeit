import { useDeferredValue, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import clsx from 'clsx'
import { Check, Copy, FolderPlus, History, ListChecks, Plus, Search, Settings2, Upload, Volume2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Chip, EmptyState, PageHeader } from '@/components/ui/primitives'
import { TextSelect } from '@/components/ui/form'
import { Dialog } from '@/components/ui/Dialog'
import { CardImage } from '@/components/CardImage'
import { CardGerman } from '@/components/GermanWord'
import { useUI } from '@/app/ui'
import { INCOMPLETE_TAG } from '@/data/cards'
import { useCards, useDecks, useLanguage, useLogsForCard, usePracticeRuns, useSettings, useTopics } from '@/data/hooks'
import type { Card, Deck, Topic } from '@/db/types'
import { useMediaQuery } from '@/lib/browser'
import { GENDER_LABEL, germanText, stripCloze, wordKind } from '@/lib/german'
import { speak, voiceOptions } from '@/data/voice'
import { directionLabel, directionsFor } from '@/lib/srs'
import { pickedState } from '@/lib/picked'
import { formatLastPractised, formatPracticeTime, practiceTotals, type PracticeTotals } from '@/lib/practice'
import { DeckDialog } from './DeckDialog'
import { DeckTabs } from './DeckTabs'
import { ImportCsvDialog } from './ImportCsvDialog'
import { PracticeHistoryDialog } from './PracticeHistoryDialog'
import { PractiseDialog } from './PractiseDialog'
import { deckChipLabel, reviewScore } from './summary'

type SortKey = 'newest' | 'az' | 'incomplete'
const PAGE = 120

/** "52 cards · 12 min practised · Today" */
function deckLine(cards: number, totals: PracticeTotals): string {
  const parts = [`${cards} ${cards === 1 ? 'card' : 'cards'}`]
  parts.push(totals.sessions ? `${formatPracticeTime(totals.ms)} practised · ${formatLastPractised(totals.last)}` : 'Not practised yet')
  return parts.join(' · ')
}

/** A card in the grid. In select mode (`picking`) a tap ticks it for practice instead of opening it. */
function CardTile({ card, deck, topic, selected, picking, onSelect }: { card: Card; deck?: Deck; topic?: Topic; selected: boolean; picking: boolean; onSelect: () => void }) {
  const incomplete = card.tags.includes(INCOMPLETE_TAG)
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={clsx(
        'relative flex flex-col gap-2.5 rounded-flash border p-1.5 pb-3 text-left transition-colors',
        selected ? (picking ? 'border-sage-border bg-sage/50' : 'border-line-strong bg-sidebar') : 'border-transparent hover:bg-soft',
      )}
    >
      {picking && (
        <span
          aria-hidden
          className={clsx(
            'absolute top-3 left-3 z-1 flex size-6 items-center justify-center rounded-full border transition-colors',
            selected ? 'border-button-dark bg-button-dark text-on-dark' : 'border-line-strong bg-main/90',
          )}
        >
          {selected && <Check size={14} strokeWidth={2.4} />}
        </span>
      )}
      <CardImage imageId={card.imageId} emoji={card.emoji} label={card.german} seed={card.id} alt={card.english} className="h-29.5" />
      <div className="flex min-w-0 flex-col gap-0.5 px-1.5">
        <CardGerman card={card} className={clsx('font-semibold', card.type === 'word' ? 'text-[15px]' : 'line-clamp-2 text-small')} />
        <div className="truncate text-small text-muted">
          {card.type === 'word' ? card.english : wordKind(card)}
          {card.type === 'word' && ` · ${wordKind(card)}`}
        </div>
      </div>
      <div className="mt-auto flex px-1.5 text-chip">
        {incomplete ? (
          <Chip tone="neutral" className="px-2 py-0.5">
            Incomplete
          </Chip>
        ) : (
          <Chip tone="topic" color={topic?.color} className="max-w-22.5 truncate px-2 py-0.5 font-normal">
            {deckChipLabel(card, deck)}
          </Chip>
        )}
      </div>
    </button>
  )
}

function CardDetail({ card, deck }: { card: Card; deck?: Deck }) {
  const settings = useSettings()
  const language = useLanguage()
  const logs = useLogsForCard(card.id)
  const navigate = useNavigate()
  const { openCardEditor } = useUI()
  const directions = deck ? directionsFor(card, deck) : []
  const allDirections = card.type === 'cloze' ? (['cloze'] as const) : (['imageToDe', 'enToDe', 'deToEn'] as const)
  const say = () => speak(germanText(card), voiceOptions(settings))

  const rows: [string, React.ReactNode][] = []
  if (card.type === 'word') {
    rows.push([language.native.name, card.english])
    if (card.plural) rows.push(['Plural', card.plural])
    if (card.verbForms) rows.push(['Verb forms', card.verbForms])
    if (card.exampleDe) rows.push(['Example', card.exampleDe])
    if (card.exampleEn) rows.push(['Translation', card.exampleEn])
  } else {
    rows.push([language.native.name, card.english])
  }
  if (card.tags.length) rows.push(['Tags', card.tags.join(', ')])
  rows.push(['Reviews', reviewScore(logs)])

  const kind = card.type === 'word' ? [card.english, wordKind(card) + (card.gender ? `, ${GENDER_LABEL[card.gender]}` : '')].join(' · ') : wordKind(card)

  return (
    <div className="flex flex-col gap-4">
      <CardImage imageId={card.imageId} emoji={card.emoji} label={card.german} seed={card.id} alt={card.english} className="h-47.5" />
      <div className="flex items-start justify-between gap-3 px-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="text-[22px] leading-tight font-semibold tracking-[-0.01em]">
            <CardGerman card={card} />
          </h2>
          <div className="text-small text-muted">{kind}</div>
        </div>
        <Button variant="outline" iconOnly aria-label={`Play ${language.name} audio`} onClick={say}>
          <Volume2 size={18} strokeWidth={1.8} />
        </Button>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2.5 px-2 text-small">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-muted">{label}</dt>
            <dd className="text-right tabular-nums" dir="auto">
              {value}
            </dd>
          </div>
        ))}
      </dl>
      <div className="mx-2 flex flex-col gap-2.5 border-t border-line pt-3.5">
        <div className="text-small font-medium">Practice directions</div>
        <div className="flex flex-wrap gap-1.5">
          {allDirections.map((d) => {
            const on = directions.includes(d)
            return (
              <Chip key={d} tone={on ? 'sage' : 'soft'} className={clsx('py-1', !on && 'font-normal')}>
                {directionLabel(d, { learning: language.name, native: language.native.name })}
              </Chip>
            )
          })}
        </div>
      </div>
      <div className="flex gap-2 px-2">
        <Button variant="outline" className="flex-1" onClick={() => openCardEditor({ cardId: card.id })}>
          Edit card
        </Button>
        <Button variant="primary" className="flex-1" onClick={() => navigate(`/flashcards/review?card=${card.id}`)}>
          Practise card
        </Button>
      </div>
    </div>
  )
}

/** Flashcards: the deck tabs, the open deck's cards, and Practise for that deck or every deck. */
export function LibraryPage() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const { openCardEditor } = useUI()
  const cards = useCards()
  const decks = useDecks()
  const topics = useTopics(true)
  const runs = usePracticeRuns()
  const wide = useMediaQuery('(min-width: 1100px)')
  const [sort, setSort] = useState<SortKey>('newest')
  const [filter, setFilter] = useState('')
  const [shown, setShown] = useState(PAGE)
  const [deckDialog, setDeckDialog] = useState<{ id: string | null } | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [practiseOpen, setPractiseOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  // Select mode: the cards ticked for a round of their own, in the order they were ticked.
  const [picking, setPicking] = useState(false)
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set())
  const deferredFilter = useDeferredValue(filter)

  const deckParam = params.get('deck')
  const deckFilter = decks.some((d) => d.id === deckParam) ? deckParam! : 'all'
  const deckById = useMemo(() => new Map(decks.map((d) => [d.id, d])), [decks])
  const deck = deckById.get(deckFilter)

  const visible = useMemo(() => {
    const q = deferredFilter.trim().toLowerCase()
    const list = (cards ?? []).filter(
      (c) =>
        (deckFilter === 'all' || c.deckId === deckFilter) &&
        (!q || `${c.german} ${c.english} ${c.tags.join(' ')} ${c.plural ?? ''}`.toLowerCase().includes(q)),
    )
    switch (sort) {
      case 'az':
        return list.sort((a, b) => stripCloze(a.german).localeCompare(stripCloze(b.german), 'de'))
      case 'incomplete':
        return list.sort((a, b) => Number(b.tags.includes(INCOMPLETE_TAG)) - Number(a.tags.includes(INCOMPLETE_TAG)) || b.createdAt - a.createdAt)
      default:
        return list.sort((a, b) => b.createdAt - a.createdAt)
    }
  }, [cards, deckFilter, deferredFilter, sort])

  const selectedId = params.get('card')
  const selected = (cards ?? []).find((c) => c.id === selectedId) ?? (wide ? visible[0] : undefined)

  const select = (id: string | null) => {
    const next = new URLSearchParams(params)
    if (id) next.set('card', id)
    else next.delete('card')
    setParams(next, { replace: true })
  }
  const setDeck = (id: string) => {
    const next = new URLSearchParams(params)
    if (id === 'all') next.delete('deck')
    else next.set('deck', id)
    next.delete('card')
    setParams(next, { replace: true })
    setShown(PAGE)
  }

  const total = cards?.length ?? 0
  const countByDeck = useMemo(() => {
    const map = new Map<string, number>()
    for (const c of cards ?? []) map.set(c.deckId, (map.get(c.deckId) ?? 0) + 1)
    return map
  }, [cards])
  const deckOptions = useMemo(
    () => [{ value: 'all', label: 'All', count: total }, ...decks.map((d) => ({ value: d.id, label: d.name, count: countByDeck.get(d.id) ?? 0 }))],
    [decks, countByDeck, total],
  )
  const cardsHere = deck ? (countByDeck.get(deck.id) ?? 0) : total
  const practised = practiceTotals(runs ?? [], deck?.id)
  const subtitle = deck
    ? deckLine(cardsHere, practised)
    : `${total} ${total === 1 ? 'card' : 'cards'} in ${decks.length} ${decks.length === 1 ? 'deck' : 'decks'}${practised.sessions ? ` · ${formatPracticeTime(practised.ms)} practised` : ''}`
  const topicOf = (d?: Deck) => topics.find((t) => t.id === d?.topicId)

  // Picks are kept across decks and filters, so one round can mix them. Deleted cards drop out.
  const pickedHere = useMemo(() => {
    const ids = new Set((cards ?? []).map((c) => c.id))
    return [...picked].filter((id) => ids.has(id))
  }, [picked, cards])
  const allShownPicked = visible.length > 0 && visible.every((c) => picked.has(c.id))
  const togglePick = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev)
      if (!next.delete(id)) next.add(id)
      return next
    })
  const pickShown = () => setPicked((prev) => new Set([...prev, ...visible.map((c) => c.id)]))
  const stopPicking = () => {
    setPicking(false)
    setPicked(new Set())
  }

  return (
    <>
      <PageHeader
        title="Flashcards"
        subtitle={cards && subtitle}
        actions={
          <>
            <Button variant="ghost" iconOnly aria-label="Import cards" title="Import cards (CSV or card pack)" onClick={() => setImportOpen(true)}>
              <Upload size={18} strokeWidth={1.7} />
            </Button>
            <Button variant="ghost" iconOnly aria-label="Practice history" title="Practice history" onClick={() => setHistoryOpen(true)}>
              <History size={18} strokeWidth={1.7} />
            </Button>
            <Button variant="soft" icon={<Plus size={16} strokeWidth={1.8} />} onClick={() => openCardEditor({ deckId: deck?.id })}>
              Add card
            </Button>
            {/* Opens the directions popup for the open deck, or every deck on All. */}
            <Button variant="primary" disabled={!cardsHere} onClick={() => setPractiseOpen(true)}>
              {deck ? 'Practise deck' : 'Practise'}
            </Button>
          </>
        }
      />

      {/* The deck tabs fill a line of their own; below them the filter on the left, sort and select on the right. */}
      <div className="flex flex-col gap-3">
        <div className="flex min-w-0 items-center gap-1.5">
          <DeckTabs value={deckFilter} onChange={setDeck} tabs={deckOptions} />
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            aria-label={deck ? 'Deck settings' : 'New deck'}
            title={deck ? 'Deck settings' : 'New deck'}
            onClick={() => setDeckDialog({ id: deck?.id ?? null })}
          >
            {deck ? <Settings2 size={17} strokeWidth={1.7} /> : <FolderPlus size={17} strokeWidth={1.7} />}
          </Button>
        </div>
        <div className="flex items-center gap-2">
          {/* Same height and fill as the deck tabs above it. */}
          <label className="mr-auto flex h-10.5 min-w-0 flex-1 items-center gap-2 rounded-row border border-transparent bg-field px-3 text-muted transition-[background-color,border-color,box-shadow] hover:bg-track focus-within:border-sage-dot focus-within:bg-main focus-within:ring-3 focus-within:ring-sage-dot/15 sm:w-60 sm:flex-none">
            <Search size={15} strokeWidth={1.8} aria-hidden />
            <input
              type="search"
              aria-label="Filter cards"
              placeholder="Filter"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="w-full min-w-0 bg-transparent text-small text-ink outline-none"
            />
          </label>
          <TextSelect label="Sort cards" value={sort} onChange={(v) => setSort(v as SortKey)}>
            <option value="newest">Newest</option>
            <option value="az">A to Z</option>
            <option value="incomplete">Incomplete first</option>
          </TextSelect>
          <Button
            variant={picking ? 'soft' : 'ghost'}
            size="sm"
            aria-pressed={picking}
            disabled={!total}
            title="Pick the cards to practise"
            icon={<ListChecks size={16} strokeWidth={1.8} />}
            onClick={() => (picking ? stopPicking() : setPicking(true))}
          >
            Select
          </Button>
        </div>
      </div>

      {cards && visible.length === 0 ? (
        <div className="rounded-section border border-line">
          <EmptyState
            icon={<Copy size={20} strokeWidth={1.6} />}
            title={filter ? 'No cards match' : 'No cards here yet'}
            action={
              !filter && (
                <div className="flex gap-2">
                  <Button variant="outline" icon={<Upload size={15} strokeWidth={1.8} />} onClick={() => setImportOpen(true)}>
                    Import cards
                  </Button>
                  <Button variant="soft" icon={<Plus size={16} strokeWidth={1.8} />} onClick={() => openCardEditor({ deckId: deck?.id })}>
                    Add card
                  </Button>
                </div>
              )
            }
          >
            {filter ? 'Try another word.' : 'Add a word with its picture, or import a list from a spreadsheet.'}
          </EmptyState>
        </div>
      ) : (
        <div className="flex flex-wrap items-start gap-6">
          <div className="flex min-w-0 flex-[999_1_480px] flex-col gap-4">
            <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3.5 sm:grid-cols-[repeat(auto-fill,minmax(170px,1fr))]">
              {visible.slice(0, shown).map((card) => (
                <CardTile
                  key={card.id}
                  card={card}
                  deck={deckById.get(card.deckId)}
                  topic={topicOf(deckById.get(card.deckId))}
                  selected={picking ? picked.has(card.id) : selected?.id === card.id}
                  picking={picking}
                  onSelect={() => (picking ? togglePick(card.id) : select(card.id))}
                />
              ))}
            </div>
            {visible.length > shown && (
              <Button variant="outline" className="self-center" onClick={() => setShown((n) => n + PAGE)}>
                Show more ({visible.length - shown})
              </Button>
            )}
          </div>
          {wide && selected && !picking && (
            <section className="sticky top-8 flex min-w-0 flex-[1_1_280px] flex-col rounded-section border border-line bg-main p-2.5 pb-4 shadow-panel">
              <CardDetail card={selected} deck={deckById.get(selected.deckId)} />
            </section>
          )}
        </div>
      )}

      {picking && (
        // Above the phone's quick-add button, which has nothing to do while picking.
        <div className="sticky bottom-[calc(68px+env(safe-area-inset-bottom))] z-40 md:bottom-4 md:z-10">
          <div role="toolbar" aria-label="Picked cards" className="flex flex-col gap-2 rounded-section border border-line bg-main p-2 shadow-panel sm:flex-row sm:items-center sm:bg-main/95 sm:backdrop-blur-sm">
            <div className="flex min-w-0 flex-1 items-center gap-1 pl-2">
              <span className="mr-auto text-small font-medium tabular-nums" aria-live="polite">
                {pickedHere.length ? `${pickedHere.length} ${pickedHere.length === 1 ? 'card' : 'cards'} picked` : 'Tap cards to pick them'}
              </span>
              {!allShownPicked && (
                <Button variant="ghost" size="sm" onClick={pickShown}>
                  Select all {visible.length}
                </Button>
              )}
              {pickedHere.length > 0 && (
                <Button variant="ghost" size="sm" onClick={() => setPicked(new Set())}>
                  Clear
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={stopPicking}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                className="flex-1 sm:flex-none"
                disabled={!pickedHere.length}
                onClick={() => navigate('/flashcards/review', { state: pickedState(pickedHere) })}
              >
                Practise {pickedHere.length || ''}
              </Button>
            </div>
          </div>
        </div>
      )}

      {!wide && (
        <Dialog open={!picking && !!selectedId && !!selected} onClose={() => select(null)} title="Card">
          {selected && <CardDetail card={selected} deck={deckById.get(selected.deckId)} />}
        </Dialog>
      )}
      <DeckDialog open={!!deckDialog} deckId={deckDialog?.id ?? null} onClose={() => setDeckDialog(null)} onCreated={(created) => setDeck(created.id)} />
      <ImportCsvDialog open={importOpen} onClose={() => setImportOpen(false)} defaultDeckId={deck?.id} />
      <PractiseDialog deck={deck} open={practiseOpen} onClose={() => setPractiseOpen(false)} />
      <PracticeHistoryDialog open={historyOpen} onClose={() => setHistoryOpen(false)} />
    </>
  )
}
