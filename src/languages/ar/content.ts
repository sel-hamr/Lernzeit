import type { PackContent } from '../types'
import { GRAMMAR } from './grammar'
import { QUESTIONS, STORIES } from './texts'
import { CARDS, DECKS } from './words'

export const content: PackContent = {
  decks: DECKS,
  cards: CARDS,
  stories: STORIES,
  questions: QUESTIONS,
  grammar: GRAMMAR,
}
