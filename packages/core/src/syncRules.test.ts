import { describe, expect, it } from 'vitest'
import { MAX_IMAGE_BYTES, MAX_PUSH_BYTES, MAX_PUSH_CHANGES, MAX_RECORD_BYTES, type PulledChange, type SyncChange } from './sync'
import { PUSH_ENVELOPE_BYTES, acceptablePulled, batchChanges, changeBytes, isResync, nextAt, pendingNewer, refusal, splitOnRefusal, utf8Bytes } from './syncRules'

const FOUR_BYTES = '\u{1F600}'
const change = (data: unknown, extra: Partial<SyncChange> = {}): SyncChange => ({ tbl: 'docs', id: 'd1', data, updatedAt: 1, deleted: false, ...extra })
const pulled = (tbl: PulledChange['tbl'], id: string, data: unknown, deleted = false): PulledChange => ({ tbl, id, data, updatedAt: 1, deleted, seq: 1 })

describe('utf8Bytes', () => {
  it('counts UTF-8 bytes, not characters', () => {
    expect(utf8Bytes('abc')).toBe(3)
    expect(utf8Bytes('ä')).toBe(2)
    expect(utf8Bytes('€')).toBe(3)
    expect(utf8Bytes(FOUR_BYTES)).toBe(4)
    expect(utf8Bytes(FOUR_BYTES)).toBe(new TextEncoder().encode(FOUR_BYTES).byteLength)
  })
})

describe('refusal', () => {
  it('accepts a small record and a small image', () => {
    expect(refusal(change({ a: 1 }))).toBeUndefined()
    expect(refusal(change({ id: 'i1' }), { type: 'image/webp', size: 10 })).toBeUndefined()
  })

  it('refuses a file that is not an image', () => {
    expect(refusal(change(null), { type: 'text/plain', size: 1 })).toBe('This file is not an image (text/plain), so it cannot sync.')
    expect(refusal(change(null), { type: '', size: 1 })).toBe('This file is not an image (it has no type), so it cannot sync.')
  })

  it('refuses an image over the limit', () => {
    expect(refusal(change(null), { type: 'image/png', size: MAX_IMAGE_BYTES + 1 })).toBe(
      'This image is too large to sync: 1.5 MB, and the most is 1.5 MB.',
    )
  })

  it('refuses a record over the limit, but never a delete', () => {
    const big = change({ text: 'x'.repeat(MAX_RECORD_BYTES) })
    expect(refusal(big)).toContain('too large to sync')
    expect(refusal({ ...big, data: null, deleted: true })).toBeUndefined()
  })

  it('measures the record in bytes', () => {
    // 300k emoji are 600k characters but 1.2 MB.
    expect(refusal(change({ text: FOUR_BYTES.repeat(300_000) }))).toContain('too large to sync')
  })
})

describe('acceptablePulled', () => {
  it('takes synced tables whose data names their own id', () => {
    expect(acceptablePulled(pulled('cards', 'c1', { id: 'c1' }))).toBe(true)
    expect(acceptablePulled(pulled('kv', 'settings', { key: 'settings', value: {} }))).toBe(true)
  })

  it('refuses a table this app does not sync, and kv keys that stay on a device', () => {
    expect(acceptablePulled({ ...pulled('cards', 'c1', { id: 'c1' }), tbl: 'clips' as never })).toBe(false)
    expect(acceptablePulled(pulled('kv', 'tour', { key: 'tour', value: 1 }))).toBe(false)
  })

  it('refuses data that names another id, or none', () => {
    expect(acceptablePulled(pulled('cards', 'c1', { id: 'c2' }))).toBe(false)
    expect(acceptablePulled(pulled('kv', 'settings', { key: 'activeTimer' }))).toBe(false)
    expect(acceptablePulled(pulled('cards', 'c1', null))).toBe(false)
    expect(acceptablePulled(pulled('cards', 'c1', 'c1'))).toBe(false)
  })

  it('takes a delete whatever its data', () => {
    expect(acceptablePulled(pulled('cards', 'c1', null, true))).toBe(true)
    expect(acceptablePulled(pulled('kv', 'tour', null, true))).toBe(false)
  })
})

describe('pendingNewer', () => {
  it('is true only for an entry with a later at than the change', () => {
    expect(pendingNewer(undefined, { updatedAt: 5 })).toBe(false)
    expect(pendingNewer(6, { updatedAt: 5 })).toBe(true)
    expect(pendingNewer(5, { updatedAt: 5 })).toBe(false)
    expect(pendingNewer(4, { updatedAt: 5 })).toBe(false)
  })
})

describe('nextAt', () => {
  it('uses the clock when it is ahead', () => {
    expect(nextAt(undefined, 1_000)).toBe(1_000)
    expect(nextAt(500, 1_000)).toBe(1_000)
  })

  it('moves forward by one when the clock has not ticked or went back', () => {
    expect(nextAt(1_000, 1_000)).toBe(1_001)
    expect(nextAt(1_000, 900)).toBe(1_001)
  })
})

describe('isResync', () => {
  it('is a 409 whose body says resync', () => {
    expect(isResync(409, { resync: true })).toBe(true)
    expect(isResync(409, { error: 'x' })).toBe(false)
    expect(isResync(409, { resync: 'yes' })).toBe(false)
    expect(isResync(409, undefined)).toBe(false)
    expect(isResync(400, { resync: true })).toBe(false)
  })
})

describe('batchChanges', () => {
  const item = (bytes: number) => ({ bytes })

  it('keeps small changes in one batch and nothing in none', () => {
    expect(batchChanges([], MAX_PUSH_CHANGES, MAX_PUSH_BYTES)).toEqual([])
    expect(batchChanges([item(10), item(10)], MAX_PUSH_CHANGES, MAX_PUSH_BYTES)).toHaveLength(1)
  })

  it('cuts at the change count', () => {
    const batches = batchChanges(Array.from({ length: 501 }, () => item(10)), MAX_PUSH_CHANGES, MAX_PUSH_BYTES)
    expect(batches.map((b) => b.length)).toEqual([500, 1])
  })

  it('cuts at the byte limit, counting the envelope', () => {
    const half = Math.floor((MAX_PUSH_BYTES - PUSH_ENVELOPE_BYTES) / 2)
    expect(batchChanges([item(half), item(half)], MAX_PUSH_CHANGES, MAX_PUSH_BYTES)).toHaveLength(1)
    expect(batchChanges([item(half), item(half + 1)], MAX_PUSH_CHANGES, MAX_PUSH_BYTES)).toHaveLength(2)
  })

  it('puts a change larger than the limit alone', () => {
    expect(batchChanges([item(MAX_PUSH_BYTES * 2), item(5)], MAX_PUSH_CHANGES, MAX_PUSH_BYTES).map((b) => b.length)).toEqual([1, 1])
  })

  it('sizes a change as its JSON plus a comma', () => {
    const c = change({ a: 1 })
    expect(changeBytes(c)).toBe(utf8Bytes(JSON.stringify(c)) + 1)
  })
})

describe('splitOnRefusal', () => {
  it('halves a batch, the first half the larger', () => {
    expect(splitOnRefusal([1, 2, 3, 4])).toEqual([[1, 2], [3, 4]])
    expect(splitOnRefusal([1, 2, 3])).toEqual([[1, 2], [3]])
    expect(splitOnRefusal([1, 2])).toEqual([[1], [2]])
  })

  it('leaves a single change, the one at fault, unsplit', () => {
    expect(splitOnRefusal([1])).toBeUndefined()
    expect(splitOnRefusal([])).toBeUndefined()
  })
})
