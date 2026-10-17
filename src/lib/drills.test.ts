import { describe, expect, it } from 'vitest'
import type { Card, DrillStat } from '@/db/types'
import { diffChars } from './answer'
import { checkDrill, drillQuestions, nextStat, pickQuestion, pickRound, requeue, spokenAnswer, type DrillQuestion } from './drills'

type RoundItem = { question: DrillQuestion; attempt: number }

let n = 0
function card(fields: Partial<Card>): Card {
  n++
  return { id: `c${n}`, deckId: 'd1', type: 'word', english: '', german: 'Wort', tags: [], createdAt: n, updatedAt: n, ...fields }
}

/** Always the first choice, so picks are predictable. */
const first = () => 0

const hund = card({ german: 'Hund', gender: 'der', plural: 'die Hunde' })
const apfel = card({ german: 'Apfel', gender: 'der', plural: 'die Äpfel' })
const leute = card({ german: 'Leute', plural: 'die Leute', partOfSpeech: 'noun' })
const fahren = card({
  german: 'fahren',
  verbForms: 'fahren – fuhr – ist gefahren',
  conjugation: {
    present: 'fahre, fährst, fährt, fahren, fahrt, fahren',
    past: 'fuhr, fuhrst, fuhr, fuhren, fuhrt, fuhren',
    perfect: 'bin gefahren, bist gefahren, ist gefahren, sind gefahren, seid gefahren, sind gefahren',
  },
})
const regnen = card({ german: 'regnen', conjugation: { present: '–, –, regnet, –, –, –', past: 'oops, too few' } })

describe('which cards a drill uses', () => {
  it('needs a gender for der / die / das', () => {
    expect(drillQuestions(hund, 'gender')).toEqual([{ kind: 'gender', cardId: hund.id, answer: 'der' }])
    expect(drillQuestions(leute, 'gender')).toEqual([])
    expect(drillQuestions(fahren, 'gender')).toEqual([])
  })

  it('needs a gender and a plural for the plural drill', () => {
    expect(drillQuestions(hund, 'plural')).toEqual([{ kind: 'plural', cardId: hund.id, answer: 'die Hunde' }])
    // A plural-only noun has no singular to ask from.
    expect(drillQuestions(leute, 'plural')).toEqual([])
    expect(drillQuestions(card({ gender: 'das', plural: '–' }), 'plural')).toEqual([])
  })

  it('adds die to a plural written without it', () => {
    expect(drillQuestions(card({ gender: 'das', plural: 'Häuser' }), 'plural')[0]).toMatchObject({ answer: 'die Häuser' })
  })

  it('asks every form written in the conjugation of the card', () => {
    const questions = drillQuestions(fahren, 'verbs')
    expect(questions).toHaveLength(18)
    expect(questions).toContainEqual({ kind: 'verbs', cardId: fahren.id, infinitive: 'fahren', person: 'du', tense: 'present', answers: ['fährst'], impersonal: false })
    // Dashes are not asked, and a line without six forms is skipped.
    expect(drillQuestions(regnen, 'verbs')).toEqual([{ kind: 'verbs', cardId: regnen.id, infinitive: 'regnen', person: 'er', tense: 'present', answers: ['regnet'], impersonal: true }])
  })

  it('never builds verb forms from the word: no conjugation, no verb drill', () => {
    expect(drillQuestions(card({ german: 'gehen', verbForms: 'gehen – ging – ist gegangen' }), 'verbs')).toEqual([])
  })

  it('leaves out sentences and cloze cards', () => {
    expect(drillQuestions(card({ type: 'sentence', gender: 'der' }), 'gender')).toEqual([])
  })
})

describe('picking a question', () => {
  it('picks a tense first, then a person, so each tense comes up as often', () => {
    expect(pickQuestion(fahren, 'verbs', first)).toMatchObject({ tense: 'present', person: 'ich', answers: ['fahre'] })
    expect(pickQuestion(fahren, 'verbs', () => 0.99)).toMatchObject({ tense: 'perfect', person: 'sie', answers: ['sind gefahren'] })
  })

  it('returns nothing when the card does not fit', () => {
    expect(pickQuestion(fahren, 'gender', first)).toBeUndefined()
  })
})

