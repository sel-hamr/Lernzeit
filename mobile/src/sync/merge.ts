/*
 * The first sync of a library into the cloud, as the web's src/sync/firstSignIn.ts. A phone with no
 * synced data (the usual first sign-in) simply pulls everything: it is marked merged at once, so a
 * pull cut short resumes from its cursor like any other. A phone that has data of its own (rare: a
 * 409 resync, or data written before signing in) folds it into the cloud's with core's
 * `foldLibraries`: this phone's copies of the starter are mapped onto the cloud's and whatever only
 * this phone has goes up; then the local copy is replaced by the cloud's, so every device holds the
 * same records under the same ids. It merges, never replaces: an upload the cloud ends up without
 * stays here and goes up again.
 *
 * Everything before the last step only reads here, so a failure leaves the phone as it was and the
 * merge simply runs again on the next sync. The last step writes everything in one transaction.
 */
import { foldLibraries, uploadTime, type FoldResult, type Library } from '@lernzeit/core/fold'
import { MAX_PUSH_BYTES, MAX_PUSH_CHANGES, SYNC_TABLES, isSynced, recordId, type ImageMeta, type PulledChange, type SyncChange, type SyncTable } from '@lernzeit/core/sync'
import { acceptablePulled, batchChanges, changeBytes, refusal, splitOnRefusal } from '@lernzeit/core/syncRules'
import type { ImageFile, LocalLibrary, OutboxEntry } from '../store/library'
import {
  CURSOR_KEY,
  IMAGE_REFUSALS,
  MERGED_KEY,
  MISSING_FILE,
  MISSING_IMAGES_KEY,
  PUSH_REFUSALS,
  assertSignedIn,
  downloadImage,
  haveImage,
  imageFileFor,
  readImage,
  refusedBy,
  type MissingImage,
  type SyncContext,
} from './shared'

const keyOf = (tbl: string, id: string) => `${tbl}/${id}`

/** The cloud's records by `tbl/id`, as last pulled; tombstones included. */
type CloudState = Map<string, PulledChange>

interface Upload {
  change: SyncChange
  /** An image's file, whose bytes go up first when the cloud has no live copy of the image. */
  file?: ImageFile
  sendBytes: boolean
}

/** A record the cloud would not take. It stays here and waits in the outbox as stuck. */
interface Refused {
  tbl: SyncTable
  id: string
  /** The record as the fold left it, kept here. */
  data: unknown
  reason: string
}

/** Whether this phone holds synced records of its own, or changes waiting to go up. */
export function hasLocalData(library: LocalLibrary): boolean {
  if (library.outboxSize() > 0) return true
  return SYNC_TABLES.some((tbl) => (tbl === 'kv' ? library.listIds('kv').some((key) => isSynced('kv', key)) : library.count(tbl) > 0))
}

/**
 * Brings a library that is not merged yet into the cloud: merges it when it has data, or marks an
 * empty one merged so the ordinary pull takes everything in. Returns whether it merged.
 */
export async function firstSync(context: SyncContext): Promise<boolean> {
  if (!hasLocalData(context.library)) {
    context.library.setMeta(MERGED_KEY, true)
    return false
  }
  await mergeIntoCloud(context)
  return true
}

/** Folds this phone's library into the cloud's, uploads it, and replaces the local copy with the cloud's. */
export async function mergeIntoCloud(context: SyncContext): Promise<void> {
  const { library } = context
  const cloud: CloudState = new Map()
  const cursor = await pullInto(context, cloud, '')

  const fold = foldLibraries(readLocal(library), cloudLibrary(cloud))
  const list = uploads(library, fold, cloud)
  const refused = await upload(context, list)

  // What the cloud holds now: the state above and everything since, ours included.
  const finalCursor = await pullInto(context, cloud, cursor)
  const { downloaded, missing } = await downloadImages(context, cloud)

  const refusedKeys = new Set(refused.map(({ tbl, id }) => keyOf(tbl, id)))
  const sent = list.filter(({ change }) => !refusedKeys.has(keyOf(change.tbl, change.id)))
  // An upload the cloud has no live copy of (a delete won meanwhile, or the push was lost) stays
  // here and goes up again: a merge never deletes this phone's data.
  const unconfirmed = sent.filter(({ change }) => {
    const theirs = cloud.get(keyOf(change.tbl, change.id))
    return theirs === undefined || theirs.deleted
  })
  if (unconfirmed.length) {
    console.warn(
      `The merge kept ${unconfirmed.length} record(s) the cloud does not hold, and queued them to upload again:`,
      unconfirmed.map(({ change }) => keyOf(change.tbl, change.id)),
    )
  }
  replaceLocal(library, cloud, finalCursor, downloaded, missing, refused, unconfirmed)
}

