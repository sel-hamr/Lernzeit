import type { Card, CardReview, Doc, DocFolder, ExerciseStat, GrammarTopic, Question, QuestionResponse, Session, Story } from '@lernzeit/core/types'
import { exerciseQuestion, topicProgress, type RoundQuestion } from '@lernzeit/core/grammar'
import { compareWithAnswer } from '@lernzeit/core/questions'
import { DOC_ROOT } from '@lernzeit/core/docs'
import { createDeck, quickAddCard } from '../src/cards/data'
import { createDocFolder, deleteDocFolder, moveDocFolder, saveDoc, setDocPosition } from '../src/docs/data'
import { docHeadings, parseMarkdown, parseSpans } from '../src/docs/markdown'
import { saveExerciseAnswer, saveTopic, deleteTopic } from '../src/grammar/data'
import { choicesOf, modeOf, otherAnswers, progressLine, questionLabel, wrongLabel } from '../src/grammar/model'
import { deleteQuestion, parseWords, saveQuestion, saveResponse } from '../src/questions/data'
import { addHint, answerCounts, comparisonLabel, hintUsed, questionSets, tallyLine } from '../src/questions/model'
import { addStarterPart, type StarterFile } from '../src/starter/starter'
import { addStoryWord, markStoryRead, saveStory } from '../src/stories/data'
import { annotateStory, buildVocabulary, difficulty, readLabel, storyTile } from '../src/stories/model'
import { createLocalLibrary } from '../src/store/library'
import { recordStudyTime, runToSave } from '../src/study/studyTime'
import { nodeSqliteAdapter } from './store/nodeSqlite'

function setup() {
  const library = createLocalLibrary(nodeSqliteAdapter())
  library.put('kv', { key: 'timeZone', value: 'Europe/Berlin' })
  return library
}

const DAY = 86_400_000

describe('stories', () => {
  it('finds your cards in a story and says how well they cover it', () => {
    const library = setup()
    const deck = createDeck(library, { name: 'A1' })
    const hund = quickAddCard(library, { english: 'dog', german: 'der Hund', deckId: deck.id })
    quickAddCard(library, { english: 'cat', german: 'die Katze', deckId: deck.id })
    const known: CardReview = { ...library.list<CardReview>('reviews', { cardId: hund.id })[0] }
    known.state = 2
    known.fsrs = { ...known.fsrs, state: 2, due: Date.now() + 30 * DAY, scheduled_days: 30 }
    const vocabulary = buildVocabulary(library.list<Card>('cards'), [known])
    const story = { text: 'Der Hund schläft.\n\nDie Katze spielt.', translation: 'The dog sleeps.\n\nThe cat plays.' }
    const annotated = annotateStory(story, vocabulary)
    expect(annotated.paragraphs).toHaveLength(2)
    expect(annotated.translation).toEqual(['The dog sleeps.', 'The cat plays.'])
    expect(annotated.coverage.words).toBe(6)
    expect(annotated.coverage.known).toBe(1)
    expect(annotated.coverage.new).toBe(1)
    expect(difficulty(annotated.coverage)?.label).toBe('Hard for now')
  })

  it('reads how hard a story is from the share of familiar words', () => {
    expect(difficulty({ words: 0, known: 0, learning: 0, new: 0, unknown: 0 })).toBeNull()
    expect(difficulty({ words: 100, known: 90, learning: 6, new: 4, unknown: 0 })).toEqual({ label: 'Easy read', tone: 'lime' })
    expect(difficulty({ words: 100, known: 80, learning: 6, new: 4, unknown: 10 })?.label).toBe('Good challenge')
    expect(difficulty({ words: 100, known: 40, learning: 0, new: 45, unknown: 15 })?.label).toBe('Study its words first')
    expect(readLabel(0)).toBeUndefined()
    expect(readLabel(1)).toBe('Read once')
    expect(readLabel(3)).toBe('Read 3 times')
  })

  it('saves a story, keeps its read count and notes, and counts a read', () => {
    const library = setup()
    const story = saveStory(library, { title: ' Im Park ', text: 'Wir gehen in den Park.', level: 'A1', tags: ['a', ' ', 'a'], words: [] })
    expect(story).toMatchObject({ title: 'Im Park', readCount: 0, tags: ['a'] })
    markStoryRead(library, story.id)
    const edited = saveStory(library, { title: 'Im Park', text: 'Wir gehen in den Park. Es ist schön.', tags: [] }, story.id)
    expect(edited.readCount).toBe(1)
    expect(edited.createdAt).toBe(story.createdAt)
    expect(() => saveStory(library, { title: '', text: 'x', tags: [] })).toThrow('title')
    const tile = storyTile(library.get<Story>('stories', story.id)!, buildVocabulary([], []))
    expect(tile).toMatchObject({ initial: 'I', read: 'Read once', meta: '8 words · 1 min', inDecks: '0% in your decks' })
  })

  it('adds a tapped word as an incomplete story card, making a deck when there is none', () => {
    const library = setup()
    const card = addStoryWord(library, { german: 'der Baum', english: 'tree', sentence: 'Der Baum ist groß.' })
    expect(card).toMatchObject({ german: 'Baum', gender: 'der', exampleDe: 'Der Baum ist groß.', tags: ['incomplete', 'story'] })
    expect(library.list('decks')).toHaveLength(1)
  })
})

