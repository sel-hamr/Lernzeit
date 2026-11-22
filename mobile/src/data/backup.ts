/*
 * Backup, restore and reset with the web's rules (src/data/io.ts): the backup is the same JSON file
 * (images as data URLs); a restore or reset empties the cloud first (so it affects every device),
 * then this phone's library, as one change that is not recorded for upload, and the new rows wait in
 * the outbox, stamped after the cloud's reset. If the cloud cannot be reset nothing changes here.
 */
import { assertBackup, assertUniqueIds, type Backup } from '@lernzeit/core/backup'
import { isSynced, SYNC_TABLES, splitSettings } from '@lernzeit/core/sync'
import type { StoredImage } from '@lernzeit/core/types'
import { OfflineError, SignedOutError, type Api } from '../api'
import { ACCOUNT_KEY, type LocalLibrary, type OutboxEntry } from '../store/library'
import { MISSING_IMAGES_KEY } from '../sync/shared'
import type { ImageFiles } from '../sync/imageFiles'
import { withSyncLock } from '../sync/lock'
import { deviceTimeZone, recordTimeZone } from '../timeZone'
import { readSettings } from './settings'

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

export function toBase64(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0)
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + (i + 1 < bytes.length ? B64[(n >> 6) & 63] : '=') + (i + 2 < bytes.length ? B64[n & 63] : '=')
  }
  return out
}

export function fromBase64(text: string): Uint8Array {
  const clean = text.replace(/[^A-Za-z0-9+/]/g, '')
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4))
  let o = 0
  for (let i = 0; i < clean.length; i += 4) {
    const n = (B64.indexOf(clean[i]) << 18) | (B64.indexOf(clean[i + 1]) << 12) | ((B64.indexOf(clean[i + 2]) & 63) << 6) | (B64.indexOf(clean[i + 3]) & 63)
    out[o++] = (n >> 16) & 255
    if (i + 2 < clean.length) out[o++] = (n >> 8) & 255
    if (i + 3 < clean.length) out[o++] = n & 255
  }
  return out.subarray(0, o)
}

export const dataUrl = (type: string, bytes: Uint8Array) => `data:${type};base64,${toBase64(bytes)}`

function parseDataUrl(url: string): { type: string; bytes: Uint8Array } {
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(url)
  if (!match) throw new Error('A picture in the backup is not readable.')
  return { type: match[1] ?? 'application/octet-stream', bytes: fromBase64(match[3]) }
}

/** The whole library as the web's backup file. Pictures whose file is missing here are left out. */
export async function exportBackup(library: LocalLibrary, files: ImageFiles): Promise<Backup> {
  const all = <T>(tbl: (typeof SYNC_TABLES)[number]) => library.list<T>(tbl)
  const images: Backup['images'] = []
  for (const meta of all<{ id: string; width: number; height: number; fit: StoredImage['fit'] }>('images')) {
    const file = library.imageFile(meta.id)
    if (!file) continue
    try {
      images.push({ id: meta.id, width: meta.width, height: meta.height, fit: meta.fit, dataUrl: dataUrl(file.type, await files.read(file.path)) })
    } catch {
      // A picture whose file cannot be read stays out of the backup.
    }
  }
  return {
    app: 'lernzeit',
    version: 1,
    exportedAt: Date.now(),
    topics: all('topics'),
    sessions: all('sessions'),
    decks: all('decks'),
    cards: all('cards'),
    reviews: all('reviews'),
    reviewLogs: all('reviewLogs'),
    tasks: all('tasks'),
    stories: all('stories'),
    questions: all('questions'),
    responses: all('responses'),
    drillStats: all('drillStats'),
    grammarTopics: all('grammarTopics'),
    exerciseStats: all('exerciseStats'),
    practiceRuns: all('practiceRuns'),
    docFolders: all('docFolders'),
    docs: all('docs'),
    images,
    settings: readSettings(library),
  }
}

/** Words for why the cloud could not be reset, ending in what the owner was trying to do. */
function cloudFailure(error: unknown, task: string): Error {
  if (error instanceof OfflineError) return new Error(`You're offline. Connect to ${task}.`)
  if (error instanceof SignedOutError) return new Error(`Sign in to ${task}.`)
  return error instanceof Error ? error : new Error(String(error))
}

let replacing = false

function queueAll(library: LocalLibrary, at: number) {
  const entries: OutboxEntry[] = []
  for (const tbl of SYNC_TABLES) for (const id of library.listIds(tbl)) if (isSynced(tbl, id)) entries.push({ tbl, id, at })
  library.putOutboxEntries(entries)
}

