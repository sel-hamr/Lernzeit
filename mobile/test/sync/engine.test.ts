import { ACCOUNT_KEY } from '../../src/account'
import { OfflineError, SignedOutError } from '../../src/api'
import { CURSOR_KEY, MERGED_KEY, MISSING_IMAGES_KEY } from '../../src/sync/engine'
import { LAST_SYNCED_KEY, getSyncStatus } from '../../src/sync/status'
import { addImage, createCloud, createPhone, settle, type Cloud } from './phone'

const deck = (id: string, name: string, updatedAt = 1) => ({ tbl: 'decks' as const, id, data: { id, name, updatedAt }, updatedAt, deleted: false })
const ids = (cloud: Cloud) =>
  [...cloud.server.records.values()]
    .filter((r) => !r.deleted)
    .map((r) => `${r.tbl}/${r.id}`)
    .sort()

/** A phone that has synced once already, so the test starts from a merged library. */
async function syncedPhone(cloud: Cloud, options?: Parameters<typeof createPhone>[1]) {
  const phone = createPhone(cloud, options)
  await phone.engine.syncNow()
  return phone
}

describe('pushing', () => {
  it('sends the outbox, takes the entries off, and pulls the other devices’ changes', async () => {
    const cloud = createCloud()
    const phone = await syncedPhone(cloud)
    await cloud.push([deck('theirs', 'Theirs', 10)])
    phone.library.put('decks', { id: 'd1', name: 'One' })
    phone.library.put('cards', { id: 'c1', deckId: 'd1' })
    const pushes = cloud.count('POST /api/sync/push')
    // Pulled: the other device's deck, and this phone's own two changes as the cloud now holds them.
    await expect(phone.engine.syncNow()).resolves.toEqual({ pushed: 2, pulled: 3 })
    expect(cloud.data('decks', 'd1')).toEqual({ id: 'd1', name: 'One' })
    expect(cloud.data('cards', 'c1')).toEqual({ id: 'c1', deckId: 'd1' })
    expect(phone.library.outbox()).toEqual([])
    expect(phone.library.get('decks', 'theirs')).toEqual({ id: 'theirs', name: 'Theirs', updatedAt: 10 })
    expect(cloud.count('POST /api/sync/push')).toBe(pushes + 1)
    expect(getSyncStatus()).toMatchObject({ state: 'idle' })
  })

  it('keeps an edit made while its push is in flight, and sends it next time (Review Focus 2)', async () => {
    const cloud = createCloud()
    let clock = 1000
    const phone = await syncedPhone(cloud, { now: () => clock })
    phone.library.put('decks', { id: 'd1', name: 'One' })
    cloud.server.beforeRequest = async (_method, path) => {
      if (path !== '/api/sync/push') return
      cloud.server.beforeRequest = undefined
      // The same millisecond as the first write: the outbox stamp still moves on.
      phone.library.put('decks', { id: 'd1', name: 'Two' })
    }
    await phone.engine.syncNow()
    expect(cloud.data('decks', 'd1')).toEqual({ id: 'd1', name: 'One' })
    // The pull brought "One" back, older than the waiting edit: it did not replace it.
    expect(phone.library.get('decks', 'd1')).toEqual({ id: 'd1', name: 'Two' })
    expect(phone.library.outbox()).toEqual([{ tbl: 'decks', id: 'd1', at: 1001 }])
    clock = 2000
    await phone.engine.syncNow()
    expect(cloud.data('decks', 'd1')).toEqual({ id: 'd1', name: 'Two' })
    expect(phone.library.outbox()).toEqual([])
  })

  it('parks a change the cloud refuses with its reason, pushes the rest, and tries it again on the next start', async () => {
    const cloud = createCloud()
    const phone = await syncedPhone(cloud)
    cloud.server.refuseChange = (change) => (change.id === 'bad' ? 'is not allowed' : undefined)
    phone.library.put('decks', { id: 'good1', name: 'A' })
    phone.library.put('decks', { id: 'bad', name: 'B' })
    phone.library.put('decks', { id: 'good2', name: 'C' })
    await phone.engine.syncNow()
    // The batch was refused as a whole, then halved down to the change at fault.
    expect(ids(cloud)).toEqual(['decks/good1', 'decks/good2'])
    expect(phone.library.outbox()).toEqual([expect.objectContaining({ id: 'bad', stuck: expect.stringContaining('is not allowed') })])
    expect(phone.library.get('decks', 'bad')).toEqual({ id: 'bad', name: 'B' })

    const pushes = cloud.count('POST /api/sync/push')
    await phone.engine.syncNow()
    expect(cloud.count('POST /api/sync/push')).toBe(pushes)

    cloud.server.refuseChange = undefined
    const again = phone.restart()
    await again.engine.syncNow()
    expect(cloud.data('decks', 'bad')).toEqual({ id: 'bad', name: 'B' })
    expect(again.library.outbox()).toEqual([])
  })

  it('pushes in batches of at most 500 changes', async () => {
    const cloud = createCloud()
    const phone = await syncedPhone(cloud)
    phone.library.write(() => {
      for (let i = 0; i < 501; i++) phone.library.put('cards', { id: `c${i}` })
    })
    const pushes = cloud.count('POST /api/sync/push')
    await expect(phone.engine.syncNow()).resolves.toMatchObject({ pushed: 501 })
    expect(cloud.count('POST /api/sync/push')).toBe(pushes + 2)
  })
})

