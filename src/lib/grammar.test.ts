import { describe, expect, it } from 'vitest'
import type { Card, ExerciseStat, GrammarTopic } from '@/db/types'
import {
  askClaudePrompt,
  buildReviewRound,
  buildTopicRound,
  checkQuestion,
  claudeChatUrl,
  dueExercises,
  exerciseProblem,
  exerciseQuestion,
  filledSentence,
  formatLines,
  groupTopics,
  interleave,
  isKnown,
  levelGroups,
  mergeExercises,
  nextExerciseStat,
  nextTopic,
  parseExercise,
  parseInline,
  parseLine,
  parseLines,
  parseRule,
  pathOrder,
  questionKey,
  REVIEW_DAYS,
  RETRY_MS,
  spokenQuestion,
  topicProgress,
  type ExerciseQuestion,
} from './grammar'
import { DAY } from './time'

const first = () => 0
const NOW = 1_000_000_000_000

function topic(fields: Partial<GrammarTopic>): GrammarTopic {
  return { id: 't1', title: 'Der Dativ', group: 'Cases', rule: '', examples: [], exercises: [], createdAt: 1, updatedAt: 1, ...fields }
}

function stat(id: string, fields: Partial<ExerciseStat> = {}): ExerciseStat {
  return { id, topicId: 't1', right: 1, wrong: 0, score: 0, streak: 1, lastAt: NOW - DAY, due: NOW + DAY, ...fields }
}

const question = (text: string, en?: string, why?: string) => exerciseQuestion('t1', { id: 'e1', text, en, why }, first)!

describe('lines', () => {
  it('reads "German = English // why", one per line', () => {
    expect(parseLines('Ich helfe {{dem}} Mann. = I help the man. // helfen takes the dative.\n\n  Wie geht es dir?  \n')).toEqual([
      { de: 'Ich helfe {{dem}} Mann.', en: 'I help the man.', why: 'helfen takes the dative.' },
      { de: 'Wie geht es dir?' },
    ])
    expect(parseLine('Ich esse. (Perfekt) => Ich habe gegessen. // haben + participle')).toEqual({ de: 'Ich esse. (Perfekt) => Ich habe gegessen.', why: 'haben + participle' })
    expect(formatLines([{ de: 'Hallo', en: 'Hello', why: 'A greeting' }, { text: 'Tschüss' }])).toBe('Hallo = Hello // A greeting\nTschüss')
  })
})

describe('exercise formats', () => {
  it('reads a typed gap and a gap with choices', () => {
    expect(parseExercise('Du {{fandest/fandst}} es.')).toEqual({ type: 'gap', before: 'Du ', after: ' es.', answers: ['fandest', 'fandst'], wrong: [] })
    expect(parseExercise('Ich helfe {{dem|den|der}} Mann.')).toEqual({ type: 'gap', before: 'Ich helfe ', after: ' Mann.', answers: ['dem'], wrong: ['den', 'der'] })
  })

  it('reads a mistake to find', () => {
    expect(parseExercise('Ich helfe {{den>dem}} Mann.')).toEqual({ type: 'mistake', before: 'Ich helfe ', after: ' Mann.', shown: 'den', answers: ['dem'] })
  })

  it('reads words to put in order, with other right orders', () => {
    expect(parseExercise('~ Ich habe gestern Pizza gegessen. / Gestern habe ich Pizza gegessen.')).toEqual({
      type: 'order',
      answers: ['Ich habe gestern Pizza gegessen.', 'Gestern habe ich Pizza gegessen.'],
    })
  })

  it('reads a sentence to write', () => {
    expect(parseExercise('Ich esse Pizza. (Perfekt) => Ich habe Pizza gegessen.')).toEqual({ type: 'write', prompt: 'Ich esse Pizza. (Perfekt)', answers: ['Ich habe Pizza gegessen.'] })
  })

  it('says what is wrong with an exercise line', () => {
    expect(exerciseProblem('Ich helfe dem Mann.')).toBe('Mark the gap like {{this}}, or use ~ or =>')
    expect(exerciseProblem('Ich helfe {{ |den}} Mann.')).toBe('Write the answer inside {{ }}')
    expect(exerciseProblem('~ Hallo')).toBe('Write a sentence of two words or more after ~')
    expect(exerciseProblem('Ich hel{{f>p}}e.')).toBe('Mark a whole word as the mistake')
    expect(exerciseProblem('Ich helfe {{den>dem}} Mann.')).toBeUndefined()
    expect(exerciseProblem('Er {{geht>gehen}}, weil …')).toBeUndefined()
  })

  it('keeps the id of an exercise whose text did not change', () => {
    let n = 0
    const merged = mergeExercises(
      [{ id: 'a', text: 'Ich {{bin}} müde.' }, { id: 'b', text: 'Du {{bist}} da.' }],
      [{ de: 'Du {{bist}} da.', en: 'You are here.', why: 'sein: du bist' }, { de: 'Er {{ist}} hier.' }],
      () => `new-${++n}`,
    )
    expect(merged).toEqual([{ id: 'b', text: 'Du {{bist}} da.', en: 'You are here.', why: 'sein: du bist' }, { id: 'new-1', text: 'Er {{ist}} hier.' }])
  })
})

