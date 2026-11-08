import { Timer } from 'lucide-react'
import { definePlugin } from '@/app/plugin'
import { TimerPage } from './TimerPage'
import { TimerBadge } from './TimerBadge'

export const timerPlugin = definePlugin({
  id: 'timer',
  label: 'Focus timer',
  short: 'Timer',
  icon: Timer,
  path: '/timer',
  description: 'Countdown, stopwatch and pomodoro for a topic.',
  badge: TimerBadge,
  routes: [{ path: '/timer', page: TimerPage }],
})
