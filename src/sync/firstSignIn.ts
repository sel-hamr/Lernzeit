/*
 * The first sign-in on a browser merges its library into the cloud's. The fold
 * (@lernzeit/core/fold) maps this browser's copies of the starter onto the
 * cloud's and keeps whatever only this browser has; the result goes up, and
 * then this browser's copy is replaced by the cloud's, so every device holds
 * the same records under the same ids.
 *
 * Steps 1–4 only read here, so a failure there leaves the browser as it was
 * and the merge can simply run again. Step 5 writes everything in one
 * transaction.
 */
import { db, KV_KEYS, type LernzeitDB, type OutboxEntry } from '@/db/db'
import { foldLibraries, uploadTime, type FoldResult, type Library } from '@lernzeit/core/fold'
import {
  MAX_PUSH_BYTES,
  MAX_PUSH_CHANGES,
  SYNCED_KV_KEYS,
  SYNC_TABLES,
  imageMeta,
  isSynced,
  recordId,
  splitSettings,
  type ImageMeta,
  type PulledChange,
  type SyncChange,
  type SyncTable,
} from '@lernzeit/core/sync'
import { count } from '@lernzeit/core/text'
import type { Settings, StoredImage } from '@lernzeit/core/types'
import { getImage, pull, push, putImage } from './api'
import { CURSOR_KEY, IMAGE_REFUSALS, MISSING_IMAGES_KEY, PUSH_REFUSALS, acceptable, refusal, refusedBy } from './engine'
import { applyRemote } from './outbox'

/** `meta` key set once this browser's library is in the cloud. Until then the sync engine must not run. */
export const MERGED_KEY = 'merged'

export type MergeSummary = FoldResult['summary']

/** `{"changes":[]}` around the changes of a push. */
const PUSH_ENVELOPE_BYTES = 14
const encoder = new TextEncoder()
const keyOf = (tbl: string, id: string) => `${tbl}/${id}`

/** The cloud's records by `tbl/id`, as last pulled; tombstones included. */
type CloudState = Map<string, PulledChange>

interface Upload {
  change: SyncChange
  /** The bytes of an image the cloud does not have yet. */
  blob?: Blob
  /** The row as this browser keeps it if the cloud refuses it. */
  row: unknown
}

/** A record the cloud would not take. It stays here and waits in the outbox as stuck. */
interface Refused {
  tbl: SyncTable
  id: string
  row: unknown
  reason: string
}

/**
 * Folds this browser's library into the cloud's, uploads it, and replaces the
 * local copy with the cloud's. Returns what was added and folded. Run it once
 * per browser, before the sync engine starts: the engine would push the
 * outbox unfolded.
 */
export async function mergeIntoCloud(database: LernzeitDB = db, onStep?: (step: string) => void): Promise<MergeSummary> {
  // Theme, voice and reminders must not ride along in the shared settings the cloud may replace.
  await moveDeviceSettings(database)

  onStep?.('Reading your cloud library')
  const cloud: CloudState = new Map()
  const cursor = await pullInto(cloud, '')

  onStep?.('Reading this browser’s library')
  const { library, blobs } = await readLocal(database)
  const fold = foldLibraries(library, cloudLibrary(cloud))

  onStep?.('Uploading this browser’s data')
  const refused = await upload(uploads(fold, cloud, blobs))

  // What the cloud holds now: the state above and everything since, ours included. The same as
  // pulling again from the start, without downloading it all twice.
  onStep?.('Downloading your library')
  const finalCursor = await pullInto(cloud, cursor)
  const { downloaded, missing } = await downloadImages(database, cloud)

  onStep?.('Saving')
  await replaceLocal(database, cloud, finalCursor, downloaded, missing, refused)
  return fold.summary
}

/** What the merge summary names, in this order. Study history (reviews, logs, scores) is not counted out. */
const SUMMARY_NOUNS: [SyncTable, string, string?][] = [
  ['cards', 'card'],
  ['decks', 'deck'],
  ['topics', 'topic'],
  ['stories', 'story', 'stories'],
  ['questions', 'question'],
  ['grammarTopics', 'grammar topic'],
  ['docs', 'doc'],
  ['docFolders', 'folder'],
  ['tasks', 'task'],
  ['images', 'image'],
  ['sessions', 'study session'],
]

const listed = (parts: string[]) => (parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : parts[0])

/** "Added 214 cards and 12 stories. Folded 898 duplicate cards, 3 decks and 1 topic from the starter." */
export function mergeSummaryText({ added, folded }: MergeSummary): string {
  const counted = (counts: MergeSummary['added']) =>
    SUMMARY_NOUNS.flatMap(([tbl, one, many]) => (counts[tbl] ? [count(counts[tbl], one, many)] : []))
  const sentences: string[] = []
  const addedParts = counted(added)
  if (addedParts.length) sentences.push(`Added ${listed(addedParts)}.`)
  else if (Object.keys(added).length) sentences.push('Added this browser’s study history.')
  const foldedParts = counted(folded)
  if (foldedParts.length) sentences.push(`Folded ${listed([foldedParts[0].replace(' ', ' duplicate '), ...foldedParts.slice(1)])} from the starter.`)
  return sentences.join(' ') || 'Your cloud had everything this browser has.'
}

