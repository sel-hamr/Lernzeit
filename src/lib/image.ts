import type { ImageFit } from '@/db/types'

export const MAX_IMAGE_WIDTH = 600

export interface PreparedImage {
  blob: Blob
  width: number
  height: number
  fit: ImageFit
}

/**
 * Shrinks an image to at most 600px wide and re-encodes it as WebP (JPEG when
 * WebP encoding is unavailable). Images with transparency keep it and are
 * shown with object-fit: contain; photos use cover.
 */
export async function prepareImage(file: Blob): Promise<PreparedImage> {
  if (file.type === 'image/svg+xml') {
    const { width, height } = await measure(file)
    return { blob: file, width, height, fit: 'contain' }
  }

  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_IMAGE_WIDTH / bitmap.width)
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('Canvas is not available')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  const transparent = hasTransparency(ctx, width, height)
  let blob = await toBlob(canvas, 'image/webp', 0.82)
  if (!blob || blob.type !== 'image/webp') {
    blob = transparent ? await toBlob(canvas, 'image/png') : await toBlob(canvas, 'image/jpeg', 0.85)
  }
  if (!blob) throw new Error('Could not encode the image')
  return { blob, width, height, fit: transparent ? 'contain' : 'cover' }
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality))
}

function hasTransparency(ctx: CanvasRenderingContext2D, width: number, height: number): boolean {
  const { data } = ctx.getImageData(0, 0, width, height)
  // Sampling every 7th pixel is plenty to spot a transparent background.
  for (let i = 3; i < data.length; i += 4 * 7) if (data[i] < 250) return true
  return false
}

function measure(blob: Blob): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      resolve({ width: img.naturalWidth || 240, height: img.naturalHeight || 180 })
      URL.revokeObjectURL(url)
    }
    img.onerror = () => {
      resolve({ width: 240, height: 180 })
      URL.revokeObjectURL(url)
    }
    img.src = url
  })
}

/** First image found in a paste or drop. */
export function imageFromDataTransfer(data: DataTransfer | null): File | null {
  if (!data) return null
  for (const item of Array.from(data.items ?? [])) {
    if (item.kind === 'file' && item.type.startsWith('image/')) return item.getAsFile()
  }
  for (const file of Array.from(data.files ?? [])) if (file.type.startsWith('image/')) return file
  return null
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl)
  return res.blob()
}
