import { useDeferredValue, useEffect, useId, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import clsx from 'clsx'
import { ListTodo, Search } from 'lucide-react'
import { db } from '@/db/db'
import type { Card, Task } from '@/db/types'
import { CardImage } from '@/components/CardImage'
import { CardGerman } from '@/components/GermanWord'
import { Kbd, PriorityChip } from '@/components/ui/primitives'
import { wordKind } from '@/lib/german'
import { STATUS_LABEL } from '@/data/tasks'

type Result = { kind: 'card'; card: Card } | { kind: 'task'; task: Task }

function fold(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss')
}

function useSearch(query: string): Result[] {
  const q = fold(query.trim())
  const data = useLiveQuery(async () => {
    if (!q) return { cards: [] as Card[], tasks: [] as Task[] }
    const [cards, tasks] = await Promise.all([db.cards.toArray(), db.tasks.toArray()])
    return { cards, tasks }
  }, [q])
  return useMemo(() => {
    if (!q || !data) return []
    const cardHits = data.cards
      .map((card) => {
        const fields = [card.german, card.english, card.gender ? `${card.gender} ${card.german}` : '', card.plural ?? '', card.exampleDe ?? '', card.exampleEn ?? '', card.tags.join(' ')]
        const main = fold(`${card.german} ${card.english}`)
        const all = fold(fields.join(' '))
        if (!all.includes(q)) return null
        return { card, score: main.startsWith(q) ? 0 : main.includes(q) ? 1 : 2 }
      })
      .filter((x): x is { card: Card; score: number } => !!x)
      .sort((a, b) => a.score - b.score || a.card.german.localeCompare(b.card.german))
      .slice(0, 6)
    const taskHits = data.tasks
      .filter((t) => fold(`${t.title} ${t.description ?? ''}`).includes(q))
      .sort((a, b) => Number(a.status === 'done') - Number(b.status === 'done'))
      .slice(0, 6)
    return [...cardHits.map(({ card }) => ({ kind: 'card' as const, card })), ...taskHits.map((task) => ({ kind: 'task' as const, task }))]
  }, [data, q])
}

/** "Search cards, tasks" with a results list. Used in the sidebar (dropdown) and on phones (inline). */
export function SearchBox({ inline = false, autoFocus = false, onDone }: { inline?: boolean; autoFocus?: boolean; onDone?: () => void }) {
  const [query, setQuery] = useState('')
  const deferred = useDeferredValue(query)
  const results = useSearch(deferred)
  const [active, setActive] = useState(0)
  const [focused, setFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()
  const listId = useId()

  useEffect(() => {
    if (inline) return
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (e.key !== '/' || e.metaKey || e.ctrlKey || target.closest('input, textarea, select, [contenteditable="true"]')) return
      e.preventDefault()
      inputRef.current?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [inline])

  const open = (r: Result) => {
    if (r.kind === 'card') navigate(`/flashcards?card=${r.card.id}`)
    else navigate(`/board?task=${r.task.id}`)
    setQuery('')
    inputRef.current?.blur()
    onDone?.()
  }

  const showList = query.trim().length > 0 && (inline || focused)
  const activeIndex = Math.min(active, Math.max(0, results.length - 1))

  return (
    <div className="relative">
      <label className="flex h-10 items-center gap-2 rounded-img border border-line bg-main px-3 text-body text-muted transition-[border-color,box-shadow] hover:border-line-strong focus-within:border-sage-dot focus-within:ring-3 focus-within:ring-sage-dot/15">
        <Search size={16} strokeWidth={1.8} aria-hidden />
        <input
          ref={inputRef}
          type="search"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-label="Search cards and tasks"
          placeholder="Search cards, tasks"
          autoFocus={autoFocus}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setActive(0)
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setActive((i) => Math.min(i + 1, results.length - 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setActive((i) => Math.max(i - 1, 0))
            } else if (e.key === 'Enter' && results[activeIndex]) {
              e.preventDefault()
              open(results[activeIndex])
            } else if (e.key === 'Escape') {
              setQuery('')
              inputRef.current?.blur()
            }
          }}
          className="w-full min-w-0 bg-transparent text-ink outline-none"
        />
        {!inline && !focused && !query && (
          <span title="Press / to search" className="flex shrink-0">
            <Kbd>/</Kbd>
          </span>
        )}
      </label>
      {showList && (
        <div
          id={listId}
          role="listbox"
          className={clsx(
            inline
              ? 'mt-3'
              : 'absolute top-[calc(100%+6px)] left-0 z-40 w-95 max-w-[calc(100vw-32px)] animate-fade-in rounded-section border border-line bg-main p-1.5 shadow-popup',
          )}
        >
          {results.length === 0 ? (
            <div className="px-3 py-4 text-small text-muted">Nothing matches “{query.trim()}”.</div>
          ) : (
            results.map((r, i) => (
              <button
                key={r.kind === 'card' ? r.card.id : r.task.id}
                type="button"
                role="option"
                aria-selected={i === activeIndex}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => open(r)}
                className={clsx(
                  'flex w-full items-center gap-3 rounded-img px-2.5 py-2 text-left transition-colors',
                  i === activeIndex ? 'bg-field' : 'hover:bg-field',
                )}
              >
                {r.kind === 'card' ? (
                  <>
                    <CardImage imageId={r.card.imageId} emoji={r.card.emoji} label={r.card.german} seed={r.card.id} alt="" className="size-9 shrink-0 rounded-lg" placeholder={false} crop />
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-body font-medium">
                        <CardGerman card={r.card} />
                      </span>
                      <span className="truncate text-chip text-muted">
                        {r.card.english} · {wordKind(r.card)}
                      </span>
                    </span>
                  </>
                ) : (
                  <>
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-field text-muted">
                      <ListTodo size={16} strokeWidth={1.7} />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className={clsx('truncate text-body font-medium', r.task.status === 'done' && 'text-muted line-through')}>{r.task.title}</span>
                      <span className="text-chip text-muted">Task · {STATUS_LABEL[r.task.status]}</span>
                    </span>
                    <PriorityChip priority={r.task.priority} />
                  </>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
