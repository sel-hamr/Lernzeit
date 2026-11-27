import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library'
import type { Story } from '@lernzeit/core/types'
import { createAccountService } from '../src/account'
import { quickAddCard, createDeck } from '../src/cards/data'
import type { Services } from '../src/services'
import { createLocalLibrary } from '../src/store/library'
import { setSyncStatus } from '../src/sync/status'
import * as Speech from 'expo-speech'
import { routes } from './routes'
import { nodeSqliteAdapter } from './store/nodeSqlite'

let mockServices: Services
jest.mock('../src/services', () => ({ createServices: () => mockServices }))

function useServices(hidden?: string[]) {
  const library = createLocalLibrary(nodeSqliteAdapter())
  library.setMeta('account', { email: 'a@b.c' })
  library.put('kv', { key: 'starterOffer', value: 'done' })
  library.put('kv', { key: 'timeZone', value: 'Europe/Berlin' })
  if (hidden) library.put('kv', { key: 'settings', value: { hiddenFeatures: hidden } })
  const tokens = { get: async () => 'tok', set: async () => {}, clear: async () => {} }
  const api = { login: jest.fn(), logout: jest.fn(async () => {}) }
  mockServices = { library, account: createAccountService({ library, api, tokens }), engine: undefined }
  return library
}

beforeEach(() => setSyncStatus({ state: 'idle' }))

const story: Story = { id: 's1', title: 'Im Park', text: 'Der Hund spielt im Park.', tags: [], createdAt: 1, updatedAt: 1, readCount: 0 }

describe('stories', () => {
  it('lists stories on the tab and opens the reader', async () => {
    const library = useServices()
    library.put('stories', story)
    await renderRouter(routes, { initialUrl: '/stories' })
    await fireEvent.press(await screen.findByRole('button', { name: /^Im Park/ }))
    expect(await screen.findByRole('header', { name: 'Im Park' })).toBeTruthy()
  })

  it('shows a tapped word’s card, or adds an unknown one', async () => {
    const library = useServices()
    const deck = createDeck(library, { name: 'A1' })
    quickAddCard(library, { english: 'dog', german: 'der Hund', deckId: deck.id })
    library.put('stories', story)
    await renderRouter(routes, { initialUrl: '/story/s1' })
    await fireEvent.press(await screen.findByText('Hund'))
    expect(await screen.findByText(/^dog · /)).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Close the word' }))
    await fireEvent.press(await screen.findByText('spielt'))
    expect(await screen.findByText('Not in your decks yet.')).toBeTruthy()
    await fireEvent.changeText(screen.getByLabelText('English'), 'plays')
    await fireEvent.press(screen.getByRole('button', { name: 'Add card' }))
    await waitFor(() => expect(library.list('cards')).toHaveLength(2))
  })

  it('reads the story aloud from the mini player, a paragraph at a time', async () => {
    const library = useServices()
    library.put('stories', { ...story, text: ['Der Hund spielt.', 'Die Katze schläft.'].join('\n\n') })
    await renderRouter(routes, { initialUrl: '/story/s1' })
    const speak = Speech.speak as jest.Mock
    speak.mockClear()
    await fireEvent.press(await screen.findByRole('button', { name: 'Listen to the story' }))
    expect(speak).toHaveBeenLastCalledWith('Der Hund spielt.', expect.objectContaining({ language: 'de-DE' }))
    expect(screen.getByText('Paragraph 1 of 2')).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Next paragraph' }))
    expect(speak).toHaveBeenLastCalledWith('Die Katze schläft.', expect.anything())
    expect(screen.getByText('Paragraph 2 of 2')).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Speed 1 times' }))
    expect(speak.mock.calls.at(-1)?.[1].rate).toBeCloseTo(speak.mock.calls.at(-2)?.[1].rate * 1.25)
    await fireEvent.press(screen.getByRole('button', { name: 'Pause' }))
    expect(screen.getByText('Paused')).toBeTruthy()
  })

  it('counts a read', async () => {
    const library = useServices()
    library.put('stories', story)
    await renderRouter(routes, { initialUrl: '/story/s1' })
    await fireEvent.press(await screen.findByRole('button', { name: 'Mark as read' }))
    expect(library.get<Story>('stories', 's1')?.readCount).toBe(1)
    expect(library.get<Story>('stories', 's1')?.openedAt).toBeGreaterThan(0)
  })
})

describe('grammar', () => {
  it('practises a topic and ends with the round done', async () => {
    const library = useServices()
    library.put('grammarTopics', { id: 'g1', title: 'Artikel', group: 'Basics', rule: 'Nouns have **der**, die or das.', examples: [{ de: 'Der Hund.' }], exercises: [{ id: 'e1', text: '{{Die|Der|Das}} Frau liest.' }], createdAt: 1, updatedAt: 1 })
    await renderRouter(routes, { initialUrl: '/grammar/g1' })
    expect(await screen.findByText('The rule')).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Practise' }))
    await fireEvent.press(await screen.findByRole('button', { name: 'Die' }))
    expect(await screen.findByText('Right')).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Finish' }))
    expect(await screen.findByText('Round done')).toBeTruthy()
    expect(screen.getByText('1 of 1 right the first time')).toBeTruthy()
    expect(library.get('exerciseStats', 'e1')).toMatchObject({ right: 1 })
  })
})

describe('questions', () => {
  it('answers a question and compares with yours', async () => {
    const library = useServices()
    library.put('questions', { id: 'q1', set: 'Ich', question: 'Wo wohnst du?', myAnswer: 'Ich wohne in Berlin.', tags: [], createdAt: 1, updatedAt: 1 })
    await renderRouter(routes, { initialUrl: '/questions/practice' })
    await fireEvent.changeText(await screen.findByLabelText('Your answer'), 'Ich wohne in Berlin.')
    await fireEvent.press(screen.getByRole('button', { name: 'Answer' }))
    expect(await screen.findByText('Matches your answer')).toBeTruthy()
    expect(library.list('responses')).toHaveLength(1)
    await fireEvent.press(screen.getByRole('button', { name: 'Finish' }))
    expect(await screen.findByText('1 answered')).toBeTruthy()
  })
})

describe('docs', () => {
  it('reads a doc as Markdown and marks it read', async () => {
    const library = useServices()
    library.put('docs', { id: 'd1', folderId: 'root', title: 'Notes', body: '# Notes\n\nSome **bold** words.\n\n- one\n- two', tags: [], status: 'toRead', pinned: false, createdAt: 1, updatedAt: 1 })
    await renderRouter(routes, { initialUrl: '/doc/d1' })
    expect(await screen.findByText('bold')).toBeTruthy()
    expect(screen.getByText('two')).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Mark as read' }))
    expect(library.get('docs', 'd1')).toMatchObject({ status: 'read' })
  })
})

