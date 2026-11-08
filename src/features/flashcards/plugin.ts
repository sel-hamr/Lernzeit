import { lazy } from 'react'
import { Copy } from 'lucide-react'
import { definePlugin } from '@/app/plugin'
import { LibraryPage } from './LibraryPage'

export const flashcardsPlugin = definePlugin({
  id: 'flashcards',
  label: 'Flashcards',
  short: 'Cards',
  icon: Copy,
  path: '/flashcards',
  description: 'Decks of words, reviewed with spaced repetition.',
  routes: [
    { path: '/flashcards', page: LibraryPage },
    { path: '/flashcards/review', page: lazy(() => import('./ReviewPage')) },
  ],
})
