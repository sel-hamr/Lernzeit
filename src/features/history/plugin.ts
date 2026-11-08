import { lazy } from 'react'
import { CalendarDays } from 'lucide-react'
import { definePlugin } from '@/app/plugin'

export const historyPlugin = definePlugin({
  id: 'history',
  label: 'History',
  short: 'History',
  icon: CalendarDays,
  path: '/history',
  description: 'Your study time by day and week.',
  routes: [{ path: '/history', page: lazy(() => import('./HistoryPage')) }],
})
