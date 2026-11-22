/*
 * Which pages the phone puts where, shared by the web's phone layout (src/app/layout/nav.ts) and the
 * Android app. Plain ids: each app keeps its own page objects.
 */

/** The phone's bottom bar, in this order: Today, Cards, Stories, Timer. */
export const PHONE_TAB_IDS: readonly string[] = ['today', 'flashcards', 'stories', 'timer']

/** The bottom-bar pages that are on, in bar order. A turned-off page is left out, not replaced. */
export function phoneTabIds(enabledIds: readonly string[]): string[] {
  return PHONE_TAB_IDS.filter((id) => enabledIds.includes(id))
}

/** The menu's pages: every enabled page that is not on the bottom bar, in the order given. */
export function menuIds(enabledIds: readonly string[]): string[] {
  return enabledIds.filter((id) => !PHONE_TAB_IDS.includes(id))
}
