import { lazy, Suspense } from 'react'
import { createBrowserRouter, Navigate, Route, RouterProvider, Routes, useLocation } from 'react-router'
import { FeedbackProvider } from '@/components/ui/feedback'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { UIProvider } from './ui'
import { AppShell } from './layout/AppShell'
import { BridgeEngine, ReminderEngine, SessionNoteDialog, ThemeSync, TimerEngine } from './engines'
import { useStarterUpdates } from './useStarterUpdates'
import { TodayPage } from '@/features/today/TodayPage'
import { TimerPage } from '@/features/timer/TimerPage'
import { LibraryPage } from '@/features/flashcards/LibraryPage'

const ReviewPage = lazy(() => import('@/features/flashcards/ReviewPage'))
const HistoryPage = lazy(() => import('@/features/history/HistoryPage'))
const BoardPage = lazy(() => import('@/features/board/BoardPage'))
const StoriesPage = lazy(() => import('@/features/stories/StoriesPage'))
const ReaderPage = lazy(() => import('@/features/stories/ReaderPage'))
const QuestionsPage = lazy(() => import('@/features/questions/QuestionsPage'))
const PracticePage = lazy(() => import('@/features/questions/PracticePage'))
const GrammarPage = lazy(() => import('@/features/grammar/GrammarPage'))
const TopicPage = lazy(() => import('@/features/grammar/TopicPage'))
const GrammarPracticePage = lazy(() => import('@/features/grammar/PracticePage'))
const GrammarReviewPage = lazy(() => import('@/features/grammar/ReviewPage'))
const DocsRoutes = lazy(() => import('@/features/docs/DocsRoutes'))
const SettingsPage = lazy(() => import('@/features/settings/SettingsPage'))

function PageFallback() {
  return <div className="h-40" aria-busy="true" />
}

function Pages() {
  const { pathname } = useLocation()
  return (
    <ErrorBoundary resetKey={pathname}>
      <Suspense fallback={<PageFallback />}>
        <Routes>
          <Route path="/" element={<TodayPage />} />
          <Route path="/timer" element={<TimerPage />} />
          <Route path="/flashcards" element={<LibraryPage />} />
          <Route path="/flashcards/review" element={<ReviewPage />} />
          <Route path="/stories" element={<StoriesPage />} />
          <Route path="/stories/:storyId" element={<ReaderPage />} />
          <Route path="/questions" element={<QuestionsPage />} />
          <Route path="/questions/practice" element={<PracticePage />} />
          <Route path="/grammar" element={<GrammarPage />} />
          <Route path="/grammar/review" element={<GrammarReviewPage />} />
          <Route path="/grammar/:topicId" element={<TopicPage />} />
          <Route path="/grammar/:topicId/practice" element={<GrammarPracticePage />} />
          <Route path="/docs/*" element={<DocsRoutes />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/board" element={<BoardPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  )
}

function Root() {
  return (
    <FeedbackProvider>
      <UIProvider>
        <ThemeSync />
        <TimerEngine />
        <ReminderEngine />
        <BridgeEngine />
        <SessionNoteDialog />
        <AppShell>
          <Pages />
        </AppShell>
      </UIProvider>
    </FeedbackProvider>
  )
}

/** A data router, because only those can stop you leaving a page with unsaved changes. */
const router = createBrowserRouter([{ path: '*', element: <Root /> }])

export function App() {
  useStarterUpdates()
  return <RouterProvider router={router} />
}
