import { House } from 'lucide-react'
import { definePlugin } from '@/app/plugin'
import { TodayPage } from './TodayPage'

export const todayPlugin = definePlugin({
  id: 'today',
  label: 'Today',
  short: 'Today',
  icon: House,
  path: '/',
  // The home page, where any unknown address lands.
  required: true,
  routes: [{ path: '/', page: TodayPage }],
})
