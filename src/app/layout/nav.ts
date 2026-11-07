import { BookA, BookOpen, CalendarDays, Copy, FileText, House, Kanban, MessageCircleQuestionMark, Timer, type LucideIcon } from 'lucide-react'

export interface NavItem {
  to: string
  label: string
  short: string
  icon: LucideIcon
  /** Left off the phone's bottom bar, which fits eight. The phone header links to it instead. */
  header?: boolean
}

export const NAV: NavItem[] = [
  { to: '/', label: 'Today', short: 'Today', icon: House },
  { to: '/timer', label: 'Focus timer', short: 'Timer', icon: Timer },
  { to: '/flashcards', label: 'Flashcards', short: 'Cards', icon: Copy },
  { to: '/grammar', label: 'Grammar', short: 'Grammar', icon: BookA },
  { to: '/stories', label: 'Stories', short: 'Stories', icon: BookOpen },
  { to: '/questions', label: 'Questions', short: 'Q&A', icon: MessageCircleQuestionMark },
  { to: '/docs', label: 'Docs', short: 'Docs', icon: FileText, header: true },
  { to: '/history', label: 'History', short: 'History', icon: CalendarDays },
  { to: '/board', label: 'Board', short: 'Board', icon: Kanban },
]
