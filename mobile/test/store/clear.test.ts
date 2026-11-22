import { createLocalLibrary, DEVICE_ID_KEY } from '../../src/store/library'
import { nodeSqliteAdapter } from './nodeSqlite'

describe('clearAccountData', () => {
  it('removes synced data, the outbox, image files and meta, keeping the device id and device-only settings', () => {
    const library = createLocalLibrary(nodeSqliteAdapter())
    library.put('decks', { id: 'd1', name: 'One' })
    library.put('kv', { key: 'settings', value: {} })
    library.put('kv', { key: 'deviceOnly', value: 1 })
    library.putImageFile({ id: 'i1', path: 'file:///i1.png', type: 'image/png', width: 1, height: 1, fit: 'cover' })
    library.setMeta(DEVICE_ID_KEY, 'dev-1')
    library.setMeta('account', { email: 'a@b.c' })
    library.setMeta('cursor', 'x')
    let heard = 0
    library.subscribe(['decks', 'outbox', 'meta', 'imageFiles'], () => heard++)

    const files = library.clearAccountData()

    expect(files.map((f) => f.id)).toEqual(['i1'])
    expect(library.count('decks')).toBe(0)
    expect(library.get('kv', 'settings')).toBeUndefined()
    expect(library.get('kv', 'deviceOnly')).toEqual({ key: 'deviceOnly', value: 1 })
    expect(library.outboxSize()).toBe(0)
    expect(library.imageFiles()).toEqual([])
    expect(library.getMeta('account')).toBeUndefined()
    expect(library.getMeta('cursor')).toBeUndefined()
    expect(library.getMeta(DEVICE_ID_KEY)).toBe('dev-1')
    expect(heard).toBe(1)
  })
})
