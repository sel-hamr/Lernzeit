/** Space kept between the box and the window's edges. */
const EDGE = 12
/** Space between the box and its word. */
const GAP = 8
/** A word at the very edge of the window still leaves the box room to scroll. */
const MIN_HEIGHT = 160

export interface NotePlacement {
  left: number
  top: number
  maxHeight: number
  /** The word's centre from the box's corner, so the box grows out of the word. */
  originX: number
  originY: number
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max))

/** Puts the box above its word, centred on it, or below when it fits better there. Never past `window`'s sides; `left` is where its space starts. */
export function placeNote(
  anchor: Pick<DOMRect, 'left' | 'right' | 'top' | 'bottom'>,
  box: { width: number; height: number },
  window: { width: number; height: number; left?: number },
): NotePlacement {
  const above = anchor.top - GAP - EDGE
  const under = window.height - anchor.bottom - GAP - EDGE
  const below = box.height > above && under > above
  const maxHeight = Math.max(below ? under : above, MIN_HEIGHT)
  const height = Math.min(box.height, maxHeight)
  const centre = (anchor.left + anchor.right) / 2
  const start = (window.left ?? 0) + EDGE
  const left = clamp(centre - box.width / 2, start, Math.max(start, window.width - box.width - EDGE))
  return {
    left,
    top: below ? anchor.bottom + GAP : anchor.top - GAP - height,
    maxHeight,
    originX: centre - left,
    originY: below ? -GAP : height + GAP,
  }
}
