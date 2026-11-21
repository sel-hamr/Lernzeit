import { useRef, useState, type ReactNode } from 'react'
import { Link, NavLink, useLocation, useNavigate, useSearchParams } from 'react-router'
import clsx from 'clsx'
import { ChevronRight, Cloud, CloudOff, Plus, Search, Settings } from 'lucide-react'
import { Logo, LogoMark } from '@/components/Logo'
import { Dot, GroupLabel } from '@/components/ui/primitives'
import { Dialog } from '@/components/ui/Dialog'
import { useCards, useDecks, usePracticeRuns, useTopics } from '@/data/hooks'
import { useTodayProgress } from '@/data/progress'
import { goalFor } from '@lernzeit/core/goals'
import { formatPracticeTime, practiceTotals } from '@lernzeit/core/practice'
import { capList } from '@lernzeit/core/tabs'
import { formatHM } from '@lernzeit/core/time'
import { useUI } from '@/app/ui'
import { useFeatures } from '@/app/plugins'
import { ACCOUNT_ID } from '@/features/settings/AccountGroup'
import { useSyncStatus } from '@/sync/status'
import { syncIndicator, type StatusLevel, type SyncIndicator } from '@/sync/indicator'
import { DeckMenu } from '@/features/flashcards/DeckMenu'
import { SearchBox } from './Search'
import { HeaderVoiceSelect, SidebarVoiceSelect } from './VoiceSelect'

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
      {/* Lined up with the topic names; counts all of today's time, also on topics without a goal. */}
      <div className="flex flex-col gap-px border-t border-line pt-3 pl-4.5">
        <span className="text-small font-medium">Worked today</span>
        <span className="text-chip text-muted tabular-nums">
          {progress.totalGoal ? `${formatHM(progress.totalDone)} of ${formatHM(progress.totalGoal)} h` : `${formatHM(progress.totalDone)} h`}
        </span>
      </div>
    </div>
  )
}

/** "52 cards · 12 min practised"; the time once the deck has been practised. */
function deckLine(cards: number, practisedMs: number): string {
  return practisedMs ? `${cards} cards · ${formatPracticeTime(practisedMs)} practised` : `${cards} cards`
}

/** How many decks the sidebar lists before the rest go behind "More decks". */
const SIDEBAR_DECKS = 5

function DecksList() {
  const decks = useDecks()
  const topics = useTopics(true)
  const cards = useCards()
  const runs = usePracticeRuns()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const moreRef = useRef<HTMLButtonElement>(null)
  const [moreOpen, setMoreOpen] = useState(false)
  const colorOf = (topicId?: string) => topics.find((t) => t.id === topicId)?.color
  const cardCount = (deckId: string) => cards?.filter((c) => c.deckId === deckId).length ?? 0
  // The open deck always shows, so the list never hides where you are.
  const shown = capList(decks.length, SIDEBAR_DECKS, decks.findIndex((d) => d.id === params.get('deck')))
  const hidden = decks.filter((_, i) => !shown.includes(i))
  return (
    <div className="flex flex-col gap-3 px-3">
      <GroupLabel aside={decks.length}>Decks</GroupLabel>
      {shown.map((i) => {
        const deck = decks[i]
        return (
          <Link key={deck.id} to={`/flashcards?deck=${deck.id}`} title={deck.name} className="group flex min-w-0 gap-2.5">
            <Dot color={colorOf(deck.topicId)} className="mt-1.25" />
            <div className="flex min-w-0 flex-col gap-px">
              <span className="truncate text-small font-medium group-hover:underline">{deck.name}</span>
              <span className="text-chip text-muted tabular-nums">{deckLine(cardCount(deck.id), practiceTotals(runs ?? [], deck.id).ms)}</span>
            </div>
          </Link>
        )
      })}
      {hidden.length > 0 && (
        <button
          ref={moreRef}
          type="button"
          aria-haspopup="dialog"
          aria-expanded={moreOpen}
          onClick={() => setMoreOpen(true)}
          className="group flex items-center gap-1 self-start text-small text-muted transition-colors hover:text-ink"
        >
          {hidden.length} more decks
          <ChevronRight size={14} strokeWidth={1.8} aria-hidden className="transition-transform group-hover:translate-x-0.5" />
        </button>
      )}
      {moreOpen && hidden.length > 0 && (
        <DeckMenu
          decks={hidden.map((d) => ({ value: d.id, label: d.name, count: cardCount(d.id) }))}
          anchor={moreRef}
          onPick={(id) => {
            setMoreOpen(false)
            navigate(`/flashcards?deck=${id}`)
          }}
          onClose={() => setMoreOpen(false)}
        />
      )}
    </div>
  )
}

