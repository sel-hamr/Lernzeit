import { lazy, Suspense, useEffect } from 'react'
import { createBrowserRouter, Navigate, Route, RouterProvider, Routes, useLocation } from 'react-router'
import { FeedbackProvider } from '@/components/ui/feedback'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { UIProvider } from './ui'
import { AppShell } from './layout/AppShell'
import { BridgeEngine, ReminderEngine, SessionNoteDialog, ThemeSync, TimerEngine } from './engines'
import { useStarterUpdates } from './useStarterUpdates'
import { StarterDialog } from './StarterDialog'
import { TourEngine } from './Tour'
import { LoginPage } from '@/features/login/LoginPage'
import { MergeDialog } from '@/features/login/MergeDialog'
import { opensApp, startAccountSync, stopAccountSync, useAccount, useMergeProgress } from '@/sync/account'
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

/**
 * The app opens once this browser has an account and its library is in the cloud. That is read
 * from this browser alone, so offline it opens on its own data. A first merge that cannot reach the
 * cloud can be put off: the app then opens on this browser's data, with sync off until it merges.
 */
function Root() {
  const account = useAccount()
  const merge = useMergeProgress()
  const signedIn = opensApp(account, merge)
  const syncs = Boolean(account?.merged)

  useEffect(() => {
    if (!syncs) return
    startAccountSync()
    return stopAccountSync
  }, [syncs])

  // Reading the account takes a moment; showing the sign-in page meanwhile would flash it.
  if (account === undefined) return null
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
            <StarterDialog />
            <TourEngine />
            <AppShell>
              <Pages />
            </AppShell>
          </>
        ) : (
          // Not a route: whatever address you opened is still there once you sign in.
          <>
            <LoginPage />
            {account && <MergeDialog />}
          </>
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