describe('pulling', () => {
  it('pulls everything on a first sign-in with no local data, and marks the library merged', async () => {
    const cloud = createCloud()
    await cloud.push([deck('d1', 'One'), deck('d2', 'Two'), { tbl: 'kv', id: 'settings', data: { key: 'settings', value: { dailyGoal: 3 } }, updatedAt: 1, deleted: false }])
    const phone = createPhone(cloud)
    await phone.engine.syncNow()
    expect(phone.library.listIds('decks').sort()).toEqual(['d1', 'd2'])
    expect(phone.library.get('kv', 'settings')).toEqual({ key: 'settings', value: { dailyGoal: 3 } })
    expect(phone.library.getMeta(MERGED_KEY)).toBe(true)
    expect(phone.library.getMeta(CURSOR_KEY)).toEqual(expect.any(String))
    expect(cloud.count('POST /api/sync/push')).toBe(1) // the test's own push
    expect(phone.library.outbox()).toEqual([])
  })

  it('saves the cursor only with the page it applied, so a phone killed mid-pull resumes without loss or duplication (Review Focus 3)', async () => {
    const cloud = createCloud()
    for (const id of ['a', 'b', 'c', 'd', 'e']) await cloud.push([deck(id, id.toUpperCase())])
    cloud.server.pageSize = 2
    let pulls = 0
    cloud.server.beforeRequest = async (_method, path) => {
      // The app dies while the second page is on its way.
      if (path === '/api/sync/pull' && ++pulls === 2) throw new Error('killed')
    }
    const phone = createPhone(cloud)
    await expect(phone.engine.syncNow()).rejects.toThrow()
    expect(phone.library.listIds('decks').sort()).toEqual(['a', 'b'])
    const cursor = phone.library.getMeta<string>(CURSOR_KEY)
    expect(cursor).toEqual(expect.any(String))

    // Killed again, this time while the third page is being written: the page and its cursor go together.
    cloud.server.beforeRequest = undefined
    let cursorWrites = 0
    const dying = phone.restart({
      wrap: (library) => ({
        ...library,
        setMeta(key, value) {
          if (key === CURSOR_KEY && ++cursorWrites === 2) throw new Error('killed')
          library.setMeta(key, value)
        },
      }),
    })
    await expect(dying.engine.syncNow()).rejects.toThrow('killed')
    expect(dying.library.listIds('decks').sort()).toEqual(['a', 'b', 'c', 'd'])
    expect(dying.library.getMeta<string>(CURSOR_KEY)).not.toBe(cursor)

    const again = dying.restart()
    await expect(again.engine.syncNow()).resolves.toEqual({ pushed: 0, pulled: 1 })
    expect(again.library.listIds('decks').sort()).toEqual(['a', 'b', 'c', 'd', 'e'])
  })

  it('never lets an older pulled change replace a newer edit waiting in the outbox (Review Focus 4)', async () => {
    const cloud = createCloud()
    const phone = await syncedPhone(cloud, { now: () => 5000 })
    phone.library.put('decks', { id: 'd1', name: 'Mine' })
    await cloud.push([deck('d1', 'Theirs, older', 4000)])
    // The push fails (not a refusal): the edit stays in the outbox while the pull goes on.
    const failPushes = () => (cloud.server.beforeRequest = async (_method, path) => (path === '/api/sync/push' ? new Response('{}', { status: 503 }) : undefined))
    failPushes()
    await expect(phone.engine.syncNow()).rejects.toThrow()
    expect(phone.library.get('decks', 'd1')).toEqual({ id: 'd1', name: 'Mine' })
    expect(phone.library.outboxEntry('decks', 'd1')).toMatchObject({ at: 5000 })

    // A newer change from the cloud does win, and settles the entry.
    cloud.server.beforeRequest = undefined
    await cloud.push([deck('d1', 'Theirs, newer', 6000)])
    failPushes()
    await expect(phone.engine.syncNow()).rejects.toThrow()
    expect(phone.library.get('decks', 'd1')).toEqual({ id: 'd1', name: 'Theirs, newer', updatedAt: 6000 })
    expect(phone.library.outbox()).toEqual([])
  })

  it('stops a pull whose image fails to download, or to be written, without moving the cursor', async () => {
    const cloud = createCloud()
    await cloud.putImage('i1', new Uint8Array([1, 2]))
    await cloud.push([{ tbl: 'images', id: 'i1', data: { id: 'i1', width: 4, height: 3, fit: 'cover', type: 'image/png' }, updatedAt: 1, deleted: false }])
    cloud.server.beforeRequest = async (method, path) => (method === 'GET' && path.startsWith('/api/images/') ? new Response('{}', { status: 500 }) : undefined)
    const phone = createPhone(cloud)
    await expect(phone.engine.syncNow()).rejects.toThrow()
    expect(phone.library.getMeta(CURSOR_KEY)).toBeUndefined()
    expect(phone.library.get('images', 'i1')).toBeUndefined()

    cloud.server.beforeRequest = undefined
    phone.files.failWrites = true
    await expect(phone.engine.syncNow()).rejects.toThrow(/space/)
    expect(phone.library.getMeta(CURSOR_KEY)).toBeUndefined()
    expect(getSyncStatus()).toMatchObject({ state: 'error', error: expect.stringMatching(/space/) })
  })
})