/** Pulls every change after `cursor` into `state`, the newest of each record winning. Returns the last cursor. */
async function pullInto({ api }: SyncContext, state: CloudState, cursor: string): Promise<string> {
  for (;;) {
    const page = await api.pull(cursor)
    for (const change of page.changes) if (acceptablePulled(change)) state.set(keyOf(change.tbl, change.id), change)
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

/** Every synced record here; images are their synced metadata already, kv only its synced keys. */
function readLocal(library: LocalLibrary): Library {
  const local: Library = {}
  for (const tbl of SYNC_TABLES) {
    const rows = library.list<Record<string, unknown>>(tbl)
    local[tbl] = tbl === 'kv' ? rows.filter((row) => isSynced('kv', String(row.key))) : rows
  }
  return local
}

/**
 * The fold's uploads as changes, stamped as the web stamps them: with `uploadTime`, at least as late
 * as the cloud's copy where the fold chose this phone's, and after the cloud's tombstone.
 */
function uploads(library: LocalLibrary, fold: FoldResult, cloud: CloudState): Upload[] {
  const mustWin = new Set(fold.mustWin.map(({ tbl, id }) => keyOf(tbl, id)))
  const list: Upload[] = []
  for (const tbl of SYNC_TABLES) {
    for (const row of fold.upload[tbl] ?? []) {
      const id = recordId(tbl, row)
      const key = keyOf(tbl, id)
      const theirs = cloud.get(key)
      const updatedAt = theirs?.deleted
        ? Math.max(uploadTime(tbl, row), theirs.updatedAt + 1)
        : mustWin.has(key)
          ? Math.max(uploadTime(tbl, row), theirs?.updatedAt ?? 0)
          : uploadTime(tbl, row)
      const change: SyncChange = { tbl, id, data: row, updatedAt, deleted: false }
      // Bytes the cloud has already are not sent again.
      if (tbl === 'images') list.push({ change, file: library.imageFile(id), sendBytes: !theirs || theirs.deleted })
      else list.push({ change, sendBytes: false })
    }
  }
  return list
}

/** Uploads the images' bytes, then pushes the records. Returns what the cloud refused; any other failure throws. */
async function upload(context: SyncContext, list: Upload[]): Promise<Refused[]> {
  const refused: Refused[] = []
  const refuse = (item: Upload, reason: string) => refused.push({ tbl: item.change.tbl, id: item.change.id, data: item.change.data, reason })
  const ready: Upload[] = []
  for (const item of list) {
    const reason = refusal(item.change)
    if (reason) {
      refuse(item, reason)
      continue
    }
    if (item.sendBytes) {
      const image = item.file ? await readImage(context.files, item.change, item.file) : { reason: MISSING_FILE }
      if ('reason' in image) {
        refuse(item, image.reason)
        continue
      }
      try {
        await context.api.putImage(item.change.id, image.bytes, item.file!.type)
      } catch (error) {
        if (!refusedBy(error, IMAGE_REFUSALS)) throw error
        refuse(item, error.message)
        continue
      }
    }
    ready.push(item)
  }
  const sized = ready.map((item) => ({ item, bytes: changeBytes(item.change) }))
  for (const batch of batchChanges(sized, MAX_PUSH_CHANGES, MAX_PUSH_BYTES)) await send(context, batch.map(({ item }) => item), refuse)
  return refused
}

/** Pushes one batch. A batch the cloud refuses goes in halves down to the change at fault, as the engine does. */
async function send(context: SyncContext, batch: Upload[], refuse: (item: Upload, reason: string) => void): Promise<void> {
  if (batch.length === 0) return
  try {
    await context.api.push(batch.map((item) => item.change))
  } catch (error) {
    if (!refusedBy(error, PUSH_REFUSALS)) throw error
    const halves = splitOnRefusal(batch)
    if (!halves) return void refuse(batch[0], error.message)
    await send(context, halves[0], refuse)
    await send(context, halves[1], refuse)
  }
}

/** Puts the bytes of the cloud's live images that are not here yet into files; notes the ones the cloud no longer has. */
async function downloadImages(context: SyncContext, cloud: CloudState): Promise<{ downloaded: Map<string, string>; missing: Set<string> }> {
  const downloaded = new Map<string, string>()
  const missing = new Set<string>()
  for (const change of cloud.values()) {
    if (change.tbl !== 'images' || change.deleted || (await haveImage(context, change.id))) continue
    const path = await downloadImage(context, change.id)
    if (path === undefined) missing.add(change.id)
    else downloaded.set(change.id, path)
  }
  return { downloaded, missing }
}

/**
 * In one transaction: this phone's synced records give way to the cloud's live ones. Image files
 * stay where the cloud has the image too, so their bytes need not come down again. The outbox is
 * cleared: the merge uploaded it. Records the cloud refused, and uploads it has no live copy of,
 * keep this phone's version and wait in the outbox (the refused ones parked).
 */
function replaceLocal(
  library: LocalLibrary,
  cloud: CloudState,
  cursor: string,
  downloaded: Map<string, string>,
  missing: Set<string>,
  refused: Refused[],
  unconfirmed: Upload[],
): void {
  library.applyRemote((remote) => {
    // Signed out since this sync began: the library is about to be cleared, so write none of it back.
    assertSignedIn(library)
    const live = [...cloud.values()].filter((change) => !change.deleted)
    const liveKeys = new Set(live.map((change) => keyOf(change.tbl, change.id)))
    const kept = new Set([...refused.map(({ tbl, id }) => keyOf(tbl, id)), ...unconfirmed.map(({ change }) => keyOf(change.tbl, change.id))])

    // What only this phone had, and the fold mapped onto the cloud's copies, goes (an image with its file).
    for (const tbl of SYNC_TABLES) {
      for (const id of library.listIds(tbl)) {
        const key = keyOf(tbl, id)
        if (isSynced(tbl, id) && !liveKeys.has(key) && !kept.has(key)) remote.apply({ tbl, id, data: null, updatedAt: 0, deleted: true })
      }
    }
    for (const { tbl, id } of library.outbox()) library.removeOutboxEntry(tbl, id)

    const missingImages: MissingImage[] = []
    for (const change of live) {
      if (kept.has(keyOf(change.tbl, change.id))) continue
      if (change.tbl !== 'images') {
        remote.apply(change)
        continue
      }
      const meta = change.data as ImageMeta
      const path = downloaded.get(change.id) ?? library.imageFile(change.id)?.path
      if (path === undefined) {
        if (missing.has(change.id)) missingImages.push({ data: meta, updatedAt: change.updatedAt })
        continue
      }
      remote.apply(change)
      library.putImageFile(imageFileFor(meta, path))
    }

    // Refused and unconfirmed records keep this phone's version, as the fold left it (pointed at the cloud's copies).
    for (const { tbl, data } of [...refused, ...unconfirmed.map(({ change }) => change)]) library.put(tbl, data as object)

    // Stamped after the cloud's copy and the upload's own time, so the next push wins.
    const at = library.now()
    library.putOutboxEntries([
      ...refused.map(({ tbl, id, reason }): OutboxEntry => ({ tbl, id, at, stuck: reason })),
      ...unconfirmed.map(({ change }): OutboxEntry => {
        const theirs = cloud.get(keyOf(change.tbl, change.id))
        return { tbl: change.tbl, id: change.id, at: Math.max(at, change.updatedAt, (theirs?.updatedAt ?? 0) + 1) }
      }),
    ])
    library.setMeta(MERGED_KEY, true)
    library.setMeta(CURSOR_KEY, cursor)
    if (missingImages.length > 0) library.setMeta(MISSING_IMAGES_KEY, missingImages)
  })
}
