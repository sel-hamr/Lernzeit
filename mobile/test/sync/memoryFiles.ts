/*
 * ImageFiles in memory for the sync tests: the phone's files as a map, with a way to make the
 * next write or read fail.
 */
import type { ImageFiles } from '../../src/sync/imageFiles'

export interface MemoryFiles extends ImageFiles {
  files: Map<string, Uint8Array>
  /** Set to make every write fail, as a full disk does. */
  failWrites: boolean
}

export function createMemoryFiles(): MemoryFiles {
  const files = new Map<string, Uint8Array>()
  const memory: MemoryFiles = {
    files,
    failWrites: false,
    pathFor: (id) => `file:///document/images/${encodeURIComponent(id)}`,
    async write(path, bytes) {
      if (memory.failWrites) throw new Error('No space left on the device')
      files.set(path, new Uint8Array(bytes))
    },
    async read(path) {
      const bytes = files.get(path)
      if (!bytes) throw new Error(`No file at ${path}`)
      return new Uint8Array(bytes)
    },
    async delete(path) {
      files.delete(path)
    },
    exists: async (path) => files.has(path),
  }
  return memory
}