/**
 * Writes the device keys an old install still keeps in the shared `settings` row into
 * `deviceSettings` (keeping what is there already) and takes them out of `settings`. Settings
 * read the same before and after.
 */
export function moveDeviceSettings(database: LernzeitDB): Promise<void> {
  return database.transaction('rw', database.kv, async () => {
    const [shared, device] = await database.kv.bulkGet([KV_KEYS.settings, KV_KEYS.deviceSettings])
    if (typeof shared?.value !== 'object' || shared.value === null) return
    const split = splitSettings(shared.value as Partial<Settings>)
    if (Object.keys(split.device).length === 0) return
    await database.kv.put({ key: KV_KEYS.deviceSettings, value: { ...split.device, ...(device?.value as object | undefined) } })
    await database.kv.put({ key: KV_KEYS.settings, value: split.shared })
  })
}

/** Pulls every change after `cursor` into `state`, the newest of each record winning. Returns the last cursor. */
async function pullInto(state: CloudState, cursor: string): Promise<string> {
  for (;;) {
    const page = await pull(cursor)
    for (const change of page.changes) if (acceptable(change)) state.set(keyOf(change.tbl, change.id), change)
    if (!page.more || page.cursor === cursor) return page.cursor
    cursor = page.cursor
  }
}

function cloudLibrary(state: CloudState): Library {
  const library: Library = {}
  for (const change of state.values()) {
    if (change.deleted) continue
    ;(library[change.tbl] ??= []).push(change.data as Record<string, unknown>)
  }
  return library
}

/** Every synced row here: images as their metadata (with the bytes beside), kv only its synced keys. */
function readLocal(database: LernzeitDB): Promise<{ library: Library; blobs: Map<string, Blob> }> {
  return database.transaction('r', [...SYNC_TABLES], async () => {
    const library: Library = {}
    const blobs = new Map<string, Blob>()
    for (const tbl of SYNC_TABLES) {
      const rows = (await database.table(tbl).toArray()) as Record<string, unknown>[]
      if (tbl === 'images') {
        for (const image of rows as unknown as StoredImage[]) blobs.set(image.id, image.blob)
        library.images = (rows as unknown as StoredImage[]).map((image) => ({ ...imageMeta(image) }))
      } else library[tbl] = tbl === 'kv' ? rows.filter((row) => isSynced('kv', String(row.key))) : rows
    }
    return { library, blobs }
  })
}

/**
 * The fold's uploads as changes. Each is stamped with `uploadTime`; a record the fold chose over
 * the cloud's copy is stamped at least as late as that copy, so newest-wins keeps it.
 */
function uploads(fold: FoldResult, cloud: CloudState, blobs: Map<string, Blob>): Upload[] {
  const mustWin = new Set(fold.mustWin.map(({ tbl, id }) => keyOf(tbl, id)))
  const list: Upload[] = []
  for (const tbl of SYNC_TABLES) {
    for (const row of fold.upload[tbl] ?? []) {
      const id = recordId(tbl, row)
      const key = keyOf(tbl, id)
      const theirs = cloud.get(key)
      const updatedAt = mustWin.has(key) ? Math.max(uploadTime(tbl, row), theirs?.updatedAt ?? 0) : uploadTime(tbl, row)
      const change: SyncChange = { tbl, id, data: row, updatedAt, deleted: false }
      if (tbl !== 'images') {
        list.push({ change, row })
        continue
      }
      const blob = blobs.get(id)!
      const stored: StoredImage = { ...(row as unknown as ImageMeta), blob }
      // Bytes the cloud has already are not sent again.
      list.push({ change, row: stored, blob: theirs && !theirs.deleted ? undefined : blob })
    }
  }
  return list
}

/** Uploads the images' bytes, then pushes the records. Returns what the cloud refused; any other failure throws. */
async function upload(list: Upload[]): Promise<Refused[]> {
  const refused: Refused[] = []
  const refuse = (item: Upload, reason: string) => refused.push({ tbl: item.change.tbl, id: item.change.id, row: item.row, reason })
  const ready: Upload[] = []
  for (const item of list) {
    const reason = refusal(item.change, item.blob ?? (item.change.tbl === 'images' ? (item.row as StoredImage).blob : undefined))
    if (reason) {
      refuse(item, reason)
      continue
    }
    if (item.blob) {
      try {
        await putImage(item.change.id, item.blob)
      } catch (error) {
        if (!refusedBy(error, IMAGE_REFUSALS)) throw error
        refuse(item, error.message)
        continue
      }
    }
    ready.push(item)
  }
  for (const batch of batches(ready)) await send(batch, refuse)
  return refused
}

