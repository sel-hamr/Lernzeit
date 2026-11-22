import Papa from 'papaparse'
import { cleanConjugation } from './conjugation'
import { splitArticle } from './german'
import type { CardType, Conjugation, Gender } from './types'

export interface CsvRow {
  english: string
  german: string
  gender?: Gender
  plural?: string
  exampleDe?: string
  exampleEn?: string
  tags: string[]
  deck?: string
  type: CardType
  verbForms?: string
  conjugation?: Conjugation
  emoji?: string
}

export interface CsvPreview {
  rows: CsvRow[]
  skipped: { line: number; reason: string }[]
  deckNames: string[]
}

const GENDERS = new Set<string>(['der', 'die', 'das'])

function cell(record: Record<string, string>, ...names: string[]): string {
  for (const name of names) {
    const value = record[name]
    if (value !== undefined && value.trim()) return value.trim()
  }
  return ''
}

/** Reads `english, german, gender, plural, example_de, example_en, tags, deck`. */
export function parseCardsCsv(text: string): CsvPreview {
  const BOM = String.fromCharCode(0xfeff)
  const parsed = Papa.parse<Record<string, string>>(text.startsWith(BOM) ? text.slice(1) : text, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => h.trim().toLowerCase().replace(/[\s-]+/g, '_'),
  })
  const rows: CsvRow[] = []
  const skipped: CsvPreview['skipped'] = []

  parsed.data.forEach((record, i) => {
    const line = i + 2 // header is line 1
    const english = cell(record, 'english', 'en')
    let german = cell(record, 'german', 'de')
    if (!english || !german) {
      skipped.push({ line, reason: 'English and German are required' })
      return
    }
    const rawType = cell(record, 'type').toLowerCase()
    const type: CardType = rawType === 'sentence' || rawType === 'cloze' ? rawType : german.includes('{{') ? 'cloze' : 'word'
    let gender = cell(record, 'gender', 'article').toLowerCase() as Gender | ''
    if (gender && !GENDERS.has(gender)) gender = ''
    if (type === 'word' && !gender) {
      const split = splitArticle(german)
      german = split.word
      gender = split.gender ?? ''
    } else if (type === 'word' && gender) {
      german = splitArticle(german).word
    }
    rows.push({
      english,
      german,
      type,
      gender: gender || undefined,
      plural: cell(record, 'plural') || undefined,
      exampleDe: cell(record, 'example_de', 'example') || undefined,
      exampleEn: cell(record, 'example_en', 'translation') || undefined,
      verbForms: cell(record, 'verb_forms', 'verbforms') || undefined,
      conjugation: cleanConjugation({ present: cell(record, 'present'), past: cell(record, 'past'), perfect: cell(record, 'perfect') }),
      tags: cell(record, 'tags')
        .split(/[;,|]/)
        .map((t) => t.trim())
        .filter(Boolean),
      deck: cell(record, 'deck') || undefined,
      emoji: cell(record, 'emoji') || undefined,
    })
  })

  for (const error of parsed.errors) {
    if (error.row !== undefined) skipped.push({ line: error.row + 2, reason: error.message })
  }
  const deckNames = [...new Set(rows.map((r) => r.deck).filter((d): d is string => !!d))]
  return { rows, skipped, deckNames }
}

