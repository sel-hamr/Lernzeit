/*
 * Choosing several decks at once, such as the decks a story takes its words
 * from. No deck chosen means all of them.
 */

/**
 * The deck ids saved under a key. They are kept as a JSON list; an older
 * value is one deck id, or "all" for every deck, so it still reads.
 */
export function parseDeckIds(raw: string | null): string[] {
  if (!raw || raw === 'all') return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed.filter((id): id is string => typeof id === 'string')
  } catch {
    // Not JSON: a single deck id from before several decks could be chosen.
  }
  return [raw]
}

/** `ids` with `id` added, or taken out when it is already there. */
export function toggleId(ids: readonly string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((i) => i !== id) : [...ids, id]
}
