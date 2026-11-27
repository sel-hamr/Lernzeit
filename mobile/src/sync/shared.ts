/*
 * What the engine (engine.ts) and the first-sync merge (merge.ts) both use: the meta keys, the
 * refusal rules for server answers, and moving one image's bytes between the cloud and a file.
 */
import type { ImageMeta, SyncChange } from '@lernzeit/core/sync'
import { refusal } from '@lernzeit/core/syncRules'
import { ApiError, SignedOutError, type Api } from '../api'
import { ACCOUNT_KEY, type ImageFile, type LocalLibrary } from '../store/library'
import type { ImageFiles } from './imageFiles'

/** `meta` key of the position in the cloud's changes this phone has pulled up to. */
export const CURSOR_KEY = 'cursor'
/** `meta` key set once this phone's library is in the cloud (merged, or pulled into an empty phone). */
export const MERGED_KEY = 'merged'
/** `meta` key of the pulled image records whose bytes the cloud no longer had, to apply once they are back. */
export const MISSING_IMAGES_KEY = 'missingImages'

export interface MissingImage {
  data: ImageMeta
  updatedAt: number
}

/** Server answers that refuse what was sent, not the request: 400 names a bad change, 413 is too large, 415 not an image. */
export const PUSH_REFUSALS = [400, 413]
export const IMAGE_REFUSALS = [400, 413, 415]

export function refusedBy(error: unknown, statuses: number[]): error is ApiError {
  return error instanceof ApiError && statuses.includes(error.status)
}

export type SyncApi = Pick<Api, 'push' | 'pull' | 'putImage' | 'getImage'>

/** What a sync works with. */
export interface SyncContext {
  library: LocalLibrary
  api: SyncApi
  files: ImageFiles
}

export const MISSING_FILE = 'The image file is missing on this phone, so it cannot sync.'

/**
 * Throws SignedOutError when the account is gone, as after a sign-out during this sync. Checked
 * before each write a sync makes, so a sync in flight writes nothing into a library being cleared.
 */
export function assertSignedIn(library: LocalLibrary): void {
  if (library.getMeta(ACCOUNT_KEY) === undefined) throw new SignedOutError()
}

/**
 * Reads an image's bytes from its file, or answers why it cannot go up: the file is gone, or the
 * cloud would refuse the bytes. Any other read failure throws.
 */
export async function readImage(files: ImageFiles, change: SyncChange, file: ImageFile): Promise<{ bytes: Uint8Array } | { reason: string }> {
  if (!(await files.exists(file.path))) return { reason: MISSING_FILE }
  const bytes = await files.read(file.path)
  const reason = refusal(change, { type: file.type, size: bytes.byteLength })
  return reason ? { reason } : { bytes }
}

/** Whether this phone already has the image's bytes in a file. */
export async function haveImage({ library, files }: SyncContext, id: string): Promise<boolean> {
  const file = library.imageFile(id)
  return file !== undefined && (await files.exists(file.path))
}

/**
 * Downloads an image's bytes into its file. Returns the file's path, or undefined when the cloud no
 * longer has them (404). Any other failure throws.
 */
export async function downloadImage({ library, api, files }: SyncContext, id: string): Promise<string | undefined> {
  let bytes: ArrayBuffer
  try {
    bytes = (await api.getImage(id)).bytes
  } catch (error) {
    // Waiting would not bring them back, and would stop this phone pulling for good.
    if (refusedBy(error, [404])) return undefined
    throw error
  }
  assertSignedIn(library)
  const path = files.pathFor(id)
  await files.write(path, new Uint8Array(bytes))
  return path
}

/** The file row of a pulled image record whose bytes are at `path`. */
export const imageFileFor = (meta: ImageMeta, path: string): ImageFile => ({ id: meta.id, path, type: meta.type, width: meta.width, height: meta.height, fit: meta.fit })
