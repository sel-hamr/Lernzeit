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

/** "12 / 1159": the card on screen and the round's cards. `remaining` counts the card on screen. */
export function roundPosition(reviewed: number, remaining: number): string {
  const total = reviewed + remaining
  return `${Math.min(reviewed + 1, total)} / ${total}`
}
