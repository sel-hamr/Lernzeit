import { lazy, Suspense } from 'react'
import { createBrowserRouter, Navigate, Route, RouterProvider, Routes, useLocation } from 'react-router'
import { FeedbackProvider } from '@/components/ui/feedback'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { UIProvider } from './ui'
import { AppShell } from './layout/AppShell'
import { BridgeEngine, ReminderEngine, SessionNoteDialog, ThemeSync, TimerEngine } from './engines'
import { useStarterUpdates } from './useStarterUpdates'
import { useStoredToggle } from '@/lib/browser'
import { LoginPage } from '@/features/login/LoginPage'
import { SIGNED_IN_KEY } from '@/features/login/login'
import { useFeatures } from './plugins'

const SettingsPage = lazy(() => import('@/features/settings/SettingsPage'))

function PageFallback() {
  return <div className="h-40" aria-busy="true" />
}

function Pages() {
  const { pathname } = useLocation()
  // A feature you turn off loses its routes too, so its addresses go to Today.
  const features = useFeatures()
  return (
    <ErrorBoundary resetKey={pathname}>
      <Suspense fallback={<PageFallback />}>
        <Routes>
          {features.flatMap((feature) => feature.routes.map(({ path, page: Page }) => <Route key={path} path={path} element={<Page />} />))}
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  )
}

function Root() {
  const [signedIn, setSignedIn] = useStoredToggle(SIGNED_IN_KEY, false)
  return (
    <FeedbackProvider>
      <UIProvider>
        <ThemeSync />
        {signedIn ? (
          <>
            <TimerEngine />
            <ReminderEngine />
            <BridgeEngine />
            <SessionNoteDialog />
            <AppShell>
              <Pages />
            </AppShell>
          </>
        ) : (
          // Not a route: whatever address you opened is still there once you sign in.
          <LoginPage onSignIn={() => setSignedIn(true)} />
        )}
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
