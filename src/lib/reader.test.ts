import { describe, expect, it } from 'vitest'
import { hideActivity, noteInput, showActivity, startActivity, tickActivity } from './activity'
import {
  alignTranslation,
  annotate,
  buildLexicon,
  cardForms,
  cardKnowledge,
  countWords,
  coverage,
  sentenceAt,
  splitParagraphs,
  tokenize,
  wordStatus,
  type Knowledge,
  type LexCard,
  type Piece,
} from './reader'
import { newFsrs, State } from './srs'

const SECOND = 1000

function card(id: string, german: string, extra: Partial<LexCard> = {}): LexCard {
  return { id, type: 'word', german, ...extra }
}

const formsOf = (c: LexCard) => cardForms(c).map((f) => f.words.join(' '))

/** "Der Hund" -> [["Der", ids], [" ", []], ["Hund", ids]], words only. */
const matches = (pieces: Piece[]) => pieces.filter((p) => p.words).map((p) => [p.text, p.cardIds] as const)

describe('text', () => {
  it('splits paragraphs on empty lines and joins single line breaks', () => {
    expect(splitParagraphs('Anna wohnt\nin Berlin.\r\n\r\n  Sie hat einen Hund.\n\n\n')).toEqual(['Anna wohnt in Berlin.', 'Sie hat einen Hund.'])
  })

  it('lines up a translation only when the paragraphs match', () => {
    expect(alignTranslation('Eins.\n\nZwei.', 'One.\n\nTwo.')).toEqual(['One.', 'Two.'])
    expect(alignTranslation('Eins.\n\nZwei.', 'One. Two.')).toBeNull()
    expect(alignTranslation('Eins.', '  ')).toBeNull()
  })

  it('counts words with umlauts, ß and hyphens as one each', () => {
    expect(countWords('Die große E-Mail kommt später, oder?')).toBe(6)
    expect(countWords('...')).toBe(0)
  })

  it('tokenizes into words and the text between them', () => {
    expect(tokenize('„Hallo“, sagt Jörg.')).toEqual([
      { text: '„', start: 0 },
      { text: 'Hallo', start: 1, key: 'hallo' },
      { text: '“, ', start: 6 },
      { text: 'sagt', start: 9, key: 'sagt' },
      { text: ' ', start: 13 },
      { text: 'Jörg', start: 14, key: 'jörg' },
      { text: '.', start: 18 },
    ])
  })

  it('finds the sentence around a word', () => {
    const p = 'Anna wohnt in Berlin. Sie hat einen Hund! Er heißt Bello'
    expect(sentenceAt(p, p.indexOf('Hund'))).toBe('Sie hat einen Hund!')
    expect(sentenceAt(p, 0)).toBe('Anna wohnt in Berlin.')
    expect(sentenceAt(p, p.indexOf('Bello'))).toBe('Er heißt Bello')
  })
})

