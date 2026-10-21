import { useState, type ReactNode } from 'react'
import { Link, NavLink, useLocation } from 'react-router'
import clsx from 'clsx'
import { Bot, Plus, Search, Settings } from 'lucide-react'
import { Logo, LogoMark } from '@/components/Logo'
import { Dot, GroupLabel } from '@/components/ui/primitives'
import { Dialog } from '@/components/ui/Dialog'
import { useBridgeIndicator, type StatusLevel } from '@/bridge/status'
import { useCards, useDecks, useStudyQueue, useTopics } from '@/data/hooks'
import { useTodayProgress } from '@/data/progress'
import { goalFor } from '@/lib/goals'
import { formatHM, formatTimer } from '@/lib/time'
import { isPaused, remainingMs, elapsedMs } from '@/lib/timer'
import { useUI } from '@/app/ui'
import { AI_CONNECTION_ID } from '@/features/settings/AiConnectionGroup'
import { NAV } from './nav'
import { SearchBox } from './Search'
import { HeaderVoiceSelect, SidebarVoiceSelect } from './VoiceSelect'

function NavBadge({ count }: { count: number }) {
  if (!count) return null
  return <span className="rounded-full bg-sage px-2 py-0.5 text-chip font-semibold text-sage-ink tabular-nums">{count}</span>
}

function TimerBadge() {
  const { timer, now } = useTodayProgress()
  if (!timer) return null
  const left = remainingMs(timer, now)
  const shown = left ?? elapsedMs(timer, now)
  return (
    <span className={clsx('flex items-center gap-1.5 text-chip font-medium tabular-nums', isPaused(timer) ? 'text-muted' : 'text-sage-ink')}>
      <span className={clsx('size-1.5 rounded-full', isPaused(timer) ? 'bg-muted' : 'bg-sage-dot animate-pulse')} />
      {formatTimer(shown)}
    </span>
  )
}