describe('starter parts', () => {
  const file = {
    format: 'lernzeit-starter',
    version: 1,
    topic: 'German',
    pack: { format: 'lernzeit-cards', version: 1, decks: [], cards: [] },
    stories: [
      { id: 's1', title: 'Eins', text: 'Eins.', level: 'A1', tags: [], topic: 'German' },
      { id: 's2', title: 'Zwei', text: 'Zwei.', level: 'B2', tags: [], topic: 'German' },
    ],
    questions: [{ id: 'q1', set: 'Ich', question: 'Wer bist du?', tags: [], level: 'A1' }],
    grammarTopics: [{ id: 'g1', title: 'Dativ', group: 'Cases', rule: '', examples: [], exercises: [], level: 'A2' }],
  } as unknown as StarterFile

  it('adds only what is missing, at the levels the library has', () => {
    const library = setup()
    library.put('kv', { key: 'settings', value: { levels: ['A1', 'A2'] } })
    expect(addStarterPart(library, file, 'stories')).toBe(1)
    expect(addStarterPart(library, file, 'stories')).toBe(0)
    expect(library.get<Story>('stories', 's1')).toMatchObject({ readCount: 0 })
    expect(library.get('stories', 's2')).toBeUndefined()
    expect(addStarterPart(library, file, 'questions')).toBe(1)
    expect(addStarterPart(library, file, 'grammarTopics')).toBe(1)
    expect(library.get<GrammarTopic>('grammarTopics', 'g1')?.title).toBe('Dativ')
  })
})

describe('grammar', () => {
  const gap = (text: string, topicId = 't'): RoundQuestion => exerciseQuestion(topicId, { id: 'e', text }, () => 0)!

  it('asks articles as der, die, das, other choices as given, and the rest typed, tapped or built', () => {
    expect([...(choicesOf(gap('Ich helfe {{dem|den|einem}} Mann.')) ?? [])].sort()).toEqual(['dem', 'den', 'einem'])
    expect(choicesOf(gap('Ich sehe {{die|der|das}} Frau.'))).toEqual(['der', 'die', 'das'])
    expect(modeOf(gap('Ich sehe {{die|der|das}} Frau.'))).toBe('choose')
    expect(modeOf(gap('Ich helfe {{dem}} Mann.'))).toBe('type')
    expect(modeOf(gap('Ich helfe {{den>dem}} Mann.'))).toBe('tap')
    expect(modeOf(gap('~ Ich habe Pizza gegessen.'))).toBe('order')
    expect(modeOf({ kind: 'gender', cardId: 'c', answer: 'der' })).toBe('choose')
  })

  it('names a wrong answer and lists the other right ones', () => {
    const typed = gap('Ich {{fandest/fandst}} es gut.')
    expect(wrongLabel(typed, '')).toBe('The answer')
    expect(wrongLabel(typed, 'fand')).toBe('Not quite')
    expect(wrongLabel(gap('Ich sehe {{die|der}} Frau.'), 'der')).toBe('Not der')
    expect(wrongLabel(gap('Ich helfe {{den>dem}} Mann.'), '2')).toBe('Not that word')
    expect(otherAnswers(typed)).toEqual(['fandst'])
    expect(questionLabel(typed, undefined, { title: 'Präteritum' } as GrammarTopic, true)).toBe('Fill the gap · Präteritum')
  })

  it('keeps scores of kept exercises when a topic is saved, and drops them with the topic', () => {
    const library = setup()
    const topic = saveTopic(library, { title: 'Dativ', group: '', rule: 'x', examples: [], exercises: [{ id: 'e1', text: 'Ich helfe {{dem}} Mann.' }, { id: 'e2', text: 'Mit {{dem}} Bus.' }] })
    expect(topic.group).toBe('My topics')
    saveExerciseAnswer(library, topic.id, 'e1', true)
    saveExerciseAnswer(library, topic.id, 'e2', false)
    saveTopic(library, { ...topic, exercises: [topic.exercises[0]] }, topic.id)
    expect(library.listIds('exerciseStats').sort()).toEqual(['e1'])
    const stats = new Map(library.list<ExerciseStat>('exerciseStats').map((s) => [s.id, s]))
    expect(progressLine(topicProgress(library.get<GrammarTopic>('grammarTopics', topic.id)!, stats))).toMatch(/of 1 exercise known/)
    deleteTopic(library, topic.id)
    expect(library.count('exerciseStats')).toBe(0)
  })
})

