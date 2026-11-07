import type { StoryWord } from '@/db/types'
import { lookupKey, tokenize, type Piece } from './reader'

/*
 * Links teaching notes to the words of a story. A note names its word and
 * copies its sentence rather than giving an offset: AIs miscount offsets, a
 * copied sentence can be checked, and a sentence edited later simply stops
 * matching. Two uses of a word in different sentences get different notes.
 */

/** Offsets of `word` in `text`, as whole words in any case. */
function wordOffsets(text: string, word: string): number[] {
  const key = lookupKey(word.trim())
  return tokenize(text)
    .filter((segment) => segment.key === key)
    .map((segment) => segment.start)
}

/** Single line breaks in a story join into one paragraph, so a copied sentence may hold one. */
const oneLine = (sentence: string) => sentence.trim().replace(/\s+/g, ' ')

/** Where a sentence is in the story, as paragraph and offset. A sentence can appear more than once. */
function sentenceSpots(paragraphs: string[], sentence: string): { paragraph: number; start: number }[] {
  if (!sentence) return []
  return paragraphs.flatMap((text, paragraph) => {
    const spots = []
    for (let start = text.indexOf(sentence); start !== -1; start = text.indexOf(sentence, start + 1)) spots.push({ paragraph, start })
    return spots
  })
}

/** What stops a note from reaching its word, in words an AI can act on; undefined when it fits. */
export function placementProblem(paragraphs: string[], note: Pick<StoryWord, 'word' | 'sentence' | 'alsoTap'>): string | undefined {
  const sentence = oneLine(note.sentence)
  if (!sentenceSpots(paragraphs, sentence).length) return 'The sentence is not in the story. Copy it exactly.'
  const missing = [note.word, ...(note.alsoTap ?? [])].find((word) => !wordOffsets(sentence, word).length)
  return missing === undefined ? undefined : `"${missing}" is not one word of that sentence. Copy one word exactly.`
}

export interface StoryWordIndex {
  /** Notes by paragraph and word offset. */
  placed: Map<string, StoryWord>
  /** The first note on each word, for the same word in a sentence that has no note. */
  byWord: Map<string, StoryWord>
}

const spotKey = (paragraph: number, offset: number) => `${paragraph}:${offset}`

/** Places each note on its words. Notes that no longer fit the text are left out. */
export function indexStoryWords(paragraphs: string[], notes: StoryWord[] = []): StoryWordIndex {
  const placed = new Map<string, StoryWord>()
  const byWord = new Map<string, StoryWord>()
  for (const note of notes) {
    const key = lookupKey(note.word.trim())
    if (!byWord.has(key)) byWord.set(key, note)
    const sentence = oneLine(note.sentence)
    for (const { paragraph, start } of sentenceSpots(paragraphs, sentence)) {
      for (const word of [note.word, ...(note.alsoTap ?? [])]) {
        for (const offset of wordOffsets(sentence, word)) {
          const spot = spotKey(paragraph, start + offset)
          if (!placed.has(spot)) placed.set(spot, note)
        }
      }
    }
  }
  return { placed, byWord }
}

/** A note's dictionary form, with the article for a noun: what to show and what to save as a card. */
export function baseFormText({ baseForm, gender }: StoryWord): string {
  return gender ? `${gender} ${baseForm}` : baseForm
}

export interface StoryWordMatch {
  note: StoryWord
  /** True when the note is about this sentence; false when it is about the same word in another one. */
  here: boolean
}

/** The note for a word of the text. A phrase such as "zu Hause" takes the note on any of its words. */
export function storyWordAt(index: StoryWordIndex, paragraph: number, piece: Pick<Piece, 'text' | 'start'>): StoryWordMatch | undefined {
  for (const segment of tokenize(piece.text)) {
    const note = segment.key && index.placed.get(spotKey(paragraph, piece.start + segment.start))
    if (note) return { note, here: true }
  }
  const note = index.byWord.get(lookupKey(piece.text))
  return note && { note, here: false }
}