describe('card forms', () => {
  it('gives a noun its plural, dative plural and genitive', () => {
    const forms = formsOf(card('hund', 'Hund', { gender: 'der', plural: 'die Hunde', partOfSpeech: 'noun' }))
    expect(forms).toEqual(expect.arrayContaining(['hund', 'hunde', 'hunden', 'hundes']))
  })

  it('conjugates a verb and reads its past forms from the card', () => {
    const forms = formsOf(card('gehen', 'gehen', { partOfSpeech: 'verb', verbForms: 'gehen – ging – ist gegangen' }))
    expect(forms).toEqual(expect.arrayContaining(['gehen', 'gehe', 'gehst', 'geht', 'geh', 'ging', 'gingst', 'gingen', 'gegangen']))
    expect(forms).not.toContain('ist')
  })

  it('knows stem changes, also in verbs built on them', () => {
    expect(formsOf(card('lesen', 'lesen', { partOfSpeech: 'verb' }))).toContain('liest')
    expect(formsOf(card('vergessen', 'vergessen', { partOfSpeech: 'verb' }))).toContain('vergisst')
    expect(formsOf(card('abfahren', 'abfahren', { partOfSpeech: 'verb' }))).toContain('abfährt')
  })

  it('uses only the listed present forms of irregular verbs', () => {
    const forms = formsOf(card('sein', 'sein', { partOfSpeech: 'verb', verbForms: 'sein – war – ist gewesen' }))
    expect(forms).toEqual(expect.arrayContaining(['bin', 'ist', 'sind', 'war', 'warst', 'waren', 'gewesen']))
    // A regular guess would turn "sein" into "seit" (since).
    expect(forms).not.toContain('seit')
  })

  it('keeps one-word verb forms and skips split ones', () => {
    const forms = formsOf(card('aufstehen', 'aufstehen', { partOfSpeech: 'verb', verbForms: 'aufstehen – stand auf – ist aufgestanden' }))
    expect(forms).toContain('aufgestanden')
    expect(forms).not.toContain('stand')
    expect(formsOf(card('freuen', 'sich freuen', { partOfSpeech: 'verb' }))).toEqual(expect.arrayContaining(['sich freuen', 'freuen', 'freut']))
    // "Wir gehen spazieren": the first word of a two-word verb stands for it alone.
    expect(formsOf(card('walk', 'spazieren gehen', { partOfSpeech: 'verb' }))).toEqual(['spazieren gehen', 'spazieren'])
  })

  it('gives personal pronouns their object forms', () => {
    expect(formsOf(card('er', 'er', { partOfSpeech: 'pronoun' }))).toEqual(['er', 'ihn', 'ihm'])
    expect(formsOf(card('Sie', 'Sie', { partOfSpeech: 'pronoun' }))).toEqual(['sie', 'ihnen'])
    // The possessive ihr is not a pronoun card, so it gets no "euch".
    expect(formsOf(card('ihr', 'ihr', { partOfSpeech: 'possessive' }))).not.toContain('euch')
  })

  it('declines adjectives and determiners', () => {
    expect(formsOf(card('gut', 'gut', { partOfSpeech: 'adjective' }))).toEqual(expect.arrayContaining(['gute', 'guten', 'guter']))
    expect(formsOf(card('dunkel', 'dunkel', { partOfSpeech: 'adjective' }))).toContain('dunkle')
    expect(formsOf(card('art', 'der / die / das', { partOfSpeech: 'article' }))).toEqual(['der', 'den', 'dem', 'des', 'die', 'das'])
    expect(formsOf(card('ein', 'ein / eine', { partOfSpeech: 'article' }))).toEqual(expect.arrayContaining(['ein', 'eine', 'einen', 'einem']))
    expect(formsOf(card('unser', 'unser', { partOfSpeech: 'possessive' }))).toContain('unsere')
  })

  it('looks for short sentence cards only, and never for cloze cards', () => {
    expect(formsOf(card('gm', 'Guten Morgen!', { type: 'sentence' }))).toEqual(['guten morgen'])
    expect(formsOf(card('long', 'Wie spät ist es jetzt?', { type: 'sentence' }))).toEqual([])
    expect(formsOf(card('cloze', 'Ich {{gehe}} nach Hause.', { type: 'cloze' }))).toEqual([])
  })
})

describe('other languages', () => {
  /** Only the words that have a card. */
  const found = (text: string, lexicon: ReturnType<typeof buildLexicon>) => matches(annotate(text, lexicon)).filter(([, ids]) => ids.length)

  it('finds a noun written with its article on its own, and with an elided article', () => {
    const lexicon = buildLexicon([
      card('chien', 'le chien', { partOfSpeech: 'noun' }),
      card('ecole', "l'école", { partOfSpeech: 'noun' }),
      card('perro', 'el perro', { partOfSpeech: 'noun' }),
    ])
    expect(found("Mon chien va à l'école avec un chien.", lexicon)).toEqual([
      ['chien', ['chien']],
      ['école', ['ecole']],
      ['chien', ['chien']],
    ])
    expect(found('Los perros y el perro.', lexicon)).toEqual([
      ['perros', ['perro']],
      ['el perro', ['perro']],
    ])
  })

  it('finds Arabic words with ال and the letters written onto them', () => {
    const lexicon = buildLexicon([card('kitab', 'كتاب', { partOfSpeech: 'noun' }), card('shams', 'الشمس', { partOfSpeech: 'noun' })])
    expect(found('الكتاب على الطاولة، وكتاب آخر بالكتاب. الشمس وشمس.', lexicon)).toEqual([
      ['الكتاب', ['kitab']],
      ['وكتاب', ['kitab']],
      ['بالكتاب', ['kitab']],
      ['الشمس', ['shams']],
      ['وشمس', ['shams']],
    ])
  })
})