describe('the rule text', () => {
  it('splits paragraphs, lists, tables and headings', () => {
    const rule = ['The **dative** answers *Wem?*', '', '### Endings', '| | masculine | feminine |', '|---|---|---|', '| Dativ | dem | der |', '', 'Verbs:', '- helfen', '- danken'].join('\n')
    expect(parseRule(rule)).toEqual([
      { type: 'paragraph', text: 'The **dative** answers *Wem?*' },
      { type: 'heading', text: 'Endings' },
      { type: 'table', header: ['', 'masculine', 'feminine'], rows: [['Dativ', 'dem', 'der']] },
      { type: 'paragraph', text: 'Verbs:' },
      { type: 'list', items: ['helfen', 'danken'] },
    ])
  })

  it('marks bold and italic', () => {
    expect(parseInline('Kinder**n** and *Wem?* or ***both***')).toEqual([
      { text: 'Kinder' },
      { text: 'n', bold: true },
      { text: ' and ' },
      { text: 'Wem?', italic: true },
      { text: ' or ' },
      { text: 'both', bold: true, italic: true },
    ])
  })

  it('marks bold inside italic, and leaves markers that do not pair up', () => {
    expect(parseInline('*mit den Kinder**n***, unless')).toEqual([
      { text: 'mit den Kinder', italic: true },
      { text: 'n', bold: true, italic: true },
      { text: ', unless' },
    ])
    expect(parseInline('***Den** Film finde ich gut.*')).toEqual([
      { text: 'Den', bold: true, italic: true },
      { text: ' Film finde ich gut.', italic: true },
    ])
    expect(parseInline('5 * 3 = 15')).toEqual([{ text: '5 * 3 = 15' }])
  })
})