describe('questions', () => {
  it('groups sets with how many have your answer, and counts answers', () => {
    const q = (id: string, set: string, myAnswer?: string) => ({ id, set, question: id, myAnswer, tags: [], createdAt: 1, updatedAt: 1 }) as Question
    const sets = questionSets([q('a', 'Ich', 'Ja'), q('b', 'Ich'), q('c', 'Arbeit')])
    expect(sets.map((s) => [s.set, s.line])).toEqual([
      ['Ich', '2 questions · 1 with your answer'],
      ['Arbeit', '1 question · 0 with your answer'],
    ])
    expect(answerCounts([{ questionId: 'a' }, { questionId: 'a' }]).get('a')).toBe(2)
  })

  it('tallies a round, offers hint words and compares with your answer', () => {
    expect(tallyLine({ answered: 2, shown: 1, skipped: 0 })).toBe('2 answered · 1 shown')
    expect(tallyLine({ answered: 0, shown: 0, skipped: 0 })).toBe('Nothing answered')
    expect(hintUsed('arbeite als', 'Ich arbeite als Lehrer')).toBe(true)
    expect(hintUsed('Lehrer', 'Ich arbeite')).toBe(false)
    expect(addHint('Ich arbeite  ', 'als')).toBe('Ich arbeite als')
    expect(addHint('', 'Ich')).toBe('Ich')
    expect(comparisonLabel(compareWithAnswer('Ich wohne in Berlin.', 'Ich wohne in Berlin.')).label).toBe('Matches your answer')
    expect(comparisonLabel({ kind: 'different' }).tone).toBe('neutral')
  })

  it('keeps typed answers, not blank ones, and deletes them with their question', () => {
    const library = setup()
    const question = saveQuestion(library, { set: ' ', question: 'Wie heißt du?', words: parseWords('Ich, heiße,, '), tags: [] })
    expect(question.set).toBe('My questions')
    expect(question.words).toEqual(['Ich', 'heiße'])
    expect(saveResponse(library, question.id, '   ')).toBeUndefined()
    saveResponse(library, question.id, 'Ich heiße Sami.')
    expect(library.list<QuestionResponse>('responses')).toHaveLength(1)
    deleteQuestion(library, question.id)
    expect(library.count('responses')).toBe(0)
  })
})