function GoalsToday() {
  const progress = useTodayProgress()
  return (
    <div className="flex flex-col gap-3 px-3">
      <GroupLabel aside={`${progress.goalsHit} of ${progress.goalCount} done`}>Goals today</GroupLabel>
      {progress.topics.map(({ topic, goal, done }) => (
        <div key={topic.id} className="flex gap-2.5">
          <Dot color={topic.color} className="mt-1.25" />
          <div className="flex flex-col gap-px">
            <span className="text-small font-medium">{topic.name}</span>
            <span className="text-chip text-muted tabular-nums">
              {formatHM(done)} of {formatHM(goal)} h
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}

function DecksList() {
  const decks = useDecks()
  const topics = useTopics(true)
  const cards = useCards()
  const { byDeck } = useStudyQueue()
  const colorOf = (topicId?: string) => topics.find((t) => t.id === topicId)?.color
  return (
    <div className="flex flex-col gap-3 px-3">
      <GroupLabel aside={decks.length}>Decks</GroupLabel>
      {decks.map((deck) => (
        <Link key={deck.id} to={`/flashcards?deck=${deck.id}`} className="group flex gap-2.5">
          <Dot color={colorOf(deck.topicId)} className="mt-1.25" />
          <div className="flex flex-col gap-px">
            <span className="text-small font-medium group-hover:underline">{deck.name}</span>
            <span className="text-chip text-muted tabular-nums">
              {cards?.filter((c) => c.deckId === deck.id).length ?? 0} cards · {byDeck.get(deck.id) ?? 0} due
            </span>
          </div>
        </Link>
      ))}
    </div>
  )
}

const LEVEL_DOT: Record<StatusLevel, string> = { ok: 'bg-sage-dot', idle: 'bg-line-strong', waiting: 'bg-muted', error: 'bg-red-ink' }

const AI_SETTINGS = `/settings#${AI_CONNECTION_ID}`

/** Shown only while AI connection is on, so a glance tells whether the AI can reach this browser. */
function AiStatus() {
  const ai = useBridgeIndicator()
  if (!ai) return null
  return (
    <Link to={AI_SETTINGS} title={ai.hint ?? ai.label} className="flex h-9 items-center gap-2.5 rounded-img px-3 text-small text-ink-2 transition-colors hover:bg-main/60 hover:text-ink">
      <Bot size={16} strokeWidth={1.7} aria-hidden />
      <span className="flex-1">AI</span>
      <span className="flex min-w-0 items-center gap-1.5 text-chip text-muted">
        <span className={clsx('size-1.5 shrink-0 rounded-full', LEVEL_DOT[ai.level])} />
        <span className="truncate">{ai.label}</span>
      </span>
    </Link>
  )
}

function DailyPlan() {
  const topics = useTopics()
  const { today } = useTodayProgress()
  const total = topics.reduce((sum, t) => sum + goalFor(t, today), 0)
  return (
    <div className="flex items-center gap-2.5 border-t border-line px-2 pt-3.5">
      <div className="flex size-8.5 shrink-0 items-center justify-center rounded-full bg-sage text-small font-semibold text-sage-ink">LZ</div>
      <div className="flex min-w-0 flex-1 flex-col gap-px">
        <span className="text-small font-medium">Daily plan</span>
        <span className="text-chip text-muted tabular-nums">{formatHM(total)} h goal today</span>
      </div>
      <NavLink
        to="/settings"
        aria-label="Settings"
        className={({ isActive }) =>
          clsx('flex size-9 items-center justify-center rounded-lg transition-colors hover:bg-field', isActive ? 'bg-main text-ink shadow-nav' : 'text-ink-2')
        }
      >
        <Settings size={18} strokeWidth={1.7} />
      </NavLink>
    </div>
  )
}

function Sidebar() {
  const { pathname } = useLocation()
  const { total } = useStudyQueue()
  const { openQuickAdd } = useUI()
  const onFlashcards = pathname.startsWith('/flashcards')
  return (
    <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col gap-4.5 overflow-y-auto px-3.5 py-5 md:flex">
      <div className="flex items-center justify-between gap-2">
        <Link to="/" aria-label="Lernzeit home" className="rounded-img">
          <Logo />
        </Link>
        {/* On desktop the quick add lives here, so no floating button covers the page. */}
        <button
          type="button"
          onClick={openQuickAdd}
          aria-label="Quick add card"
          title="Quick add card"
          className="flex size-8.5 items-center justify-center rounded-full border border-line bg-main text-ink-2 shadow-nav transition-[border-color,color,scale] hover:border-line-strong hover:text-ink active:scale-95"
        >
          <Plus size={17} strokeWidth={1.9} />
        </button>
      </div>
      <SearchBox />
      <nav aria-label="Main" className="flex flex-col gap-0.5">
        <div className="px-3 pb-1.5 text-chip text-muted">Workspace</div>
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              clsx(
                'flex h-10 items-center gap-2.5 rounded-img border px-3 text-body transition-colors',
                isActive ? 'border-line bg-main font-semibold text-ink shadow-nav' : 'border-transparent text-ink-2 hover:bg-main/60 hover:text-ink',
              )
            }
          >
            <Icon size={18} strokeWidth={1.7} aria-hidden />
            <span className="flex-1">{label}</span>
            {to === '/flashcards' && <NavBadge count={total} />}
            {to === '/timer' && <TimerBadge />}
          </NavLink>
        ))}
      </nav>
      {onFlashcards ? <DecksList /> : <GoalsToday />}
      <div className="mt-auto flex flex-col gap-2">
        <SidebarVoiceSelect />
        <AiStatus />
        <DailyPlan />
      </div>
    </aside>
  )
}

