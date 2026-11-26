import { act, render, screen, within } from '@testing-library/react-native'
import TodayPage from '../app/(tabs)/index'
import { createLocalLibrary, type LocalLibrary } from '../src/store/library'
import { LocalLibraryProvider } from '../src/store/live'
import { nodeSqliteAdapter } from './store/nodeSqlite'

const MINUTE = 60_000
// Thursday 19 November 2026, 12:00 in Berlin.
const NOON = Date.UTC(2026, 10, 19, 11, 0)
const GOALS = { mon: 150, tue: 150, wed: 150, thu: 150, fri: 150, sat: 150, sun: 150 }

beforeEach(() => {
  jest.useFakeTimers({ now: NOON })
})
afterEach(() => {
  jest.useRealTimers()
})

function setup() {
  const library = createLocalLibrary(nodeSqliteAdapter())
  library.put('kv', { key: 'timeZone', value: 'Europe/Berlin' })
  return library
}

const open = (library: LocalLibrary) =>
  render(
    <LocalLibraryProvider library={library}>
      <TodayPage />
    </LocalLibraryProvider>,
  )

const topic = (id: string, name: string, color: string, goal = GOALS, order = 0) => ({
  id,
  name,
  color,
  goalMinutes: goal,
  goalHistory: [],
  archived: false,
  order,
  createdAt: Date.UTC(2026, 0, 1),
})

const session = (id: string, topicId: string, minutes: number, start: number, extra = {}) => ({
  id,
  topicId,
  start,
  end: start + minutes * MINUTE,
  minutes,
  date: '2026-11-19',
  source: 'timer',
  ...extra,
})

describe('Today, with nothing yet', () => {
  it('shows the hero, zero stats and the empty states', async () => {
    await open(setup())
    expect(screen.getByText('No goals today')).toBeTruthy()
    expect(screen.getByText('0:00 h')).toBeTruthy()
    expect(screen.getByText('studied of 0:00 h today')).toBeTruthy()
    expect(screen.getByText('No topics yet')).toBeTruthy()
    expect(screen.getByText('No sessions yet today')).toBeTruthy()
    expect(screen.getByText('Add flashcards and a learned word will show up here every day.')).toBeTruthy()
  })
})

describe('Today, filled', () => {
  function fill(library: LocalLibrary) {
    library.put('topics', topic('german', 'German', 'clay'))
    library.put('topics', topic('coding', 'Coding', 'blue', { ...GOALS, thu: 60 }, 1))
    library.put('sessions', session('s1', 'german', 70, NOON - 180 * MINUTE, { note: 'verbs' }))
    library.put('sessions', session('s2', 'coding', 60, NOON - 90 * MINUTE))
    library.put('cards', { id: 'c1', deckId: 'd', type: 'word', english: 'dog', german: 'Hund', gender: 'der', plural: 'Hunde', exampleDe: 'Der Hund bellt.', emoji: '🐶', tags: [], createdAt: 0, updatedAt: 0 })
    library.put('practiceRuns', { id: 'p1', kind: 'practice', start: 1, end: 2, activeMs: 120_000, reviewed: 12, correct: 10, directions: [], decks: {}, day: '2026-11-19' })
  }

  it('shows the goals with progress, left and done', async () => {
    const library = setup()
    fill(library)
    await open(library)
    expect(screen.getByText('1:20 h left')).toBeTruthy()
    expect(screen.getByText('1 of 2 done')).toBeTruthy()
    expect(screen.getByText('1:10 of 2:30 h')).toBeTruthy()
    expect(screen.getByText('1:20 left')).toBeTruthy()
    expect(screen.getByText('1:00 of 1:00 h')).toBeTruthy()
    expect(screen.getByText('Done')).toBeTruthy()
    const bar = screen.getByRole('progressbar', { name: 'German progress' })
    expect(bar.props.accessibilityValue).toMatchObject({ min: 0, max: 100, now: 47 })
  })

  it('shows the stats strip', async () => {
    const library = setup()
    fill(library)
    await open(library)
    expect(screen.getByText('2:10 h')).toBeTruthy()
    expect(screen.getByText('studied of 3:30 h today')).toBeTruthy()
    expect(screen.getByText('2 min')).toBeTruthy()
    expect(screen.getByText('flashcards practised · 12 cards')).toBeTruthy()
    expect(screen.getByText('0 days')).toBeTruthy()
    expect(screen.getByText('German streak')).toBeTruthy()
  })

  it('lists the sessions in time order with a duration chip', async () => {
    const library = setup()
    fill(library)
    await open(library)
    const list = screen.getByTestId('today-sessions')
    expect(within(list).getAllByTestId('session-row')).toHaveLength(2)
    expect(within(list).getByText('09:00–10:10')).toBeTruthy()
    expect(within(list).getByText('verbs')).toBeTruthy()
    expect(within(list).getByText('70 min')).toBeTruthy()
    expect(within(list).getByText('Coding')).toBeTruthy()
  })

  it('shows the word of the day with its emoji, coloured article and example', async () => {
    const library = setup()
    fill(library)
    await open(library)
    const word = screen.getByTestId('word-of-the-day')
    expect(within(word).getByText('Word of the day')).toBeTruthy()
    expect(within(word).getByLabelText('dog')).toBeTruthy()
    expect(within(word).getByText('der').props.style).toMatchObject({ color: '#2D5EA8' })
    expect(within(word).getByText('Hund')).toBeTruthy()
    expect(within(word).getByText('the dog · plural Hunde')).toBeTruthy()
    expect(within(word).getByText('Der Hund bellt.')).toBeTruthy()
  })

  it('shows the downloaded picture when the card has an image file', async () => {
    const library = setup()
    fill(library)
    library.put('cards', { id: 'c1', deckId: 'd', type: 'word', english: 'dog', german: 'Hund', gender: 'der', imageId: 'img1', tags: [], createdAt: 0, updatedAt: 0 })
    library.putImageFile({ id: 'img1', path: 'file:///images/img1.jpg', type: 'image/jpeg', width: 10, height: 10, fit: 'cover' })
    await open(library)
    expect(within(screen.getByTestId('word-of-the-day')).getByLabelText('dog').props.source).toEqual({ uri: 'file:///images/img1.jpg' })
  })

  it('shows the first letter when the card has no picture at all', async () => {
    const library = setup()
    library.put('cards', { id: 'c2', deckId: 'd', type: 'word', english: 'house', german: 'Haus', gender: 'das', tags: [], createdAt: 0, updatedAt: 0 })
    await open(library)
    expect(within(screen.getByTestId('word-of-the-day')).getByText('H')).toBeTruthy()
  })

  it('updates when a session is added', async () => {
    const library = setup()
    fill(library)
    await open(library)
    await act(() => library.put('sessions', session('s3', 'german', 80, NOON - 30 * MINUTE)))
    expect(screen.getByText('2:30 of 2:30 h')).toBeTruthy()
    expect(screen.getAllByText('Done')).toHaveLength(2)
    expect(screen.getByText('Every goal reached')).toBeTruthy()
  })

  it('moves on to the next day at midnight in the synced zone', async () => {
    const library = setup()
    fill(library)
    await open(library)
    expect(screen.getByText('1:10 of 2:30 h')).toBeTruthy()
    // 12:00 Berlin -> 00:01 Berlin on the 20th.
    await act(() => jest.advanceTimersByTime(12 * 60 * MINUTE + MINUTE))
    expect(screen.getByText('5:00 h left')).toBeTruthy()
    expect(screen.getAllByText('0:00 of 2:30 h')).toHaveLength(2)
    expect(screen.getByText('No sessions yet today')).toBeTruthy()
  })
})
