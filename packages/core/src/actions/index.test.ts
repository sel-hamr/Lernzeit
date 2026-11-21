import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LibraryStore } from '../library'
import type { ActionName, ActionParams } from '../protocol'
import type { Card } from '../types'
import { expectCode, makeStore } from './fixture'
import { runAction } from './index'

let store: ReturnType<typeof makeStore>

beforeEach(() => {
  store = makeStore()
})

describe('runAction', () => {
  it('returns results and throws errors written for the AI', async () => {
    expect(await runAction(store, 'list_topics', {})).toEqual([
      { id: 'german', name: 'German' },
      { id: 'ai', name: 'AI' },
    ])
    const error = await expectCode(runAction(store, 'create_task', { title: ' ' }), 'invalid_input')
    expect(error.message).toBe('A task needs a title.')
  })

  it('refuses an unknown action, list_browsers among them', async () => {
    await expectCode(runAction(store, 'delete_everything' as ActionName, {} as never), 'invalid_input')
    await expectCode(runAction(store, 'list_browsers' as ActionName, {} as never), 'invalid_input')
  })

  it('ignores a browser field left over from the local server', async () => {
    const params = { name: 'Food', browser: 'Chrome' } as ActionParams<'create_deck'>
    expect((await runAction(store, 'create_deck', params)).created).toBe(true)
  })

  it('commits once per call, after every write is staged', async () => {
    const commit = vi.spyOn(store, 'commit')
    await runAction(store, 'create_deck', { name: 'Food' })
    await runAction(store, 'create_cards', { deck: 'Food', cards: [{ english: 'spoon', german: 'Löffel' }, { english: 'fork', german: 'Gabel' }] })
    expect(commit).toHaveBeenCalledTimes(2)
    await runAction(store, 'list_decks', {})
    expect(commit).toHaveBeenCalledTimes(3)
  })

  it('reads its own writes within a call: a doc goes into the folders it just made', async () => {
    const { doc } = await runAction(store, 'create_doc', { body: 'Text', folder: 'A/B/C' })
    expect(doc.folder).toBe('A/B/C')
    expect(store.committed.map((c) => c.tbl)).toEqual(['docFolders', 'docFolders', 'docFolders', 'docs'])
  })

  it('stages nothing in the store and never commits when a call fails partway', async () => {
    await runAction(store, 'create_deck', { name: 'Food' })
    await runAction(store, 'create_cards', { deck: 'Food', cards: [{ english: 'spoon', german: 'Löffel' }, { english: 'fork', german: 'Gabel' }] })
    const before = store.committed.length

    // The store fails while the second card's reviews are read, after the first card was moved.
    let reviewReads = 0
    const failing: LibraryStore = Object.create(store)
    failing.list = async <T,>(...args: Parameters<LibraryStore['list']>) => {
      if (args[0] === 'reviews' && ++reviewReads === 2) throw new Error('D1 is down')
      return store.list<T>(...args)
    }
    const put = vi.spyOn(store, 'put')
    const remove = vi.spyOn(store, 'remove')
    const commit = vi.spyOn(store, 'commit')

    await expect(runAction(failing, 'move_cards', { deck: 'Food', to: 'My Words', cards: ['Löffel', 'Gabel'] })).rejects.toThrow('D1 is down')
    expect(put).not.toHaveBeenCalled()
    expect(remove).not.toHaveBeenCalled()
    expect(commit).not.toHaveBeenCalled()
    expect(store.committed).toHaveLength(before)

    // The next call starts clean: the half-done move is gone.
    await runAction(store, 'list_decks', {})
    expect(store.committed).toHaveLength(before)
    const food = (await runAction(store, 'list_cards', { deck: 'Food' })).cards.map((c) => c.german)
    expect(food).toEqual(['Löffel', 'Gabel'])
    expect((await store.list<Card>('cards', { deckId: 'my-words' })).some((c) => c.german === 'Löffel')).toBe(false)
  })
})
