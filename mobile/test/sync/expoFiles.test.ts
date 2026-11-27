import { expoImageFiles } from '../../src/sync/expoFiles'

// expo-file-system as a map of URIs, enough to check the paths and calls.
const mockDisk = new Map<string, Uint8Array>()
const mockFolders: string[] = []
jest.mock('expo-file-system', () => {
  const join = (parts: unknown[]) => parts.map((part) => (typeof part === 'string' ? part : (part as { uri: string }).uri)).join('/')
  class File {
    uri: string
    constructor(...parts: unknown[]) {
      this.uri = join(parts)
    }
    get exists() {
      return mockDisk.has(this.uri)
    }
    async write(bytes: Uint8Array) {
      mockDisk.set(this.uri, bytes)
    }
    async bytes() {
      return mockDisk.get(this.uri)!
    }
    delete() {
      if (!mockDisk.delete(this.uri)) throw new Error('No such file')
    }
  }
  class Directory {
    uri: string
    constructor(...parts: unknown[]) {
      this.uri = join(parts)
    }
    create(options: { intermediates?: boolean; idempotent?: boolean }) {
      if (options.idempotent) mockFolders.push(this.uri)
    }
  }
  return { File, Directory, Paths: { document: { uri: 'file:///data/files' } } }
})

describe('the image files on the phone', () => {
  it('keeps each image in the document directory’s images folder, and deletes it once', async () => {
    const path = expoImageFiles.pathFor('a/b')
    expect(path).toBe('file:///data/files/images/a%2Fb')
    await expoImageFiles.write(path, new Uint8Array([1, 2]))
    expect(mockFolders).toEqual(['file:///data/files/images'])
    expect(await expoImageFiles.exists(path)).toBe(true)
    expect(await expoImageFiles.read(path)).toEqual(new Uint8Array([1, 2]))
    await expoImageFiles.delete(path)
    await expect(expoImageFiles.delete(path)).resolves.toBeUndefined()
    expect(await expoImageFiles.exists(path)).toBe(false)
  })
})