describe('images', () => {
  it('uploads an image’s bytes from its file before its record, and another phone downloads them to a file before applying it', async () => {
    const cloud = createCloud()
    const a = await syncedPhone(cloud)
    await addImage(a, 'i1', new Uint8Array([7, 8, 9]))
    await a.engine.syncNow()
    const put = cloud.server.requests.indexOf('PUT /api/images/i1')
    expect(put).toBeGreaterThan(-1)
    expect(cloud.server.requests.indexOf('POST /api/sync/push', put)).toBeGreaterThan(put)
    expect(new Uint8Array(await cloud.server.blobs.get('i1')!.arrayBuffer())).toEqual(new Uint8Array([7, 8, 9]))
    expect(cloud.data('images', 'i1')).toEqual({ id: 'i1', width: 4, height: 3, fit: 'cover', type: 'image/png' })

    const b = createPhone(cloud)
    await b.engine.syncNow()
    const file = b.library.imageFile('i1')
    expect(file).toEqual({ id: 'i1', path: b.files.pathFor('i1'), type: 'image/png', width: 4, height: 3, fit: 'cover' })
    expect(b.files.files.get(file!.path)).toEqual(new Uint8Array([7, 8, 9]))
    expect(b.library.get('images', 'i1')).toEqual({ id: 'i1', width: 4, height: 3, fit: 'cover', type: 'image/png' })

    // Deleted on one phone: the other's record, file row and file go too.
    a.library.remove('images', 'i1')
    await settle()
    expect(a.files.files.size).toBe(0)
    await a.engine.syncNow()
    await b.engine.syncNow()
    await settle()
    expect(b.library.get('images', 'i1')).toBeUndefined()
    expect(b.library.imageFile('i1')).toBeUndefined()
    expect(b.files.files.size).toBe(0)
  })

  it('parks an image whose file is gone from this phone', async () => {
    const cloud = createCloud()
    const phone = await syncedPhone(cloud)
    await addImage(phone, 'i1', new Uint8Array([1]))
    phone.files.files.clear()
    await phone.engine.syncNow()
    expect(phone.library.outbox()).toEqual([expect.objectContaining({ id: 'i1', stuck: expect.stringMatching(/file/) })])
    expect(cloud.data('images', 'i1')).toBeUndefined()
  })

  it('skips an image whose bytes the cloud no longer has, notes it, and applies it on a later start once they are back', async () => {
    const cloud = createCloud()
    const meta = { id: 'i1', width: 4, height: 3, fit: 'cover', type: 'image/png' }
    await cloud.push([{ tbl: 'images', id: 'i1', data: meta, updatedAt: 1, deleted: false }, deck('d1', 'One')])
    const phone = createPhone(cloud)
    await phone.engine.syncNow()
    expect(phone.library.get('decks', 'd1')).toBeDefined()
    expect(phone.library.get('images', 'i1')).toBeUndefined()
    expect(phone.library.getMeta(MISSING_IMAGES_KEY)).toEqual([{ data: meta, updatedAt: 1 }])

    await cloud.putImage('i1', new Uint8Array([5]))
    await phone.engine.syncNow()
    expect(phone.library.get('images', 'i1')).toBeUndefined()

    const again = phone.restart()
    await again.engine.syncNow()
    expect(again.library.get('images', 'i1')).toEqual(meta)
    expect(again.files.files.get(again.library.imageFile('i1')!.path)).toEqual(new Uint8Array([5]))
    expect(again.library.getMeta(MISSING_IMAGES_KEY)).toEqual([])
  })
})

