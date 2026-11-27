import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library'
import type { ReviewLog } from '@lernzeit/core/types'
import { createAccountService } from '../src/account'
import { createDeck, quickAddCard } from '../src/cards/data'
import type { Services } from '../src/services'
import { createLocalLibrary } from '../src/store/library'
import { setSyncStatus } from '../src/sync/status'
import { routes } from './routes'
import { nodeSqliteAdapter } from './store/nodeSqlite'

let mockServices: Services
jest.mock('../src/services', () => ({ createServices: () => mockServices }))

function useServices() {
  const library = createLocalLibrary(nodeSqliteAdapter())
  library.setMeta('account', { email: 'a@b.c' })
  library.put('kv', { key: 'starterOffer', value: 'done' })
  library.put('kv', { key: 'timeZone', value: 'Europe/Berlin' })
  const tokens = { get: async () => 'tok', set: async () => {}, clear: async () => {} }
  const api = { login: jest.fn(), logout: jest.fn(async () => {}) }
  mockServices = { library, account: createAccountService({ library, api, tokens }), engine: undefined }
  return library
}

beforeEach(() => setSyncStatus({ state: 'idle' }))

describe('the Cards filter', () => {
  it('filters from the sheet and shows one chip that removes it', async () => {
    const library = useServices()
    const deck = createDeck(library, { name: 'A1' })
    quickAddCard(library, { english: 'dog', german: 'der Hund', deckId: deck.id })
    library.put('cards', { id: 'c2', deckId: deck.id, type: 'word', german: 'Katze', gender: 'die', english: 'cat', tags: [], createdAt: 2 })
    await renderRouter(routes, { initialUrl: '/flashcards' })
    expect(await screen.findByText('cat')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^Remove the filter/ })).toBeNull()
    await fireEvent.press(screen.getByRole('button', { name: 'Filter and sort' }))
    await fireEvent.press(await screen.findByRole('button', { name: 'Incomplete' }))
    await fireEvent.press(screen.getByRole('button', { name: 'Done' }))
    await waitFor(() => expect(screen.queryByText('cat')).toBeNull())
    expect(screen.getByRole('button', { name: /^Filter and sort: Incomplete/ })).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Remove the filter Incomplete' }))
    expect(await screen.findByText('cat')).toBeTruthy()
  })
})

describe('practice', () => {
  it('shows the answer, rates it and ends on the summary', async () => {
    const library = useServices()
    const deck = createDeck(library, { name: 'A1' })
    quickAddCard(library, { english: 'dog', german: 'der Hund', deckId: deck.id })
    const card = library.list<{ id: string }>('cards')[0]!
    await renderRouter(routes, { initialUrl: `/practice?card=${card.id}` })
    expect(await screen.findByText('1 / 1')).toBeTruthy()
    expect(screen.getByLabelText('Again: 0')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^Easy/ })).toBeNull()
    await fireEvent.press(screen.getByRole('button', { name: 'Show answer' }))
    await fireEvent.press(await screen.findByRole('button', { name: /^Easy, / }))
    expect(await screen.findByText('Perfect round', {}, { timeout: 3000 })).toBeTruthy()
    expect(screen.getByText(/^1 card practised in /)).toBeTruthy()
    expect(library.list<ReviewLog>('reviewLogs')).toHaveLength(1)
  })
})
