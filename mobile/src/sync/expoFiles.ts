/*
 * ImageFiles over expo-file-system: `<document directory>/images/<id>`, kept until the app is
 * uninstalled. Separate from imageFiles.ts so the engine and its tests never load the native module.
 */
import { Directory, File, Paths } from 'expo-file-system'
import type { ImageFiles } from './imageFiles'

const FOLDER = 'images'

export const expoImageFiles: ImageFiles = {
  // Image ids are the app's own, but a file name must not hold a slash.
  pathFor: (id) => new File(Paths.document, FOLDER, encodeURIComponent(id)).uri,
  async write(path, bytes) {
    new Directory(Paths.document, FOLDER).create({ intermediates: true, idempotent: true })
    await new File(path).write(bytes)
  },
  read: (path) => new File(path).bytes(),
  async delete(path) {
    const file = new File(path)
    if (file.exists) file.delete()
  },
  exists: async (path) => new File(path).exists,
}