describe('questions', () => {
  it('turns a gap with choices into a question, choices shuffled', () => {
    const q = question('Ich helfe {{dem|den|der}} Mann.', 'I help the man.', 'helfen takes the dative.')
    expect(q).toMatchObject({ kind: 'exercise', exerciseId: 'e1', english: 'I help the man.', why: 'helfen takes the dative.' })
    expect(q.form.type === 'gap' && [...q.form.options!].sort()).toEqual(['dem', 'den', 'der'])
    expect(checkQuestion(q, 'dem').correct).toBe(true)
    expect(checkQuestion(q, 'den').correct).toBe(false)
    expect(filledSentence(q)).toBe('Ich helfe dem Mann.')
    expect(spokenQuestion(q)).toBe('Ich helfe dem Mann.')
    expect(questionKey(q)).toBe('exercise:e1')
  })

  it('checks a typed gap: ue for ü is fine, a missing umlaut is not', () => {
    const q = question('Du {{fährst}} zu schnell.')
    expect(checkQuestion(q, 'fährst').check?.verdict).toBe('exact')
    expect(checkQuestion(q, 'faehrst').correct).toBe(true)
    expect(checkQuestion(q, 'fahrst').correct).toBe(false)
  })

  it('splits a mistake sentence into words to tap', () => {
    const q = question('Gestern {{bin>habe}} ich Pizza gegessen.')
    expect(q.form).toMatchObject({ type: 'mistake', words: ['Gestern', 'bin', 'ich', 'Pizza', 'gegessen.'], wrongIndex: 1 })
    expect(checkQuestion(q, '1').correct).toBe(true)
    expect(checkQuestion(q, '3').correct).toBe(false)
    expect(filledSentence(q)).toBe('Gestern habe ich Pizza gegessen.')
    // Punctuation stays with its word.
    expect(question('Ich helfe {{den>dem}}.').form).toMatchObject({ words: ['Ich', 'helfe', 'den.'], wrongIndex: 2 })
  })

  it('scrambles the words to order and takes any right order, in any case', () => {
    const q = question('~ Ich habe gestern Pizza gegessen. / Gestern habe ich Pizza gegessen.')
    // The other order starts with Gestern, so a capital on Ich would give the start away.
    expect(q.form.type === 'order' && [...q.form.words].sort()).toEqual(['Pizza', 'gegessen', 'gestern', 'habe', 'ich'])
    expect(q.form.type === 'order' && q.form.words.join(' ')).not.toBe('ich habe gestern Pizza gegessen')
    expect(q.form).toMatchObject({ end: '.' })
    expect(checkQuestion(q, 'Ich habe gestern Pizza gegessen').correct).toBe(true)
    expect(checkQuestion(q, 'gestern habe Ich Pizza gegessen').correct).toBe(true)
    expect(checkQuestion(q, 'Ich gestern habe Pizza gegessen').correct).toBe(false)
    // Commas are left off the words, because they move with the order.
    const comma = question('~ Wenn es regnet, bleiben wir zu Hause. / Wir bleiben zu Hause, wenn es regnet.')
    expect(comma.form.type === 'order' && [...comma.form.words].sort()).toEqual(['Hause', 'bleiben', 'es', 'regnet', 'wenn', 'wir', 'zu'])
    expect(checkQuestion(comma, 'wir bleiben zu Hause wenn es regnet').correct).toBe(true)
  })

  it('checks a written sentence like a typed answer', () => {
    const q = question('Ich esse Pizza. (Perfekt) => Ich habe Pizza gegessen. / Ich hab Pizza gegessen.')
    expect(checkQuestion(q, 'Ich habe Pizza gegessen').check?.verdict).toBe('exact')
    expect(checkQuestion(q, 'ich hab pizza gegessen').correct).toBe(true)
    expect(checkQuestion(q, 'Ich bin Pizza gegessen').correct).toBe(false)
  })

  it('checks card questions the way the drills do', () => {
    expect(checkQuestion({ kind: 'gender', cardId: 'c1', answer: 'der' }, 'der').correct).toBe(true)
    expect(questionKey({ kind: 'gender', cardId: 'c1', answer: 'der' })).toBe('card:c1')
  })
})

