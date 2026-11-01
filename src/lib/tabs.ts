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
