import { lazy } from 'react'
import { BookOpen } from 'lucide-react'
import { definePlugin } from '@/app/plugin'

export const storiesPlugin = definePlugin({
  id: 'stories',
  label: 'Stories',
  short: 'Stories',
  icon: BookOpen,
  path: '/stories',
  description: 'Short texts to read, with notes on the words.',
  routes: [
    { path: '/stories', page: lazy(() => import('./StoriesPage')) },
    { path: '/stories/:storyId', page: lazy(() => import('./ReaderPage')) },
  ],
})