describe('a topic round', () => {
  const exercises = Array.from({ length: 14 }, (_, i) => ({ id: `e${i}`, text: `Satz {{${i}}}.` }))

  it('asks up to 12 exercises, the ones you get wrong first', () => {
    const stats = new Map([['e5', stat('e5', { wrong: 1, score: 2, streak: 0 })]])
    const round = buildTopicRound({ topic: topic({ exercises }), exerciseStats: stats, cards: [], drillStats: [], random: first })
    expect(round).toHaveLength(12)
    expect(round[0]).toEqual({ question: expect.objectContaining({ exerciseId: 'e5' }), attempt: 0 })
  })

  it('adds questions from your cards when the topic links a drill', () => {
    const card = (n: number): Card => ({ id: `c${n}`, deckId: 'd', type: 'word', english: '', german: `Wort${n}`, gender: 'das', tags: [], createdAt: n, updatedAt: n })
    const cards = Array.from({ length: 8 }, (_, i) => card(i))
    const round = buildTopicRound({ topic: topic({ exercises, drill: { kind: 'gender' } }), exerciseStats: new Map(), cards, drillStats: [], random: first })
    expect(round).toHaveLength(17)
    expect(round.filter((i) => i.question.kind === 'gender')).toHaveLength(5)
    expect(round[round.length - 1].question.kind).toBe('exercise')
    expect(buildTopicRound({ topic: topic({ drill: { kind: 'gender' } }), exerciseStats: new Map(), cards, drillStats: [], random: first })).toHaveLength(8)
  })

  it('takes only the linked tense from verb cards', () => {
    const verb: Card = {
      id: 'v', deckId: 'd', type: 'word', english: '', german: 'gehen', tags: [], createdAt: 1, updatedAt: 1,
      conjugation: { present: 'gehe, gehst, geht, gehen, geht, gehen', past: 'ging, gingst, ging, gingen, gingt, gingen' },
    }
    const round = buildTopicRound({ topic: topic({ drill: { kind: 'verbs', tense: 'past' } }), exerciseStats: new Map(), cards: [verb], drillStats: [], random: first })
    expect(round.map((i) => i.question)).toEqual([expect.objectContaining({ kind: 'verbs', tense: 'past', answers: ['ging'] })])
  })

  it('spreads extra items evenly', () => {
    expect(interleave<number | string>([1, 2, 3, 4, 5, 6], ['a', 'b'])).toEqual([1, 2, 'a', 3, 4, 'b', 5, 6])
  })
})

describe('review', () => {
  it('brings an exercise back days later after right answers, minutes later after a wrong one', () => {
    const right = nextExerciseStat(undefined, 't1', 'e1', true, NOW)
    expect(right).toMatchObject({ right: 1, streak: 1, score: 0, due: NOW + REVIEW_DAYS[0] * DAY })
    const again = nextExerciseStat(right, 't1', 'e1', true, NOW)
    expect(again.due).toBe(NOW + REVIEW_DAYS[1] * DAY)
    const wrong = nextExerciseStat(again, 't1', 'e1', false, NOW)
    expect(wrong).toMatchObject({ wrong: 1, streak: 0, score: 2, due: NOW + RETRY_MS })
    // The gap stops growing at the last step.
    let s = right
    for (let i = 0; i < 10; i++) s = nextExerciseStat(s, 't1', 'e1', true, NOW)
    expect(s.due).toBe(NOW + REVIEW_DAYS[REVIEW_DAYS.length - 1] * DAY)
  })

  it('reviews due exercises from every topic, most overdue first, and nothing you have not practised', () => {
    const a = topic({ id: 'a', exercises: [{ id: 'a1', text: 'A {{x}}.' }, { id: 'a2', text: 'A {{y}}.' }, { id: 'a3', text: 'A {{z}}.' }] })
    const b = topic({ id: 'b', exercises: [{ id: 'b1', text: 'B {{x}}.' }] })
    const stats = [stat('a1', { due: NOW - 10 }), stat('a2', { due: NOW + DAY }), stat('b1', { due: NOW - 100 })]
    expect(dueExercises([a, b], stats, NOW).map((d) => d.exercise.id)).toEqual(['b1', 'a1'])
    expect(buildReviewRound([a, b], stats, NOW, first).map((i) => (i.question as ExerciseQuestion).exerciseId).sort()).toEqual(['a1', 'b1'])
  })
})