/** Splits changes into pushes of at most MAX_PUSH_CHANGES and MAX_PUSH_BYTES. */
function batches(list: Upload[]): Upload[][] {
  const result: Upload[][] = []
  let batch: Upload[] = []
  let bytes = PUSH_ENVELOPE_BYTES
  for (const item of list) {
    const size = encoder.encode(JSON.stringify(item.change)).byteLength + 1
    if (batch.length > 0 && (batch.length === MAX_PUSH_CHANGES || bytes + size > MAX_PUSH_BYTES)) {
      result.push(batch)
      batch = []
      bytes = PUSH_ENVELOPE_BYTES
    }
    batch.push(item)
    bytes += size
  }
  if (batch.length > 0) result.push(batch)
  return result
}

/** Pushes one batch. A batch the cloud refuses goes in halves down to the change at fault, as the engine does. */
async function send(batch: Upload[], refuse: (item: Upload, reason: string) => void): Promise<void> {
  if (batch.length === 0) return
  try {
    await push(batch.map((item) => item.change))
  } catch (error) {
    if (!refusedBy(error, PUSH_REFUSALS)) throw error
    if (batch.length === 1) return void refuse(batch[0], error.message)
    const half = Math.ceil(batch.length / 2)
    await send(batch.slice(0, half), refuse)
    await send(batch.slice(half), refuse)
  }
}

/** The bytes of the cloud's live images that are not here yet, and the ids whose bytes the cloud no longer has. */
async function downloadImages(database: LernzeitDB, cloud: CloudState): Promise<{ downloaded: Map<string, Blob>; missing: Set<string> }> {
  const downloaded = new Map<string, Blob>()
  const missing = new Set<string>()
  const here = new Set(await database.images.toCollection().primaryKeys())
  for (const change of cloud.values()) {
    if (change.tbl !== 'images' || change.deleted || here.has(change.id)) continue
    try {
      downloaded.set(change.id, await getImage(change.id))
    } catch (error) {
      if (!refusedBy(error, [404])) throw error
      missing.add(change.id)
    }
  }
  return { downloaded, missing }
}

/**
 * In one transaction: this browser's synced rows give way to the cloud's live records. Images
 * stay where the cloud has them too, so their bytes need not come down again. The outbox, which
 * recorded every write since before the first sign-in, is cleared: the merge uploaded them.
 * Records the cloud refused stay as they were and wait in the outbox as stuck.
 */
function replaceLocal(
  database: LernzeitDB,
  cloud: CloudState,
  cursor: string,
  downloaded: Map<string, Blob>,
  missing: Set<string>,
  refused: Refused[],
): Promise<void> {
  return applyRemote(database, async () => {
    const live = [...cloud.values()].filter((change) => !change.deleted)
    const liveImages = live.filter((change) => change.tbl === 'images')
    const keptImages = new Set([...liveImages.map((change) => change.id), ...refused.filter((r) => r.tbl === 'images').map((r) => r.id)])
    const imageIds = (await database.images.toCollection().primaryKeys()) as string[]
    const localImages = new Map((await database.images.bulkGet(liveImages.map((change) => change.id))).flatMap((image) => (image ? [[image.id, image]] : [])))

    await Promise.all([
      ...SYNC_TABLES.filter((tbl) => tbl !== 'images' && tbl !== 'kv').map((tbl) => database.table(tbl).clear()),
      // Only the synced kv keys: the others belong to this device.
      database.kv.bulkDelete([...SYNCED_KV_KEYS]),
      database.images.bulkDelete(imageIds.filter((id) => !keptImages.has(id))),
      database.outbox.clear(),
    ])

    const puts = new Map<string, unknown[]>()
    const add = (tbl: string, row: unknown) => {
      const list = puts.get(tbl)
      if (list) list.push(row)
      else puts.set(tbl, [row])
    }
    const missingImages = new Set<string>()
    for (const change of live) {
      if (change.tbl !== 'images') {
        add(change.tbl, change.data)
        continue
      }
      const meta = change.data as ImageMeta
      const bytes = downloaded.get(change.id) ?? localImages.get(change.id)?.blob
      if (!bytes) {
        if (missing.has(change.id)) missingImages.add(change.id)
        continue
      }
      add('images', { id: meta.id, width: meta.width, height: meta.height, fit: meta.fit, blob: new Blob([bytes], { type: meta.type }) } satisfies StoredImage)
    }
    await Promise.all([...puts].map(([tbl, rows]) => database.table(tbl).bulkPut(rows)))

    // Refused rows keep this browser's version, after the cloud's, so a copy there does not replace it.
    const at = Date.now()
    await Promise.all(refused.map(({ tbl, row }) => database.table(tbl).put(row)))
    await database.outbox.bulkPut(refused.map(({ tbl, id, reason }): OutboxEntry => ({ tbl, id, at, stuck: reason })))

    await database.meta.bulkPut([
      { key: MERGED_KEY, value: true },
      { key: CURSOR_KEY, value: cursor },
      ...(missingImages.size ? [{ key: MISSING_IMAGES_KEY, value: [...missingImages] }] : []),
    ])
  })
}