function MobileHeader() {
  const [searchOpen, setSearchOpen] = useState(false)
  const ai = useBridgeIndicator()
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-sidebar/90 px-4 backdrop-blur-md md:hidden">
      <Link to="/" className="flex items-center gap-2" aria-label="Lernzeit home">
        <LogoMark size={24} />
        <span className="text-[18px] font-semibold tracking-[-0.01em]">Lernzeit</span>
      </Link>
      <div className="flex items-center gap-1">
        <HeaderVoiceSelect />
        <button
          type="button"
          aria-label="Search cards and tasks"
          onClick={() => setSearchOpen(true)}
          className="flex size-10 items-center justify-center rounded-full text-ink-2 hover:bg-field"
        >
          <Search size={19} strokeWidth={1.7} />
        </button>
        <NavLink
          to={ai ? AI_SETTINGS : '/settings'}
          aria-label={ai ? `Settings, AI: ${ai.label}` : 'Settings'}
          className="relative flex size-10 items-center justify-center rounded-full text-ink-2 hover:bg-field"
        >
          <Settings size={19} strokeWidth={1.7} />
          {ai && <span className={clsx('absolute top-2 right-2 size-2 rounded-full ring-2 ring-sidebar', LEVEL_DOT[ai.level])} />}
        </NavLink>
      </div>
      <Dialog open={searchOpen} onClose={() => setSearchOpen(false)} title="Search">
        <SearchBox inline autoFocus onDone={() => setSearchOpen(false)} />
      </Dialog>
    </header>
  )
}

function BottomNav() {
  const { total } = useStudyQueue()
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-30 grid auto-cols-fr grid-flow-col border-t border-line bg-sidebar/95 pb-safe backdrop-blur-md md:hidden"
    >
      {NAV.map(({ to, short, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          className={({ isActive }) =>
            clsx('relative flex h-15 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors', isActive ? 'text-ink' : 'text-muted')
          }
        >
          {({ isActive }) => (
            <>
              <span className={clsx('flex h-7 w-12 items-center justify-center rounded-full transition-colors', isActive && 'bg-main shadow-nav ring-1 ring-line')}>
                <Icon size={19} strokeWidth={isActive ? 1.9 : 1.7} />
              </span>
              {short}
              {to === '/flashcards' && total > 0 && (
                <span className="absolute top-1 left-[calc(50%+7px)] min-w-4.5 rounded-full bg-sage-dot px-1 text-center text-[10px] leading-4 font-semibold text-on-dark tabular-nums ring-2 ring-sidebar">
                  {total > 99 ? '99+' : total}
                </span>
              )}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}

function QuickAddButton() {
  const { openQuickAdd } = useUI()
  const { pathname } = useLocation()
  // The review and practice screens have their own controls along the bottom.
  if (pathname.startsWith('/flashcards/review') || pathname.startsWith('/questions/practice') || /^\/grammar\/(review|[^/]+\/practice)/.test(pathname)) return null
  return (
    <button
      type="button"
      onClick={openQuickAdd}
      aria-label="Quick add card"
      title="Quick add card"
      className="fixed right-4 bottom-[calc(76px+env(safe-area-inset-bottom))] z-30 flex size-12 items-center justify-center rounded-full bg-button-dark text-on-dark shadow-popup transition-transform hover:scale-105 active:scale-95 md:hidden"
    >
      <Plus size={22} strokeWidth={2} />
    </button>
  )
}

export function AppShell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  const softPage = pathname.startsWith('/history') || pathname.startsWith('/board')
  return (
    <div className="flex min-h-dvh bg-sidebar">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileHeader />
        <main
          className={clsx(
            'min-w-0 flex-1 border-line px-4 pt-5 pb-[calc(96px+env(safe-area-inset-bottom))] md:border-l md:px-9 md:pt-8 md:pb-10',
            softPage ? 'bg-soft' : 'bg-main',
          )}
        >
          <div key={pathname.split('/')[1]} className="mx-auto flex w-full max-w-320 animate-fade-in flex-col gap-6">
            {children}
          </div>
        </main>
      </div>
      <BottomNav />
      <QuickAddButton />
    </div>
  )
}
