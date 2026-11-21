import { describe, expect, it } from 'vitest'
import { compareWithAnswer, groupBySet, hintWords, lastAnswered, practiceOrder } from './questions'

const q = (id: string, set: string, createdAt: number) => ({ id, set, createdAt })

describe('question sets', () => {
  it('groups by set in the order sets were started, each oldest first', () => {
    const groups = groupBySet([q('c', 'Arbeit', 3), q('a', 'Familie', 1), q('d', 'Familie', 4), q('b', 'Arbeit', 2)])
    expect(groups.map((g) => [g.set, g.questions.map((x) => x.id)])).toEqual([
      ['Familie', ['a', 'd']],
      ['Arbeit', ['b', 'c']],
    ])
  })

  it('practises unanswered questions first, then the ones answered longest ago', () => {
    const questions = [q('a', 'Familie', 1), q('b', 'Arbeit', 2), q('c', 'Familie', 3), q('d', 'Arbeit', 4)]
    const answered = lastAnswered([
      { questionId: 'a', at: 50 },
      { questionId: 'b', at: 10 },
      { questionId: 'a', at: 5 },
    ])
    expect(answered.get('a')).toBe(50)
    expect(practiceOrder(questions, answered).map((x) => x.id)).toEqual(['c', 'd', 'b', 'a'])
    // Nothing answered yet: the list order, set by set.
    expect(practiceOrder(questions, new Map()).map((x) => x.id)).toEqual(['a', 'c', 'b', 'd'])
  })
})

describe('hintWords', () => {
  it('offers the useful words, then the words of your answer shuffled, each once and without punctuation', () => {
    const question = { id: 'question-0006', words: ['Lehrer', 'arbeiten als'], myAnswer: 'Ich bin Softwareentwickler, Lehrer.', suggested: 'Ich bin Arzt.' }
    const words = hintWords(question)
    expect(words.slice(0, 2)).toEqual(['Lehrer', 'arbeiten als'])
    expect([...words.slice(2)].sort()).toEqual(['Ich', 'Softwareentwickler', 'bin'])
    // The same question shuffles the same way every time.
    expect(hintWords(question)).toEqual(words)
  })

  it('falls back to the suggested answer, and offers nothing without any', () => {
    expect([...hintWords({ id: 'a', suggested: 'Ich heiße Anna.' })].sort()).toEqual(['Anna', 'Ich', 'heiße'])
    expect(hintWords({ id: 'a' })).toEqual([])
  })
})

describe('compareWithAnswer', () => {
  const mine = 'Ich bin Softwareentwickler.'

  it('accepts other spacing or punctuation, and names a slip in capitals', () => {
    expect(compareWithAnswer('Ich bin  Softwareentwickler', mine)).toEqual({ kind: 'same' })
    expect(compareWithAnswer('ich bin Softwareentwickler.', mine)).toMatchObject({ kind: 'close', notes: ['Check the capital letters'] })
  })

  it('shows small slips letter by letter', () => {
    const result = compareWithAnswer('Ich bin Software Entwickler.', mine)
    expect(result.kind).toBe('close')
    if (result.kind !== 'close') return
    expect(result.diff.some((p) => p.kind === 'extra')).toBe(true)
    expect(compareWithAnswer('Ich wohne in Munchen.', 'Ich wohne in München.')).toMatchObject({ kind: 'close', notes: ['Watch the umlauts'] })
  })

  it('treats another sentence as a different answer, not a mistake', () => {
    expect(compareWithAnswer('Ich arbeite als Lehrer an einer Schule.', mine)).toEqual({ kind: 'different' })
  })
})