/**
 * Empties the cloud, then this phone, under the sync lock (so no sync pushes the old library back in
 * between); `write` adds the new library in the same local transaction. Kept: the device id, the
 * account, and every kv key that does not sync (this phone's settings, its walkthrough).
 */
async function replaceLibrary(library: LocalLibrary, api: Api, task: string, failed: string, write?: () => void): Promise<void> {
  if (library.getMeta(ACCOUNT_KEY) === undefined) throw new Error(`Sign in to ${task}.`)
  if (replacing) throw new Error('A restore or reset is already running.')
  replacing = true
  try {
    await withSyncLock(async () => {
      let resetAt: number
      try {
        resetAt = (await api.reset()).at
      } catch (error) {
        throw cloudFailure(error, task)
      }
      const at = Math.max(Date.now(), resetAt + 1)
      try {
        library.applyRemote((remote) => {
          for (const tbl of SYNC_TABLES) {
            for (const id of library.listIds(tbl)) {
              if (tbl === 'kv' && !isSynced(tbl, id)) continue
              remote.apply({ tbl, id, data: null, updatedAt: resetAt, deleted: true })
            }
          }
          for (const entry of library.outbox()) library.removeOutboxEntry(entry.tbl, entry.id)
          library.removeMeta(MISSING_IMAGES_KEY)
          if (!write) return
          write()
          queueAll(library, at)
        })
      } catch (error) {
        console.error(`${failed} The cloud was emptied, then this phone's change failed:`, error)
        // The local change rolled back, so the old library is intact; the cloud is not. Put it back.
        try {
          library.applyRemote(() => queueAll(library, at))
        } catch (queueError) {
          throw new Error(`${failed} The cloud is empty and this phone's library could not be queued to upload again. Export a backup in Settings now.`, { cause: queueError })
        }
        throw new Error(`${failed} Your library was kept.`, { cause: error })
      }
    })
  } finally {
    replacing = false
  }
  // The reset removed `kv/timeZone` (it syncs); put it back so it goes up too.
  recordTimeZone(library, deviceTimeZone())
}

/** Replaces the library on every device with the backup. Resolves once it is stored on this phone; the upload goes on in the background. */
export async function restoreBackup(library: LocalLibrary, api: Api, files: ImageFiles, raw: unknown): Promise<{ cards: number; sessions: number; tasks: number }> {
  assertBackup(raw)
  const backup = raw
  assertUniqueIds(backup)
  // The pictures first: files are written outside the transaction.
  const pictures = backup.images.map((img) => ({ img, ...parseDataUrl(img.dataUrl) }))
  for (const p of pictures) await files.write(files.pathFor(p.img.id), p.bytes)
  await replaceLibrary(library, api, 'restore a backup', 'Restore failed.', () => {
    const put = (tbl: (typeof SYNC_TABLES)[number], rows: readonly object[] | undefined) => {
      for (const row of rows ?? []) library.put(tbl, row)
    }
    put('topics', backup.topics)
    put('sessions', backup.sessions)
    put('decks', backup.decks)
    put('cards', backup.cards)
    put('reviews', backup.reviews)
    put('reviewLogs', backup.reviewLogs)
    put('tasks', backup.tasks)
    put('stories', backup.stories)
    put('questions', backup.questions)
    put('responses', backup.responses)
    put('drillStats', backup.drillStats)
    put('grammarTopics', backup.grammarTopics)
    put('exerciseStats', backup.exerciseStats)
    put('practiceRuns', backup.practiceRuns)
    put('docFolders', backup.docFolders)
    put('docs', backup.docs)
    for (const { img, type } of pictures) {
      library.putImageFile({ id: img.id, path: files.pathFor(img.id), type, width: img.width, height: img.height, fit: img.fit })
      library.put('images', { id: img.id, width: img.width, height: img.height, fit: img.fit, type })
    }
    library.put('kv', { key: 'seeded', value: Date.now() })
    if (backup.settings) {
      const { shared, device } = splitSettings(backup.settings)
      library.put('kv', { key: 'settings', value: shared })
      // Device settings belong to the device: a backup only seeds them where there are none.
      if (Object.keys(device).length && library.get('kv', 'deviceSettings') === undefined) library.put('kv', { key: 'deviceSettings', value: device })
    }
  })
  // Emptying the library deleted the files of its pictures, those of the same ids too: write them again.
  for (const p of pictures) await files.write(files.pathFor(p.img.id), p.bytes)
  return { cards: backup.cards.length, sessions: backup.sessions.length, tasks: backup.tasks.length }
}

/** Deletes the library on every device; the app starts empty again. Needs a sign-in and the cloud. */
export async function resetAllData(library: LocalLibrary, api: Api): Promise<void> {
  await replaceLibrary(library, api, 'reset your library', 'Reset failed.')
}

