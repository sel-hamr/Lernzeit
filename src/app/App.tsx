import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router'
import { FeedbackProvider } from '@/components/ui/feedback'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { UIProvider } from './ui'
import { AppShell } from './layout/AppShell'
import { BridgeEngine, ReminderEngine, SessionNoteDialog, ThemeSync, TimerEngine } from './engines'
import { useSeed } from './useSeed'
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
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/board" element={<BoardPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  )
}

export function App() {
  const ready = useSeed()
  return (
    <BrowserRouter>
      <FeedbackProvider>
        <UIProvider>
          <ThemeSync />
          {ready && (
            <>
              <TimerEngine />
              <ReminderEngine />
              <BridgeEngine />
              <SessionNoteDialog />
            </>
          )}
          <AppShell>
            {ready ? <Pages /> : <PageFallback />}
          </AppShell>
        </UIProvider>
      </FeedbackProvider>
    </BrowserRouter>
  )
}
