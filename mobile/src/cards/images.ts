/*
 * A card picture from the camera or the gallery: resized to about 600 px wide, saved as a JPEG file
 * in the app's image folder (the same place the sync puts pulled images), ready to become an
 * `images` record with `saveCard`'s `set` change.
 */
import { File } from 'expo-file-system'
import * as ImageManipulator from 'expo-image-manipulator'
import * as ImagePicker from 'expo-image-picker'
import { newId } from '../data/ids'
import type { ImageFile } from '../store/library'
import { expoImageFiles } from '../sync/expoFiles'

export const IMAGE_WIDTH = 600

/** Asks for the photo; undefined when cancelled or not allowed. */
export async function pickCardImage(source: 'camera' | 'gallery'): Promise<ImageFile | undefined> {
  if (source === 'camera') {
    const allowed = await ImagePicker.requestCameraPermissionsAsync()
    if (!allowed.granted) throw new Error('Camera access is off for Lernzeit. Allow it in the phone settings.')
  }
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: true, quality: 1 }
  const picked = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options)
  const asset = picked.canceled ? undefined : picked.assets[0]
  if (!asset) return undefined
  return saveImageFile(asset.uri, asset.width)
}

/** Resizes the picture at `uri` and writes it as a new image file. */
export async function saveImageFile(uri: string, width?: number): Promise<ImageFile> {
  const actions = width && width <= IMAGE_WIDTH ? [] : [{ resize: { width: IMAGE_WIDTH } }]
  const result = await ImageManipulator.manipulateAsync(uri, actions, { compress: 0.82, format: ImageManipulator.SaveFormat.JPEG })
  const id = newId()
  const path = expoImageFiles.pathFor(id)
  await expoImageFiles.write(path, await new File(result.uri).bytes())
  return { id, path, type: 'image/jpeg', width: result.width, height: result.height, fit: 'cover' }
}
