import type { Card, Topic } from '@lernzeit/core/types'
import { OfflineError, type Api } from '../src/api'
import { quickAddCard, createDeck } from '../src/cards/data'
import { exportBackup, fromBase64, resetAllData, restoreBackup, toBase64 } from '../src/data/backup'
import { createLocalLibrary, ACCOUNT_KEY } from '../src/store/library'
import { libraryIsEmpty, setUpLernzeit, shouldOfferStarter, startEmpty, type StarterFile } from '../src/starter/starter'
import { LAST_SYNCED_KEY } from '../src/sync/status'
import { createMemoryFiles } from './sync/memoryFiles'
import { nodeSqliteAdapter } from './store/nodeSqlite'

const api = (at = 5_000): Api => ({ reset: jest.fn(async () => ({ at })) }) as unknown as Api

function signedIn() {
  const library = createLocalLibrary(nodeSqliteAdapter())
  library.setMeta(ACCOUNT_KEY, { email: 'a@b.c' })
  return library
}

describe('base64', () => {
  it('round-trips bytes of any length', () => {
    for (const bytes of [[], [1], [1, 2], [1, 2, 3], [250, 251, 252, 253]]) expect([...fromBase64(toBase64(new Uint8Array(bytes)))]).toEqual(bytes)
    expect(toBase64(new TextEncoder().encode('Lernzeit'))).toBe('TGVybnplaXQ=')
  })
})

describe('backup, restore and reset', () => {
  it('exports pictures as data URLs and restores the whole library after emptying the cloud', async () => {
    const files = createMemoryFiles()
    const library = signedIn()
    const deck = createDeck(library, { name: 'Words' })
    const card = quickAddCard(library, { english: 'dog', german: 'der Hund', deckId: deck.id })
    const path = files.pathFor('pic')
    await files.write(path, new Uint8Array([9, 8, 7]))
    library.putImageFile({ id: 'pic', path, type: 'image/jpeg', width: 10, height: 10, fit: 'cover' })
    library.put('images', { id: 'pic', width: 10, height: 10, fit: 'cover', type: 'image/jpeg' })
    library.put('cards', { ...library.get<Card>('cards', card.id)!, imageId: 'pic' })

    const backup = await exportBackup(library, files)
    expect(backup).toMatchObject({ app: 'lernzeit', version: 1 })
    expect(backup.images[0].dataUrl).toBe('data:image/jpeg;base64,CQgH')
    expect(backup.cards).toHaveLength(1)

    const cloud = api()
    const other = signedIn()
    other.put('topics', { id: 't', name: 'Old' })
    const result = await restoreBackup(other, cloud, files, JSON.parse(JSON.stringify(backup)))
    expect(cloud.reset).toHaveBeenCalledTimes(1)
    expect(result.cards).toBe(1)
    expect(other.get('topics', 't')).toBeUndefined()
    expect(other.get<Card>('cards', card.id)?.german).toBe('Hund')
    expect(other.imageFile('pic')?.type).toBe('image/jpeg')
    expect([...(await files.read(files.pathFor('pic')))]).toEqual([9, 8, 7])
    // Everything restored waits to go up, stamped after the cloud's reset.
    const outbox = other.outbox()
    expect(outbox.length).toBeGreaterThan(3)
    expect(outbox.every((o) => o.at > 5_000)).toBe(true)
    expect(outbox.some((o) => o.tbl === 'kv' && o.id === 'seeded')).toBe(true)
  })

  it('leaves the library alone when the cloud cannot be reset, and says why', async () => {
    const library = signedIn()
    library.put('topics', { id: 't', name: 'Mine' })
    const offline = { reset: jest.fn(async () => { throw new OfflineError(new Error('x')) }) } as unknown as Api
    await expect(resetAllData(library, offline)).rejects.toThrow("You're offline")
    expect(library.get('topics', 't')).toBeDefined()
  })

  it('reset empties every synced table but keeps this phone’s own settings', async () => {
    const library = signedIn()
    createDeck(library, { name: 'Words' })
    library.put('kv', { key: 'deviceSettings', value: { theme: 'dark' } })
    await resetAllData(library, api())
    expect(library.count('decks')).toBe(0)
    expect(library.outbox().map((o) => o.id)).toEqual(['timeZone'])
    expect(library.get('kv', 'deviceSettings')).toBeDefined()
  })
})

describe('the welcome', () => {
  const starter: StarterFile = {
    format: 'lernzeit-starter',
    version: 1,
    topic: 'German',
    pack: {
      format: 'lernzeit-cards',
      version: 1,
      decks: [{ id: 'd1', name: 'A1', topic: 'German' }],
      cards: [{ id: 'c1', deckId: 'd1', english: 'dog', german: 'Hund', gender: 'der', emoji: '\u{1F415}' }],
    },
    stories: [{ id: 's1', title: 'Hallo', text: 'Hallo!', translation: 'Hello!', level: 'A1', tags: [], topic: 'German' }],
    questions: [{ id: 'q1', question: 'Wie heisst du?' }],
    grammarTopics: [{ id: 'g1', level: 'A1', title: 'Artikel' }],
  }

  it('is offered only after the first sync, on an empty library, once', () => {
    const library = signedIn()
    expect(shouldOfferStarter(library)).toBe(false)
    library.setMeta(LAST_SYNCED_KEY, Date.now())
    expect(shouldOfferStarter(library)).toBe(true)
    library.put('topics', { id: 't' })
    expect(shouldOfferStarter(library)).toBe(false)
    const other = signedIn()
    other.setMeta(LAST_SYNCED_KEY, 1)
    // Another device did the welcome: its marker came with the pull.
    other.applyRemote((remote) => remote.apply({ tbl: 'kv', id: 'starterOffer', data: { key: 'starterOffer', value: 'done' }, updatedAt: 1, deleted: false }))
    expect(shouldOfferStarter(other)).toBe(false)
  })

  it('sets up topics with goals and installs the German starter without pictures', () => {
    const library = signedIn()
    const done = setUpLernzeit(library, [{ name: 'Maths', minutes: 45 }], starter)
    expect(done).toEqual({ topics: 2, cards: 1, stories: 1, questions: 1, grammar: 1 })
    const topics = library.list<Topic>('topics')
    expect(topics.map((t) => t.name).sort()).toEqual(['German', 'Maths'])
    expect(topics.find((t) => t.name === 'Maths')?.goalMinutes.wed).toBe(45)
    expect(library.get<Card>('cards', 'c1')?.gender).toBe('der')
    expect(library.list('reviews')).toHaveLength(2)
    expect(library.get('kv', 'starterOffer')).toBeDefined()
    expect(library.get<{ value: string }>('kv', 'tour')?.value).toBe('pending')
    expect(libraryIsEmpty(library)).toBe(false)
  })

  it('starting empty only records the choice', () => {
    const library = signedIn()
    startEmpty(library)
    expect(libraryIsEmpty(library)).toBe(true)
    expect(library.get<{ value: string }>('kv', 'starterOffer')?.value).toBe('done')
  })
})
