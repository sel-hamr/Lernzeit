import { lazy } from 'react'
import { Kanban } from 'lucide-react'
import { definePlugin } from '@/app/plugin'

export const boardPlugin = definePlugin({
  id: 'board',
  label: 'Board',
  short: 'Board',
  icon: Kanban,
  path: '/board',
  description: 'A task board for your study plans.',
  routes: [{ path: '/board', page: lazy(() => import('./BoardPage')) }],
})
