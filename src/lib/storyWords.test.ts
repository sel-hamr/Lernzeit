import { describe, expect, it } from 'vitest'
import type { StoryWord } from '@/db/types'
import { splitParagraphs } from './reader'
import { indexStoryWords, placementProblem, storyWordAt } from './storyWords'

const paragraphs = splitParagraphs(
  'Lena geht zum Bahnhof. Sie kauft einen Kaffee.\n\nDer Hund sieht die Katze. Die Katze sieht den Hund. Lena steigt schnell ein.',
)

function note(word: string, sentence: string, extra: Partial<StoryWord> = {}): StoryWord {
  return { word, sentence, baseForm: word, partOfSpeech: 'noun', translation: word, meaning: word, tip: word, ...extra }
}

/** The piece for the first `text` from `from` on, as the reader would give it. */
function pieceOf(paragraph: number, text: string, from = 0) {
  return { text, start: paragraphs[paragraph].indexOf(text, from) }
}

describe('placementProblem', () => {
  it('accepts a word in a sentence of the story, in any case and across a line break', () => {
    expect(placementProblem(paragraphs, note('einen', 'Sie kauft einen Kaffee.'))).toBeUndefined()
    expect(placementProblem(paragraphs, note('sie', 'Sie kauft einen Kaffee.'))).toBeUndefined()
    expect(placementProblem(paragraphs, note('einen', 'Sie kauft\neinen Kaffee.'))).toBeUndefined()
  })

  it('says what is wrong with a note that does not fit', () => {
    expect(placementProblem(paragraphs, note('einen', 'Sie kauft ein Kaffee.'))).toContain('not in the story')
    // "ein" is inside "einen", but it is not a word of this sentence.
    expect(placementProblem(paragraphs, note('ein', 'Sie kauft einen Kaffee.'))).toContain('"ein" is not one word')
    expect(placementProblem(paragraphs, note('steigt', 'Lena steigt schnell ein.', { alsoTap: ['auf'] }))).toContain('"auf"')
    expect(placementProblem(paragraphs, note('zu Hause', 'Lena geht zum Bahnhof.'))).toContain('not one word')
  })
})

describe('storyWordAt', () => {
  it('finds a note by its word and sentence', () => {
    const coffee = note('einen', 'Sie kauft einen Kaffee.')
    const index = indexStoryWords(paragraphs, [coffee])
    expect(storyWordAt(index, 0, pieceOf(0, 'einen'))).toEqual({ note: coffee, here: true })
  })

  it('gives the same word its own note in each sentence', () => {
    const subject = note('Katze', 'Die Katze sieht den Hund.')
    const object = note('Katze', 'Der Hund sieht die Katze.')
    const index = indexStoryWords(paragraphs, [subject, object])
    const first = paragraphs[1].indexOf('Katze')
    expect(storyWordAt(index, 1, pieceOf(1, 'Katze'))?.note).toBe(object)
    expect(storyWordAt(index, 1, pieceOf(1, 'Katze', first + 1))?.note).toBe(subject)
  })

  it('finds the right word when the copied sentence has a line break', () => {
    const coffee = note('Kaffee', 'Sie  kauft\neinen Kaffee.')
    const index = indexStoryWords(paragraphs, [coffee])
    expect(storyWordAt(index, 0, pieceOf(0, 'Kaffee'))).toEqual({ note: coffee, here: true })
  })

  it('opens the same note from every word of a split verb', () => {
    const verb = note('steigt', 'Lena steigt schnell ein.', { alsoTap: ['ein'] })
    const index = indexStoryWords(paragraphs, [verb])
    expect(storyWordAt(index, 1, pieceOf(1, 'steigt'))?.note).toBe(verb)
    const ein = paragraphs[1].lastIndexOf('ein')
    expect(storyWordAt(index, 1, { text: 'ein', start: ein })).toEqual({ note: verb, here: true })
    expect(storyWordAt(index, 1, pieceOf(1, 'schnell'))).toBeUndefined()
  })

  it('finds a note on any word of a phrase from a deck', () => {
    const station = note('Bahnhof', 'Lena geht zum Bahnhof.')
    const index = indexStoryWords(paragraphs, [station])
    expect(storyWordAt(index, 0, pieceOf(0, 'zum Bahnhof'))).toEqual({ note: station, here: true })
  })

  it('marks a note from another sentence, and one whose sentence was edited away', () => {
    const coffee = note('Hund', 'Der Hund sieht die Katze.')
    const edited = note('Bahnhof', 'Lena läuft zum Bahnhof.')
    const index = indexStoryWords(paragraphs, [coffee, edited])
    const last = paragraphs[1].lastIndexOf('Hund')
    expect(storyWordAt(index, 1, { text: 'Hund', start: last })).toEqual({ note: coffee, here: false })
    expect(storyWordAt(index, 0, pieceOf(0, 'Bahnhof'))).toEqual({ note: edited, here: false })
  })

  it('finds nothing for a story without notes', () => {
    expect(storyWordAt(indexStoryWords(paragraphs), 0, pieceOf(0, 'Bahnhof'))).toBeUndefined()
  })
})