describe('a round', () => {
  const stat = (c: Card, score: number, lastAt: number): DrillStat => ({ id: `${c.id}:gender`, cardId: c.id, drill: 'gender', right: 0, wrong: 0, score, lastAt })

  it('starts with the words you get wrong, then new words, then the rest', () => {
    const [a, b, c, d, e] = [1, 2, 3, 4, 5].map(() => card({ gender: 'die' }))
    const stats = new Map([
      [a.id, stat(a, 0, 100)],
      [b.id, stat(b, 4, 500)],
      [c.id, stat(c, 2, 300)],
      [d.id, stat(d, 0, 50)],
    ])
    expect(pickRound([a, b, c, d, e], 'gender', stats, first).map((x) => x.id)).toEqual([b.id, c.id, e.id, d.id, a.id])
  })

  it('takes only the cards that fit the drill, up to the round size', () => {
    const nouns = Array.from({ length: 30 }, () => card({ gender: 'das' }))
    expect(pickRound([...nouns, fahren], 'gender', new Map(), first, 15)).toHaveLength(15)
    expect(pickRound([fahren, leute], 'gender', new Map(), first)).toEqual([])
  })

  it('brings a wrong answer back a few questions later', () => {
    const items: RoundItem[] = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => ({ question: { kind: 'gender', cardId: id, answer: 'der' }, attempt: 0 }))
    const after = requeue(items, 0)
    expect(after.map((i) => i.question.cardId)).toEqual(['a', 'b', 'c', 'd', 'a', 'e', 'f'])
    expect(after[4].attempt).toBe(1)
    // Near the end it goes last.
    expect(requeue(items, 5).map((i) => i.question.cardId)).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'f'])
  })

  it('stops bringing a word back after two retries', () => {
    const items: RoundItem[] = [{ question: { kind: 'gender', cardId: 'a', answer: 'der' }, attempt: 2 }]
    expect(requeue(items, 0)).toBe(items)
  })
})

describe('checking an answer', () => {
  const plural: DrillQuestion = { kind: 'plural', cardId: apfel.id, answer: 'die Äpfel' }
  const verb = (person: 'ich' | 'du' | 'er', answers: string[]): Extract<DrillQuestion, { kind: 'verbs' }> => ({ kind: 'verbs', cardId: fahren.id, infinitive: 'fahren', person, tense: 'present', answers, impersonal: false })

  it('takes the pressed article for der / die / das', () => {
    const q: DrillQuestion = { kind: 'gender', cardId: hund.id, answer: 'der' }
    expect(checkDrill(q, 'der').correct).toBe(true)
    expect(checkDrill(q, 'das').correct).toBe(false)
  })

  it('takes a plural with or without die', () => {
    expect(checkDrill(plural, 'die Äpfel').check?.verdict).toBe('exact')
    expect(checkDrill(plural, 'Äpfel').check?.verdict).toBe('exact')
    expect(checkDrill(plural, 'äpfel').correct).toBe(true)
    expect(checkDrill(plural, 'Aepfel').correct).toBe(true)
  })

  it('counts a missing umlaut or a singular article as wrong', () => {
    expect(checkDrill(plural, 'Apfel').correct).toBe(false)
    const der = checkDrill(plural, 'der Äpfel')
    expect(der.correct).toBe(false)
    expect(der.check?.notes[0]).toContain('die')
  })

  it('takes a verb form with or without its pronoun', () => {
    expect(checkDrill(verb('du', ['fährst']), 'fährst').correct).toBe(true)
    expect(checkDrill(verb('du', ['fährst']), 'du fährst').check?.verdict).toBe('exact')
    expect(checkDrill(verb('er', ['fährt']), 'sie fährt').correct).toBe(true)
    expect(checkDrill(verb('du', ['fährst']), 'fahrst').correct).toBe(false)
  })

  it('takes either spelling when a form has two', () => {
    const q = verb('du', ['fandest', 'fandst'])
    expect(checkDrill(q, 'fandst').check?.verdict).toBe('exact')
    // A wrong answer is compared with the spelling that is shown.
    expect(checkDrill(q, 'findst').check?.diff).toEqual(diffChars('findst', 'fandest'))
  })

  it('says the whole answer aloud with its pronoun', () => {
    expect(spokenAnswer(verb('er', ['fährt']))).toBe('er fährt')
    expect(spokenAnswer({ ...verb('er', ['regnet']), impersonal: true })).toBe('es regnet')
    expect(spokenAnswer(plural)).toBe('die Äpfel')
  })
})

describe('drill stats', () => {
  it('raises the score by 2 for a wrong answer and lowers it by 1 for a right one', () => {
    const wrong = nextStat(undefined, 'c1', 'plural', false, 1000)
    expect(wrong).toEqual({ id: 'c1:plural', cardId: 'c1', drill: 'plural', right: 0, wrong: 1, score: 2, lastAt: 1000 })
    const right = nextStat(wrong, 'c1', 'plural', true, 2000)
    expect(right).toMatchObject({ right: 1, wrong: 1, score: 1, lastAt: 2000 })
    expect(nextStat(nextStat(right, 'c1', 'plural', true, 3000), 'c1', 'plural', true, 4000).score).toBe(0)
  })
})
