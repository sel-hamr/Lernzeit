import type { ChipTone } from '@/components/ui/primitives'
import type { Coverage } from '@/lib/reader'

export function percent(part: number, total: number): number {
  return total ? Math.round((part / total) * 100) : 0
}

/** Share of words in your decks, studied or not. */
function inDeckShare(coverage: Coverage): number {
  return coverage.words ? (coverage.words - coverage.unknown) / coverage.words : 0
}

/**
 * How hard the story is for you now. Reading is easy when you know about 95%
 * of the words, and still good practice from about 85%.
 */
export function difficulty(coverage: Coverage): { label: string; tone: ChipTone } | null {
  if (!coverage.words) return null
  const familiar = (coverage.known + coverage.learning) / coverage.words
  if (familiar >= 0.95) return { label: 'Easy read', tone: 'sage' }
  if (familiar >= 0.85) return { label: 'Good challenge', tone: 'blue' }
  // Names are never in a deck, so this bar sits a little lower.
  if (inDeckShare(coverage) >= 0.8) return { label: 'Study its words first', tone: 'neutral' }
  return { label: 'Hard for now', tone: 'red' }
}
