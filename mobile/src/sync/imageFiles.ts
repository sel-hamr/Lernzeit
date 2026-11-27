/*
 * Image bytes on this phone live in files, one per image, never in SQLite: the store keeps only
 * where each file is (store/library.ts `images`). The sync engine reads a file to upload it and
 * writes one before it applies the pulled record that needs it. Behind this small interface so
 * the engine's tests run on files in memory (test/sync/memoryFiles.ts); the app uses expoFiles.ts.
 */
import type { ImageFile } from '../store/library'

export interface ImageFiles {
  /** The URI an image's bytes are kept at on this phone. */
  pathFor(id: string): string
  /** Writes (or replaces) the file, creating its folder when needed. */
  write(path: string, bytes: Uint8Array): Promise<void>
  read(path: string): Promise<Uint8Array>
  /** Deletes the file; one that is not there is fine. */
  delete(path: string): Promise<void>
  exists(path: string): Promise<boolean>
}

/** Deletes the files of removed image rows, one at a time; a failure is logged, not thrown (a stray file costs only space). */
export async function deleteImageFiles(files: ImageFiles, removed: readonly Pick<ImageFile, 'path'>[]): Promise<void> {
  for (const { path } of removed) {
    try {
      await files.delete(path)
    } catch (error) {
      console.warn(`Could not delete the image file ${path}`, error)
    }
  }
}
