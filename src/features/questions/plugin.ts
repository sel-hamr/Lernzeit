import { lazy } from 'react'
import { MessageCircleQuestionMark } from 'lucide-react'
import { definePlugin } from '@/app/plugin'

export const questionsPlugin = definePlugin({
  id: 'questions',
  label: 'Questions',
  short: 'Q&A',
  icon: MessageCircleQuestionMark,
  path: '/questions',
  description: 'Questions to answer in German.',
  routes: [
    { path: '/questions', page: lazy(() => import('./QuestionsPage')) },
    { path: '/questions/practice', page: lazy(() => import('./PracticePage')) },
  ],
})