describe('the account', () => {
  it('signs out on a 401 keeping the data and the outbox, and pushes them after signing in again (Review Focus 5)', async () => {
    const cloud = createCloud()
    const phone = await syncedPhone(cloud)
    phone.library.put('decks', { id: 'd1', name: 'Offline work' })
    cloud.revokeAll()
    await expect(phone.engine.syncNow()).rejects.toBeInstanceOf(SignedOutError)
    await settle()
    expect(getSyncStatus().state).toBe('signedOut')
    expect(phone.library.getMeta(ACCOUNT_KEY)).toBeUndefined()
    expect(phone.token()).toBeNull()
    expect(phone.library.get('decks', 'd1')).toEqual({ id: 'd1', name: 'Offline work' })
    expect(phone.library.outboxSize()).toBe(1)

    // Signed out, a sync does not ask the cloud at all.
    const requests = cloud.server.requests.length
    await expect(phone.engine.syncNow()).rejects.toBeInstanceOf(SignedOutError)
    expect(cloud.server.requests.length).toBe(requests)

    await phone.account.signIn(cloud.server.email, cloud.server.password)
    await phone.engine.syncNow()
    expect(cloud.data('decks', 'd1')).toEqual({ id: 'd1', name: 'Offline work' })
    expect(phone.library.outbox()).toEqual([])
  })

  it('says offline when the cloud cannot be reached, and keeps everything', async () => {
    const cloud = createCloud()
    const phone = await syncedPhone(cloud)
    phone.library.put('decks', { id: 'd1', name: 'One' })
    cloud.server.offline = true
    await expect(phone.engine.syncNow()).rejects.toBeInstanceOf(OfflineError)
    expect(getSyncStatus().state).toBe('offline')
    expect(phone.library.outboxSize()).toBe(1)
    expect(phone.library.getMeta(ACCOUNT_KEY)).toBeDefined()
  })
})

describe('resync and merging', () => {
  it('on a 409 forgets the cursor, merges this phone’s library in again, and gives the cloud back what it lost', async () => {
    const cloud = createCloud()
    const phone = await syncedPhone(cloud)
    await cloud.push([deck('old', 'Old')])
    await phone.engine.syncNow()
    const before = cloud.server.snapshot()
    phone.library.put('decks', { id: 'new', name: 'New', updatedAt: 1 })
    await cloud.push([deck('other', 'Other')])
    await phone.engine.syncNow()
    expect(phone.library.listIds('decks').sort()).toEqual(['new', 'old', 'other'])

    // The cloud is restored to before "new" and "other" (D1 Time Travel).
    cloud.server.timeTravel(before)
    await phone.engine.syncNow()
    expect(cloud.server.statuses).toContain(409)
    expect(ids(cloud)).toEqual(['decks/new', 'decks/old', 'decks/other'])
    expect(phone.library.listIds('decks').sort()).toEqual(['new', 'old', 'other'])
    expect(phone.library.getMeta(MERGED_KEY)).toBe(true)
    expect(phone.library.outbox()).toEqual([])
  })

  it('folds a library this phone had before its first sign-in into the cloud’s', async () => {
    const cloud = createCloud()
    await cloud.push([deck('cloud', 'From the cloud')])
    const phone = createPhone(cloud)
    phone.library.put('decks', { id: 'local', name: 'From this phone', updatedAt: 1 })
    await addImage(phone, 'i1', new Uint8Array([3]))
    await phone.engine.syncNow()
    expect(ids(cloud)).toEqual(['decks/cloud', 'decks/local', 'images/i1'])
    expect(new Uint8Array(await cloud.server.blobs.get('i1')!.arrayBuffer())).toEqual(new Uint8Array([3]))
    expect(phone.library.listIds('decks').sort()).toEqual(['cloud', 'local'])
    expect(phone.files.files.get(phone.library.imageFile('i1')!.path)).toEqual(new Uint8Array([3]))
    expect(phone.library.getMeta(MERGED_KEY)).toBe(true)
    expect(phone.library.outbox()).toEqual([])
  })
})