const LEVEL_DOT: Record<StatusLevel, string> = { ok: 'bg-sage-dot', idle: 'bg-line-strong', waiting: 'bg-muted', error: 'bg-red-ink' }

const ACCOUNT_SETTINGS = `/settings#${ACCOUNT_ID}`

function useSyncIndicator(): SyncIndicator {
  return syncIndicator(useSyncStatus())
}

/** Whether the library is in step with the cloud, and what waits; the reason on hover. */
function SyncRow() {
  const sync = useSyncIndicator()
  const Icon = sync.level === 'ok' ? Cloud : CloudOff
  return (
    <Link to={ACCOUNT_SETTINGS} title={sync.hint ?? sync.label} className="flex h-9 items-center gap-2.5 rounded-img px-3 text-small text-ink-2 transition-colors hover:bg-main/60 hover:text-ink">
      <Icon size={16} strokeWidth={1.7} aria-hidden />
      <span className="flex-1">Sync</span>
      <span className="flex min-w-0 items-center gap-1.5 text-chip text-muted">
        <span className={clsx('size-1.5 shrink-0 rounded-full', LEVEL_DOT[sync.level])} />
        <span className="truncate">{sync.label}</span>
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
  const { openQuickAdd } = useUI()
  const features = useFeatures()
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
        {features.map(({ id, path, label, icon: Icon, badge: Badge }) => (
          <NavLink
            key={id}
            to={path}
            end={path === '/'}
            className={({ isActive }) =>
              clsx(
                'flex h-10 items-center gap-2.5 rounded-img border px-3 text-body transition-colors',
                isActive ? 'border-line bg-main font-semibold text-ink shadow-nav' : 'border-transparent text-ink-2 hover:bg-main/60 hover:text-ink',
              )
            }
          >
            <Icon size={18} strokeWidth={1.7} aria-hidden />
            <span className="flex-1">{label}</span>
            {Badge && <Badge />}
          </NavLink>
        ))}
      </nav>
      {onFlashcards ? <DecksList /> : <GoalsToday />}
      <div className="mt-auto flex flex-col gap-2">
        <SidebarVoiceSelect />
        <SyncRow />
        <DailyPlan />
      </div>
    </aside>
  )
}

function MobileHeader() {
  const [searchOpen, setSearchOpen] = useState(false)
  const sync = useSyncIndicator()
  const inHeader = useFeatures().filter((f) => f.header)
  // The dot shows sync while it needs a look.
  const syncNeedsLook = sync.level !== 'ok' && !sync.passing
  const settingsLabel = syncNeedsLook ? `Settings, Sync: ${sync.label}` : 'Settings'
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
          aria-label="Search cards, tasks and docs"
          onClick={() => setSearchOpen(true)}
          className="flex size-10 items-center justify-center rounded-full text-ink-2 hover:bg-field"
        >
          <Search size={19} strokeWidth={1.7} />
        </button>
        {inHeader.map(({ id, path, label, icon: Icon }) => (
          <NavLink
            key={id}
            to={path}
            aria-label={label}
            className={({ isActive }) => clsx('flex size-10 items-center justify-center rounded-full hover:bg-field', isActive ? 'bg-field text-ink' : 'text-ink-2')}
          >
            <Icon size={19} strokeWidth={1.7} />
          </NavLink>
        ))}
        <NavLink
          to={syncNeedsLook ? ACCOUNT_SETTINGS : '/settings'}
          aria-label={settingsLabel}
          title={settingsLabel}
          className="relative flex size-10 items-center justify-center rounded-full text-ink-2 hover:bg-field"
        >
          <Settings size={19} strokeWidth={1.7} />
          {syncNeedsLook && <span className={clsx('absolute top-2 right-2 size-2 rounded-full ring-2 ring-sidebar', LEVEL_DOT[sync.level])} />}
        </NavLink>
      </div>
      <Dialog open={searchOpen} onClose={() => setSearchOpen(false)} title="Search">
        <SearchBox inline autoFocus onDone={() => setSearchOpen(false)} />
      </Dialog>
    </header>
  )
}

function BottomNav() {
  const features = useFeatures()
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-30 grid auto-cols-fr grid-flow-col border-t border-line bg-sidebar/95 pb-safe backdrop-blur-md md:hidden"
    >
      {features.filter((f) => !f.header).map(({ id, path, short, icon: Icon }) => (
        <NavLink
          key={id}
          to={path}
          end={path === '/'}
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
