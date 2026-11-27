import { foldText } from './text'

/**
 * Which tabs of a row show, given each tab's width and the row's `available`
 * width. When they all fit, all show. Otherwise the tabs that fit beside a
 * "More" button (`moreWidth` wide) show, in order, and the rest go in its menu.
 * The `selected` tab always shows, in place of the last tabs that fit, and
 * the first tab ("All") is never moved out.
 */
export function fitTabs(widths: readonly number[], available: number, moreWidth: number, selected = -1, gap = 0): number[] {
  const span = (ids: number[]) => ids.reduce((sum, i) => sum + widths[i], 0) + gap * Math.max(0, ids.length - 1)
  const all = widths.map((_, i) => i)
  if (span(all) <= available) return all
  const room = available - moreWidth - gap
  const shown = [0]
  for (const i of all.slice(1)) {
    if (span([...shown, i]) > room) break
    shown.push(i)
  }
  if (selected <= 0 || shown.includes(selected)) return shown
  while (shown.length > 1 && span([...shown, selected]) > room) shown.pop()
  return [...shown, selected]
}

/**
 * The items whose label holds every word of `query`, ignoring case, accents
 * and ß. Labels that start with the query come first, then labels with a word
 * starting with each query word, then the rest, each group in its own order.
 */
export function filterByLabel<T extends { label: string }>(items: readonly T[], query: string): T[] {
  const words = foldText(query).split(/\s+/).filter(Boolean)
  if (words.length === 0) return [...items]
  const ranked = items.flatMap((item) => {
    const label = foldText(item.label)
    if (!words.every((w) => label.includes(w))) return []
    const labelWords = label.split(/[^\p{L}\p{N}]+/u)
    const rank = label.startsWith(words.join(' ')) ? 0 : words.every((w) => labelWords.some((lw) => lw.startsWith(w))) ? 1 : 2
    return [{ item, rank }]
  })
  return ranked.sort((a, b) => a.rank - b.rank).map((r) => r.item)
}

/**
 * Which of `length` items show in a list capped at `limit`: the first ones,
 * with the `selected` item in place of the last when it is further down. A
 * list only one item over the limit shows whole, since a "1 more" row would
 * take the same room as the item.
 */
export function capList(length: number, limit: number, selected = -1): number[] {
  const all = Array.from({ length }, (_, i) => i)
  if (length <= limit + 1) return all
  const shown = all.slice(0, limit)
  if (selected >= limit) shown[limit - 1] = selected
  return shown
}
