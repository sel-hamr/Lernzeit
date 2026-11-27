/* Marks the card's word in its example sentence, so the back of the card can highlight it (pure, so it is tested). */
import type { Card } from '@lernzeit/core/types'

export interface ExamplePiece {
  text: string
  hit: boolean
}

const ARTICLE = /^(der|die|das|ein|eine|einen|einem|einer|eines)\s+/i
const WORD = /[\p{L}\p{M}]+/gu

/** The stems a sentence's words are matched with: each word of the card (3 letters or more), a verb or plural ending dropped. */
function stems(card: Pick<Card, 'german' | 'plural'>): string[] {
  const words = [card.german, card.plural ?? '']
    .flatMap((w) => w.replace(ARTICLE, '').match(WORD) ?? [])
    .map((w) => w.toLowerCase())
    .filter((w) => w.length >= 3)
  return [...new Set(words.map((w) => (w.length > 4 ? w.replace(/(en|n|e)$/, '') : w)))]
}

/** The sentence cut into pieces, with the card's word (and forms that start like it) marked. */
export function markExample(sentence: string, card: Pick<Card, 'german' | 'plural'>): ExamplePiece[] {
  const keys = stems(card)
  const pieces: ExamplePiece[] = []
  let at = 0
  const push = (text: string, hit: boolean) => {
    if (!text) return
    const last = pieces.at(-1)
    if (last && last.hit === hit) last.text += text
    else pieces.push({ text, hit })
  }
  for (const m of sentence.matchAll(WORD)) {
    const word = m[0]
    const lower = word.toLowerCase()
    const hit = keys.some((k) => lower.startsWith(k) && lower.length <= k.length + 4)
    push(sentence.slice(at, m.index), false)
    push(word, hit)
    at = m.index + word.length
  }
  push(sentence.slice(at), false)
  return pieces
}
