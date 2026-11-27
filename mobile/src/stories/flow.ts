import type { Piece } from '@lernzeit/core/reader'

/** A run of a paragraph that stays on one line: a word (or phrase) with the punctuation touching it. */
export interface FlowUnit {
  key: number
  pieces: Piece[]
  /** A space follows, so the line may break after it. */
  space: boolean
}

/**
 * Splits a paragraph's pieces into the units the reader lays out word by word: "Samstag." stays
 * together, and a line only breaks where the text has a space. Gaps between words ("." + " " + "„")
 * are split at their spaces, the punctuation going to the word it touches.
 */
export function flowUnits(pieces: readonly Piece[]): FlowUnit[] {
  const units: FlowUnit[] = []
  let current: Piece[] = []
  const close = (space: boolean) => {
    if (current.length) units.push({ key: current[0]!.start, pieces: current, space })
    else if (space && units.length) units[units.length - 1]!.space = true
    current = []
  }
  for (const piece of pieces) {
    if (piece.words) {
      current.push(piece)
      continue
    }
    let offset = piece.start
    for (const part of piece.text.split(/(\s+)/)) {
      if (!part) continue
      if (/^\s+$/.test(part)) close(true)
      else current.push({ text: part, start: offset, words: 0, cardIds: [] })
      offset += part.length
    }
  }
  close(false)
  return units
}
