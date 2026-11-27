/*
 * The rules of sync that need no database or network, shared by the web engine and the phone app:
 * what the client refuses to send, what it accepts from a pull, how pushes are cut, and how the
 * outbox stamps a write. No DOM, Node or Dexie APIs: it also runs on the phone.
 */
import { MAX_IMAGE_BYTES, MAX_RECORD_BYTES, SYNC_TABLES, isSynced, recordId, type PulledChange, type SyncChange } from './sync'

/** `{"changes":[]}` around the changes of a push. */
export const PUSH_ENVELOPE_BYTES = 14

const syncTables = new Set<string>(SYNC_TABLES)

/** The length of `text` in UTF-8, as a request body counts it. */
export function utf8Bytes(text: string): number {
  let bytes = 0
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    if (code < 0x80) bytes += 1
    else if (code < 0x800) bytes += 2
    else if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length && (text.charCodeAt(i + 1) & 0xfc00) === 0xdc00) {
      bytes += 4
      i++
    } else bytes += 3
  }
  return bytes
}

const megabytes = (bytes: number) => `${(bytes / 1_000_000).toFixed(1)} MB`

/** Why the cloud would refuse this change, checked before it is sent. `blob` is an image's bytes: only its type and size count. */
export function refusal(change: SyncChange, blob?: { type: string; size: number }): string | undefined {
  if (blob && !blob.type.startsWith('image/')) return `This file is not an image (${blob.type || 'it has no type'}), so it cannot sync.`
  if (blob && blob.size > MAX_IMAGE_BYTES) {
    return `This image is too large to sync: ${megabytes(blob.size)}, and the most is ${megabytes(MAX_IMAGE_BYTES)}.`
  }
  if (change.deleted) return undefined
  const bytes = utf8Bytes(JSON.stringify(change.data))
  if (bytes > MAX_RECORD_BYTES) return `This is too large to sync: ${megabytes(bytes)}, and the most is ${megabytes(MAX_RECORD_BYTES)}.`
  return undefined
}

/** Only what this app syncs, whose data names its own id, so a bad answer cannot touch this device's own kv rows. */
export function acceptablePulled(change: PulledChange): boolean {
  if (!syncTables.has(change.tbl) || !isSynced(change.tbl, change.id)) return false
  return change.deleted || (typeof change.data === 'object' && change.data !== null && recordId(change.tbl, change.data) === change.id)
}

/** Whether a pending local edit (the outbox entry's `at`, if any) is newer than `change`, so the change must not replace it. */
export function pendingNewer(entryAt: number | undefined, change: { updatedAt: number }): boolean {
  return entryAt !== undefined && entryAt > change.updatedAt
}

/** The bytes a change takes in a push body: its JSON and the comma after it. */
export function changeBytes(change: SyncChange): number {
  return utf8Bytes(JSON.stringify(change)) + 1
}

/** Splits `items` (each with its `bytes`, see changeBytes) into pushes of at most `maxCount` changes and `maxBytes`. */
export function batchChanges<T extends { bytes: number }>(items: T[], maxCount: number, maxBytes: number): T[][] {
  const result: T[][] = []
  let batch: T[] = []
  let bytes = PUSH_ENVELOPE_BYTES
  for (const item of items) {
    if (batch.length > 0 && (batch.length === maxCount || bytes + item.bytes > maxBytes)) {
      result.push(batch)
      batch = []
      bytes = PUSH_ENVELOPE_BYTES
    }
    batch.push(item)
    bytes += item.bytes
  }
  if (batch.length > 0) result.push(batch)
  return result
}

/** The halves a refused batch is pushed in again, down to the one change at fault; undefined for a single change (park it). */
export function splitOnRefusal<T>(batch: T[]): [T[], T[]] | undefined {
  if (batch.length <= 1) return undefined
  const half = Math.ceil(batch.length / 2)
  return [batch.slice(0, half), batch.slice(half)]
}

/** The outbox stamp of a write: the clock, but always after the entry's previous `at`, so a rewrite shows even when the clock has not ticked. */
export function nextAt(previousAt: number | undefined, now: number): number {
  return Math.max(now, (previousAt ?? -Infinity) + 1)
}

/** Whether a server answer says the cloud went back past this device's cursor (409 with `resync`). */
export function isResync(status: number, body: unknown): boolean {
  return status === 409 && typeof body === 'object' && body !== null && (body as { resync?: unknown }).resync === true
}
