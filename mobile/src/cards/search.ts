import { germanText } from '@lernzeit/core/german'
import type { Card } from '@lernzeit/core/types'

/** Whether a card matches a search: the English, the German (with its article) or a tag contains it, ignoring case. An empty search matches all. */
export function cardMatches(card: Card, query: string): boolean {
  const q = query.trim().toLowerCase()
  return !q || [card.english, germanText(card), card.german, ...card.tags].some((t) => t.toLowerCase().includes(q))
}
