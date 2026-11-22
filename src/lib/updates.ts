/**
 * Service worker updates. The worker is registered here (the plugin's own register script is off,
 * see `injectRegister: false` in vite.config.ts) so a deploy shows up promptly:
 * - look for a new worker at start, when the tab becomes visible again and every 30 minutes;
 * - when a new worker takes control (autoUpdate) reload once, so the page matches the new files;
 * - never reload where work could be lost: a practice session, a focused text field, an open
 *   dialog. The reload then waits and happens at the first safe moment (checked every few seconds,
 *   when the tab becomes visible and when a field loses focus).
 * The dev server registers nothing; it serves a removal script at /sw.js instead.
 */

export interface ReloadContext {
  pathname: string
  /** Tag name of document.activeElement, if any. */
  focusedTag: string | null
  focusedEditable: boolean
  dialogOpen: boolean
}

const PRACTICE_ROUTES = [/^\/flashcards\/review/, /^\/questions\/practice/, /^\/grammar\/(review|[^/]+\/practice)/]

/** True when reloading now cannot lose the user's work. */
export function isSafeToReload(ctx: ReloadContext): boolean {
  if (PRACTICE_ROUTES.some((r) => r.test(ctx.pathname))) return false
  if (ctx.dialogOpen) return false
  const tag = (ctx.focusedTag ?? '').toLowerCase()
  if (tag === 'input' || tag === 'textarea' || tag === 'select' || ctx.focusedEditable) return false
  return true
}

function currentContext(): ReloadContext {
  const el = document.activeElement
  return {
    pathname: window.location.pathname,
    focusedTag: el?.tagName ?? null,
    focusedEditable: el instanceof HTMLElement && el.isContentEditable,
    dialogOpen: document.querySelector('dialog[open], [role="dialog"], [aria-modal="true"]') !== null,
  }
}

const CHECK_EVERY = 30 * 60 * 1000
const RETRY_EVERY = 3000

export async function setUpServiceWorkerUpdates(): Promise<void> {
  if (import.meta.env.DEV || !('serviceWorker' in navigator)) return
  const { registerSW } = await import('virtual:pwa-register')

  let registration: ServiceWorkerRegistration | undefined
  const check = () => {
    if (navigator.onLine) void registration?.update().catch(() => {})
  }

  // A controller already present at start means a later controllerchange is an update, not the first install.
  let hadController = navigator.serviceWorker.controller !== null
  let reloadPending = false
  let reloaded = false
  const reloadIfSafe = () => {
    if (!reloadPending || reloaded) return
    if (!isSafeToReload(currentContext())) return
    reloaded = true
    window.location.reload()
  }

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) {
      hadController = true
      return
    }
    reloadPending = true
    reloadIfSafe()
  })

  registerSW({
    immediate: true,
    onRegisteredSW(_url, reg) {
      registration = reg
      check()
      setInterval(check, CHECK_EVERY)
    },
  })

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return
    check()
    reloadIfSafe()
  })
  document.addEventListener('focusout', () => setTimeout(reloadIfSafe, 0))
  setInterval(reloadIfSafe, RETRY_EVERY)
}
