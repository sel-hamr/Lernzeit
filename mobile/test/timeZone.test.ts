import { ACCOUNT_KEY, createLocalLibrary } from '../src/store/library'
import { recordTimeZone } from '../src/timeZone'
import { nodeSqliteAdapter } from './store/nodeSqlite'

describe('recordTimeZone', () => {
  it('writes the zone to kv/timeZone as a local write, only when signed in, known and different', () => {
    const library = createLocalLibrary(nodeSqliteAdapter())
    expect(recordTimeZone(library, 'Europe/Berlin')).toBe(false)
    library.setMeta(ACCOUNT_KEY, { email: 'a@b.c' })
    expect(recordTimeZone(library, undefined)).toBe(false)
    expect(recordTimeZone(library, 'Europe/Berlin')).toBe(true)
    expect(library.get('kv', 'timeZone')).toEqual({ key: 'timeZone', value: 'Europe/Berlin' })
    expect(library.outbox()).toEqual([expect.objectContaining({ tbl: 'kv', id: 'timeZone' })])
    expect(recordTimeZone(library, 'Europe/Berlin')).toBe(false)
  })
})
