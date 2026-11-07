import { storage } from '@/lib/browser'

/**
 * A hardcoded login for a static site: there is no server to check it. These values ship in the
 * JavaScript anyone can read, so it only keeps out people who don't look. Never use a real password.
 */
const USERNAME = 'lernzeit'
const PASSWORD = 'deutsch-lernen'

/** Kept in this browser, so you stay signed in until you sign out. */
export const SIGNED_IN_KEY = 'lernzeit-signed-in'

export function checkLogin(username: string, password: string): boolean {
  return username.trim() === USERNAME && password === PASSWORD
}

/** Reloads, so the engines that run while signed in (timer, reminders, AI connection) stop too. */
export function signOut() {
  storage.set(SIGNED_IN_KEY, '0')
  window.location.reload()
}
