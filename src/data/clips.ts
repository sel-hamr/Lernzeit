import { db, type LernzeitDB } from '@/db/db'

/** Space for clips. WAV is about 44 KB per second, so this holds roughly 40 minutes of speech. */
export const MAX_CLIP_BYTES = 100 * 1024 * 1024

/** One clip per voice and text. Speed is applied when playing, so it is not part of the key. */
export function clipKey(voiceId: string, text: string): string {
  return `${voiceId}:${text.trim()}`
}

/** A saved clip, marked as used now so it is kept. */
export async function readClip(key: string, database: LernzeitDB = db): Promise<Blob | undefined> {
  const clip = await database.clips.get(key)
  if (!clip) return undefined
  await database.clips.update(key, { usedAt: Date.now() })
  return clip.blob
}

/** Saves a clip, then drops the least recently used ones until the clips fit in `maxBytes`. */
export async function saveClip(key: string, blob: Blob, database: LernzeitDB = db, maxBytes = MAX_CLIP_BYTES): Promise<void> {
  await database.transaction('rw', database.clips, async () => {
    await database.clips.put({ key, blob, bytes: blob.size, usedAt: Date.now() })
    const clips = await database.clips.orderBy('usedAt').toArray()
    let total = clips.reduce((sum, c) => sum + c.bytes, 0)
    const drop: string[] = []
    for (const clip of clips) {
      if (total <= maxBytes) break
      if (clip.key === key) continue
      drop.push(clip.key)
      total -= clip.bytes
    }
    if (drop.length) await database.clips.bulkDelete(drop)
  })
}

export async function clearClips(database: LernzeitDB = db): Promise<void> {
  await database.clips.clear()
}
