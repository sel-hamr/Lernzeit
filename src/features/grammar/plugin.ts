import { lazy } from 'react'
import { BookA } from 'lucide-react'
import { definePlugin } from '@/app/plugin'

export const grammarPlugin = definePlugin({
  id: 'grammar',
  label: 'Grammar',
  short: 'Grammar',
  icon: BookA,
  path: '/grammar',
  description: 'Grammar topics with rules and exercises.',
  routes: [
    { path: '/grammar', page: lazy(() => import('./GrammarPage')) },
    { path: '/grammar/review', page: lazy(() => import('./ReviewPage')) },
    { path: '/grammar/:topicId', page: lazy(() => import('./TopicPage')) },
    { path: '/grammar/:topicId/practice', page: lazy(() => import('./PracticePage')) },
  ],
})
