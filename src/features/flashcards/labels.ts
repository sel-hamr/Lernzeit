import type { DeckTab } from './DeckMenu'

/**
 * The phone's deck button: the open deck and its cards, such as "All decks · 898".
 * An unknown deck falls back to the first tab (All); "All" reads "All decks" here.
 */
export function deckButtonLabel(tabs: DeckTab[], value: string): { name: string; count: number; text: string } {
  const tab = tabs.find((t) => t.value === value) ?? tabs[0]
  const name = !tab || tab.value === 'all' ? 'All decks' : tab.label
  const count = tab?.count ?? 0
  return { name, count, text: `${name} · ${count}` }
}

/**
 * "12 done · 1147 left": the cards rated so far and the cards left, the one on screen included.
 * A rated card that comes back in the round stays in "left", so the count never grows on Good.
 */
export function roundProgress(reviewed: number, remaining: number): string {
  return `${reviewed} done · ${remaining} left`
}