describe('one sync at a time', () => {
  it('never runs two at once, even on two engines, and calls during a sync share one more after it', async () => {
    const cloud = createCloud()
    const a = await syncedPhone(cloud)
    const b = createPhone(cloud)
    let inFlight = 0
    let most = 0
    cloud.server.beforeRequest = async () => {
      most = Math.max(most, ++inFlight)
      await settle()
      inFlight--
    }
    const first = a.engine.syncNow()
    const second = a.engine.syncNow()
    const third = a.engine.syncNow()
    const other = b.engine.syncNow()
    await Promise.all([first, second, third, other])
    expect(second).toBe(third)
    expect(second).not.toBe(first)
    expect(most).toBe(1)
  })
})

describe('signing out during a sync', () => {
  it('writes nothing of a pull in flight back into the library a forced sign-out cleared', async () => {
    const cloud = createCloud()
    const phone = await syncedPhone(cloud)
    await cloud.putImage('i1', new Uint8Array([1]))
    await cloud.push([deck('d1', 'One'), { tbl: 'images', id: 'i1', data: { id: 'i1', width: 4, height: 3, fit: 'cover', type: 'image/png' }, updatedAt: 1, deleted: false }])
    let release!: () => void
    const waiting = new Promise<void>((resolve) => (release = resolve))
    let signedOut: Promise<unknown> | undefined
    cloud.server.beforeRequest = async (_method, path) => {
      if (path !== '/api/sync/pull' || signedOut) return
      signedOut = phone.account.signOut({ force: true })
      await waiting
    }
    const sync = phone.engine.syncNow()
    await settle()
    release()
    await expect(sync).rejects.toBeInstanceOf(SignedOutError)
    await signedOut
    await settle()
    expect(phone.library.listIds('decks')).toEqual([])
    expect(phone.library.imageFiles()).toEqual([])
    expect(phone.files.files.size).toBe(0)
    for (const key of [CURSOR_KEY, MERGED_KEY, LAST_SYNCED_KEY, ACCOUNT_KEY]) expect(phone.library.getMeta(key)).toBeUndefined()
    expect(phone.token()).toBeNull()
  })
})

describe('stray image files', () => {
  it('deletes the file of a pulled image tombstone that has no file row, as an undone download leaves', async () => {
    const cloud = createCloud()
    const phone = await syncedPhone(cloud)
    await phone.files.write(phone.files.pathFor('i1'), new Uint8Array([9]))
    await cloud.push([{ tbl: 'images', id: 'i1', data: null, updatedAt: 5, deleted: true }])
    await phone.engine.syncNow()
    expect(phone.files.files.size).toBe(0)
  })
})

describe('the time zone', () => {
  it('records this phone’s zone in kv/timeZone after the first pull, so an empty phone still just pulls, and pushes it', async () => {
    const cloud = createCloud()
    await cloud.push([{ tbl: 'kv', id: 'timeZone', data: { key: 'timeZone', value: 'UTC' }, updatedAt: 1, deleted: false }, deck('d1', 'One')])
    let zone = 'Europe/Berlin'
    const phone = createPhone(cloud, { timeZone: () => zone })
    await phone.engine.syncNow()
    expect(phone.library.getMeta(MERGED_KEY)).toBe(true)
    expect(cloud.count('POST /api/sync/push')).toBe(1) // the test's own: no merge upload
    expect(phone.library.get('kv', 'timeZone')).toEqual({ key: 'timeZone', value: 'Europe/Berlin' })
    expect(phone.library.outbox()).toEqual([expect.objectContaining({ tbl: 'kv', id: 'timeZone' })])
    await phone.engine.syncNow()
    expect(cloud.data('kv', 'timeZone')).toEqual({ key: 'timeZone', value: 'Europe/Berlin' })

    // Once per start: a change of zone shows on the next start, or the next sign-in.
    zone = 'Asia/Tokyo'
    await phone.engine.syncNow()
    expect(phone.library.outbox()).toEqual([])
    phone.library.removeMeta(ACCOUNT_KEY)
    phone.library.setMeta(ACCOUNT_KEY, { email: cloud.server.email })
    await phone.engine.syncNow()
    expect(phone.library.get('kv', 'timeZone')).toEqual({ key: 'timeZone', value: 'Asia/Tokyo' })
  })

  it('writes nothing when the zone is already recorded', async () => {
    const cloud = createCloud()
    await cloud.push([{ tbl: 'kv', id: 'timeZone', data: { key: 'timeZone', value: 'Europe/Berlin' }, updatedAt: 1, deleted: false }])
    const phone = createPhone(cloud, { timeZone: () => 'Europe/Berlin' })
    await phone.engine.syncNow()
    expect(phone.library.outbox()).toEqual([])
  })
})
