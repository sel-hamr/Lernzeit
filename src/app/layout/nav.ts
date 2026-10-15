import { BookOpen, CalendarDays, Copy, House, Kanban, Timer, type LucideIcon } from 'lucide-react'

export interface NavItem {
  to: string
  label: string
  short: string
  icon: LucideIcon
}

export const NAV: NavItem[] = [
  { to: '/', label: 'Today', short: 'Today', icon: House },
  { to: '/timer', label: 'Focus timer', short: 'Timer', icon: Timer },
  { to: '/flashcards', label: 'Flashcards', short: 'Cards', icon: Copy },
  { to: '/stories', label: 'Stories', short: 'Stories', icon: BookOpen },
  { to: '/history', label: 'History', short: 'History', icon: CalendarDays },
  { to: '/board', label: 'Board', short: 'Board', icon: Kanban },
]
