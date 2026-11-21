import { useEffect } from 'react'
import { LoaderCircle } from 'lucide-react'
import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { cancelSignIn, finishMerge, getMergeProgress, runMerge, useMergeProgress } from '@/sync/account'
import { mergeSummaryText } from '@/sync/firstSignIn'

/**
 * Blocks the app while this browser's library goes into the cloud on its first sign-in, then says
 * what was added and folded. A failed merge changed nothing here, so it can run again, or the
 * sign-in can be given up. Opening the app signed in but not yet merged (a closed tab, a failure)
 * starts the merge again.
 */
export function MergeDialog() {
  const progress = useMergeProgress()

  useEffect(() => {
    // A sign-in starts the merge itself; this is for a merge that never finished. Only on opening:
    // after a failure, Try again starts it.
    if (getMergeProgress().state === 'idle') void runMerge()
  }, [])

  const done = progress.state === 'done'
  const failed = progress.state === 'failed'
  return (
    <Dialog
      open
      locked
      // Only the summary closes; while merging there is nothing to go back to.
      onClose={() => done && finishMerge()}
      size="sm"
      title={done ? 'Your library is in the cloud' : failed ? 'The merge did not finish' : 'Signing in'}
      footer={
        done ? (
          <Button variant="primary" onClick={finishMerge}>
            Done
          </Button>
        ) : failed ? (
          <>
            <Button variant="ghost" onClick={() => void cancelSignIn()}>
              Back to sign-in
            </Button>
            <Button variant="primary" onClick={() => void runMerge()}>
              Try again
            </Button>
          </>
        ) : undefined
      }
    >
      {done && progress.summary ? (
        <p className="text-body text-ink-2">{mergeSummaryText(progress.summary)}</p>
      ) : failed ? (
        <div className="flex flex-col gap-2 text-body text-ink-2">
          <p role="alert">{progress.error}</p>
          <p className="text-small text-muted">Nothing in this browser was changed.</p>
        </div>
      ) : (
        <div className="flex items-start gap-3 text-body text-ink-2" aria-live="polite">
          <LoaderCircle size={18} strokeWidth={1.8} aria-hidden className="mt-0.5 shrink-0 animate-spin text-muted" />
          <div className="flex flex-col gap-1">
            <p>Adding this browser's data to your account…</p>
            {progress.step && <p className="text-small text-muted">{progress.step}</p>}
          </div>
        </div>
      )}
    </Dialog>
  )
}