describe('annotate', () => {
  const lexicon = buildLexicon([
    card('art', 'der / die / das', { partOfSpeech: 'article' }),
    card('hund', 'Hund', { gender: 'der', plural: 'die Hunde' }),
    card('kind', 'Kind', { gender: 'das', plural: 'die Kinder' }),
    card('essen-v', 'essen', { partOfSpeech: 'verb', verbForms: 'essen – aß – hat gegessen' }),
    card('essen-n', 'Essen', { gender: 'das', partOfSpeech: 'noun' }),
    card('haus', 'Haus', { gender: 'das', plural: 'die Häuser' }),
    card('zuhause', 'zu Hause', { partOfSpeech: 'adverb' }),
    card('arbeit', 'Arbeit', { gender: 'die', plural: 'die Arbeiten' }),
    card('arbeiten', 'arbeiten', { partOfSpeech: 'verb' }),
  ])

  it('matches forms, tells nouns from verbs by the capital, and joins phrases', () => {
    const pieces = annotate('Der Hund und die Kinder essen das Essen zu Hause.', lexicon)
    expect(matches(pieces)).toEqual([
      ['Der', ['art']],
      ['Hund', ['hund']],
      ['und', []],
      ['die', ['art']],
      ['Kinder', ['kind']],
      ['essen', ['essen-v']],
      ['das', ['art']],
      ['Essen', ['essen-n']],
      ['zu Hause', ['zuhause']],
    ])
    expect(pieces.find((p) => p.text === 'zu Hause')?.words).toBe(2)
    // Every character is kept, so the text renders exactly as written.
    expect(pieces.map((p) => p.text).join('')).toBe('Der Hund und die Kinder essen das Essen zu Hause.')
  })

  it('keeps both readings of a capital at the start of a sentence', () => {
    expect(matches(annotate('Essen ist gut.', lexicon))[0]).toEqual(['Essen', ['essen-v', 'essen-n']])
  })

  it('prefers a form written on a card over one built from an ending', () => {
    // "Arbeit" is also the bare stem of arbeiten.
    expect(matches(annotate('Arbeit macht Spaß.', lexicon))[0]).toEqual(['Arbeit', ['arbeit']])
  })

  it('reads contractions as their preposition and tells Sie from sie', () => {
    const words = buildLexicon([
      card('in', 'in', { partOfSpeech: 'preposition' }),
      card('sie', 'sie', { partOfSpeech: 'pronoun' }),
      card('Sie', 'Sie', { partOfSpeech: 'pronoun' }),
    ])
    expect(matches(annotate('Sie sind im Park, und sie fragt Sie.', words))).toEqual([
      ['Sie', ['sie', 'Sie']],
      ['sind', []],
      ['im', ['in']],
      ['Park', []],
      ['und', []],
      ['sie', ['sie']],
      ['fragt', []],
      ['Sie', ['Sie']],
    ])
  })

  it('does not join a phrase across punctuation', () => {
    expect(matches(annotate('Ich gehe zu. Hause!', lexicon)).map(([text]) => text)).toEqual(['Ich', 'gehe', 'zu', 'Hause'])
  })
})

describe('knowledge', () => {
  const review = (state: State, scheduledDays = 0) => ({ state, fsrs: { ...newFsrs(0), state, scheduled_days: scheduledDays } })

  it('calls a card new, learning or known', () => {
    expect(cardKnowledge([])).toBe('new')
    expect(cardKnowledge([review(State.New), review(State.New)])).toBe('new')
    expect(cardKnowledge([review(State.New), review(State.Learning)])).toBe('learning')
    expect(cardKnowledge([review(State.Review, 5)])).toBe('learning')
    expect(cardKnowledge([review(State.Relearning), review(State.Review, 30)])).toBe('known')
  })

  it('takes the best status among a word’s cards and counts running words', () => {
    const known: Record<string, Knowledge> = { a: 'new', b: 'known' }
    const statusOf = (p: Piece) => wordStatus(p.cardIds, (id) => known[id])
    expect(statusOf({ text: 'x', start: 0, words: 1, cardIds: ['a', 'b'] })).toBe('known')
    expect(statusOf({ text: 'x', start: 0, words: 1, cardIds: ['c'] })).toBe('new')
    expect(statusOf({ text: 'x', start: 0, words: 1, cardIds: [] })).toBe('unknown')

    const pieces: Piece[] = [
      { text: 'zu Hause', start: 0, words: 2, cardIds: ['b'] },
      { text: ' ', start: 8, words: 0, cardIds: [] },
      { text: 'Hund', start: 9, words: 1, cardIds: ['a'] },
      { text: 'Katze', start: 14, words: 1, cardIds: [] },
    ]
    expect(coverage([pieces], statusOf)).toEqual({ words: 4, known: 2, learning: 0, new: 1, unknown: 1 })
  })
})

describe('activity', () => {
  it('counts time while there was input in the last two minutes', () => {
    let a = startActivity(0)
    a = tickActivity(a, 60 * SECOND)
    expect(a.activeMs).toBe(60 * SECOND)
    // Nothing touched for a while: only the first two minutes count.
    a = tickActivity(a, 200 * SECOND)
    expect(a.activeMs).toBe(120 * SECOND)
    a = noteInput(a, 300 * SECOND)
    expect(a.activeMs).toBe(120 * SECOND)
    a = tickActivity(a, 330 * SECOND)
    expect(a.activeMs).toBe(150 * SECOND)
  })

  it('stops counting while the page is hidden', () => {
    let a = hideActivity(startActivity(0), 10 * SECOND)
    a = tickActivity(a, 500 * SECOND)
    expect(a.activeMs).toBe(10 * SECOND)
    a = tickActivity(showActivity(a, 1000 * SECOND), 1030 * SECOND)
    expect(a.activeMs).toBe(40 * SECOND)
  })
})
