import type { Conjugation, Tense } from '@/db/types'

/*
 * A verb's conjugation, as written on the card. Each tense is one line of six
 * forms in the order ich, du, er/sie/es, wir, ihr, sie:
 *
 *   present: "fahre, fährst, fährt, fahren, fahrt, fahren"
 *
 * A dash (or nothing) marks a form that does not exist ("–, –, regnet, –, –, –"),
 * and a slash gives two right spellings ("fandest/fandst"). Nothing is built
 * by rules: what the card says is the answer.
 */

export type Person = 'ich' | 'du' | 'er' | 'wir' | 'ihr' | 'sie'

export const PERSONS: Person[] = ['ich', 'du', 'er', 'wir', 'ihr', 'sie']
export const TENSES: Tense[] = ['present', 'past', 'perfect']

const DASH = /^[-–—]?$/

function parts(line: string): string[] {
  return line.split(',').map((p) => p.trim())
}

/** The six forms of a tense, each with its spellings, or undefined when the line does not have six. */
export function formsOf(line: string | undefined): (string[] | undefined)[] | undefined {
  if (!line?.trim()) return undefined
  const forms = parts(line)
  if (forms.length !== PERSONS.length) return undefined
  return forms.map((form) => {
    if (DASH.test(form)) return undefined
    const spellings = form.split('/').map((s) => s.trim()).filter(Boolean)
    return spellings.length ? spellings : undefined
  })
}

/** What is wrong with a tense line, for the editor; nothing for a blank line. */
export function tenseProblem(line: string | undefined): string | undefined {
  if (!line?.trim()) return undefined
  const count = parts(line).length
  return count === PERSONS.length ? undefined : `Needs ${PERSONS.length} forms, has ${count}`
}

/** A table from a card, a pack or the AI, tidied: "fahre,fährst" → "fahre, fährst"; empty tenses dropped. */
export function cleanConjugation(raw: unknown): Conjugation | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const table = raw as Record<string, unknown>
  const out: Conjugation = {}
  for (const tense of TENSES) {
    const line = table[tense]
    if (typeof line === 'string' && line.trim()) out[tense] = parts(line).join(', ')
  }
  return Object.keys(out).length ? out : undefined
}

/** A weather verb has only the es form: "es regnet". */
export function isImpersonal(conjugation: Conjugation): boolean {
  const tables = TENSES.map((t) => formsOf(conjugation[t])).filter((f) => !!f)
  return tables.length > 0 && tables.every((forms) => forms.every((form, i) => (PERSONS[i] === 'er') === !!form))
}