describe('progress', () => {
  const t = topic({ exercises: [1, 2, 3, 4, 5].map((n) => ({ id: `e${n}`, text: `S {{${n}}}.` })) })

  it('knows an exercise once the last answer was right and the mistakes are made up for', () => {
    expect(isKnown(stat('e1'))).toBe(true)
    expect(isKnown(stat('e1', { score: 1 }))).toBe(false)
    expect(isKnown(stat('e1', { streak: 0, score: 0 }))).toBe(false)
    expect(isKnown(undefined)).toBe(false)
  })

  it('says how far along a topic is', () => {
    expect(topicProgress(t, new Map())).toEqual({ total: 5, known: 0, weak: 0, share: 0, status: 'new' })
    const some = new Map([['e1', stat('e1')], ['e2', stat('e2', { score: 2, streak: 0 })]])
    expect(topicProgress(t, some)).toEqual({ total: 5, known: 1, weak: 1, share: 0.2, status: 'learning' })
    const most = new Map(['e1', 'e2', 'e3', 'e4'].map((id) => [id, stat(id)]))
    expect(topicProgress(t, most).status).toBe('mastered')
  })

  it('orders the path by level and picks the topic to learn next', () => {
    const b1 = topic({ id: 'b1', level: 'B1', createdAt: 1, exercises: t.exercises })
    const a1 = topic({ id: 'a1', level: 'A1', createdAt: 2, exercises: t.exercises.map((e) => ({ ...e, id: `x${e.id}` })) })
    const own = topic({ id: 'own', createdAt: 0, exercises: [{ id: 'o', text: 'O {{o}}.' }] })
    expect(pathOrder([b1, own, a1]).map((x) => x.id)).toEqual(['a1', 'b1', 'own'])
    expect(levelGroups([b1, own, a1]).map((g) => g.group)).toEqual(['A1', 'B1', 'No level'])
    expect(nextTopic([b1, own, a1], new Map())?.id).toBe('a1')
    // A topic you started comes before a new one.
    expect(nextTopic([b1, own, a1], new Map([['e1', stat('e1', { topicId: 'b1' })]]))?.id).toBe('b1')
  })

  it('groups topics in the order their first topic was added', () => {
    const groups = groupTopics([topic({ id: 'b', group: 'Verbs', createdAt: 3 }), topic({ id: 'a', group: 'Cases', createdAt: 1 }), topic({ id: 'c', group: 'Cases', createdAt: 5 })])
    expect(groups.map((g) => [g.group, g.topics.map((x) => x.id)])).toEqual([
      ['Cases', ['a', 'c']],
      ['Verbs', ['b']],
    ])
  })
})

describe('asking Claude', () => {
  it('writes a message with the exercise, both answers and the explanation', () => {
    const q = question('Ich helfe {{dem|den|der}} Mann.', 'I help the man.', 'helfen takes the dative.')
    const prompt = askClaudePrompt({ topic: topic({ english: 'The dative case', level: 'A2' }), question: q, answer: 'den', correct: false })
    expect(prompt).toBe(
      [
        'I\'m learning German grammar: "Der Dativ" (The dative case), level A2.',
        'Exercise: Ich helfe ___ Mann.',
        'Meaning: I help the man.',
        'My answer: den (wrong)',
        'Right answer: Ich helfe dem Mann.',
        'The app says: helfen takes the dative.',
        '',
        'Explain simply, in English, why the right answer is right and what was wrong with mine. Then give two more example sentences and three short sentences for me to try, with the answers at the end.',
      ].join('\n'),
    )
    expect(claudeChatUrl('a b')).toBe('https://claude.ai/new?q=a%20b')
  })

  it('names the tapped word for a mistake, and says when nothing was answered', () => {
    const q = question('Gestern {{bin>habe}} ich gegessen.')
    expect(askClaudePrompt({ topic: topic({}), question: q, answer: '2', correct: false })).toContain('My answer: ich (wrong)')
    expect(askClaudePrompt({ topic: topic({}), question: question('Du {{bist}} da.'), answer: '', correct: false })).toContain('I did not know the answer.')
  })
})