describe('docs markdown', () => {
  it('reads headings, paragraphs, lists, quotes, code, rules, tables and pictures', () => {
    const blocks = parseMarkdown(
      ['# Title', '', 'Some **bold** and *italic* text,', 'on two lines.', '', '- one', '  - nested', '- [x] done', '1. first', '', '> quoted', '', '```ts', 'const a = 1', '```', '---', '| A | B |', '| - | - |', '| 1 | 2 \\| 3 |', '', '![cat](image:abc)'].join('\n'),
    )
    expect(blocks.map((b) => b.type)).toEqual(['heading', 'paragraph', 'list', 'list', 'quote', 'code', 'rule', 'table', 'image'])
    expect(blocks[1]).toEqual({ type: 'paragraph', spans: [{ text: 'Some ' }, { text: 'bold', bold: true }, { text: ' and ' }, { text: 'italic', italic: true }, { text: ' text, on two lines.' }] })
    const list = blocks[2] as Extract<(typeof blocks)[number], { type: 'list' }>
    expect(list.items.map((i) => [i.depth, i.checked])).toEqual([
      [0, undefined],
      [1, undefined],
      [0, true],
    ])
    expect(blocks[5]).toEqual({ type: 'code', lang: 'ts', text: 'const a = 1' })
    const table = blocks[7] as Extract<(typeof blocks)[number], { type: 'table' }>
    expect(table.rows[0][1]).toEqual([{ text: '2 | 3' }])
    expect(blocks[8]).toEqual({ type: 'image', alt: 'cat', src: 'image:abc' })
    expect(docHeadings(blocks)).toEqual([{ index: 0, level: 1, text: 'Title' }])
  })

  it('keeps links safe and code as it is', () => {
    expect(parseSpans('See [the site](https://example.com) or [this](javascript:alert(1))')).toEqual([{ text: 'See ' }, { text: 'the site', href: 'https://example.com' }, { text: ' or this)' }])
    expect(parseSpans('`**not bold**` and snake_case_name')).toEqual([{ text: '**not bold**', code: true }, { text: ' and snake_case_name' }])
    expect(parseSpans('Go to https://lernzeit.app.')).toEqual([{ text: 'Go to ' }, { text: 'https://lernzeit.app', href: 'https://lernzeit.app' }, { text: '.' }])
    expect(parseSpans('<b>raw</b>')).toEqual([{ text: '<b>raw</b>' }])
  })
})

describe('docs', () => {
  it('saves a doc with its title from the first heading, and keeps its reading position in range', () => {
    const library = setup()
    const doc = saveDoc(library, { title: '', body: '# Notes\n\nText', folderId: DOC_ROOT, tags: ['x'] })
    expect(doc).toMatchObject({ title: 'Notes', status: 'toRead', pinned: false })
    setDocPosition(library, doc.id, 1.4)
    expect(library.get<Doc>('docs', doc.id)?.position).toBe(1)
    expect(() => saveDoc(library, { title: 'x', body: ' ', folderId: DOC_ROOT, tags: [] })).toThrow('text')
  })

  it('deletes a folder with everything inside, and never moves a folder into itself', () => {
    const library = setup()
    const a = createDocFolder(library, 'A')
    const b = createDocFolder(library, 'B', a.id)
    saveDoc(library, { title: 'In B', body: 'x', folderId: b.id, tags: [] })
    const keep = saveDoc(library, { title: 'Top', body: 'y', folderId: DOC_ROOT, tags: [] })
    expect(() => moveDocFolder(library, a.id, b.id)).toThrow('itself')
    deleteDocFolder(library, a.id)
    expect(library.list<DocFolder>('docFolders')).toEqual([])
    expect(library.list<Doc>('docs').map((d) => d.id)).toEqual([keep.id])
  })
})

describe('study time', () => {
  it('saves from a minute on, not while the same topic’s timer runs, and replaces the run', () => {
    expect(runToSave(30_000, 0, true, undefined, 't')).toBe(false)
    expect(runToSave(65_000, 0, false, undefined, 't')).toBe(true)
    expect(runToSave(65_000, 60_000, false, undefined, 't')).toBe(false)
    expect(runToSave(65_000, 60_000, true, undefined, 't')).toBe(true)
    expect(runToSave(65_000, 0, false, 't', 't')).toBe(false)
    const library = setup()
    const start = Date.UTC(2026, 10, 26, 10, 0)
    recordStudyTime(library, { runId: 'reading:s:1', topicId: 't', start, end: start + 120_000, minutes: 2 }, 'reading', 'Reading: Im Park')
    recordStudyTime(library, { runId: 'reading:s:1', topicId: 't', start, end: start + 180_000, minutes: 3 }, 'reading', 'Reading: Im Park')
    expect(library.list<Session>('sessions')).toEqual([expect.objectContaining({ minutes: 3, source: 'reading', note: 'Reading: Im Park', date: '2026-11-26' })])
  })
})
