/**
 * The offline German voice "Thorsten" (Piper, public domain), run in a worker.
 * The model downloads once (about 63 MB) and stays in the browser.
 * https://github.com/thorstenMueller/Thorsten-Voice
 */

export const THORSTEN_VOICE = 'de_DE-thorsten-medium'
/** Shown before the download; the model file is 63,201,294 bytes. */
export const THORSTEN_SIZE_MB = 63

export type ThorstenRequest =
  | { id: number; type: 'status' | 'download' | 'remove' | 'warm'; voiceId: string }
  | { id: number; type: 'speak'; voiceId: string; text: string }

export interface ThorstenReply {
  id: number
  stored?: boolean
  wav?: Blob
  progress?: { loaded: number; total: number }
  error?: string
}

type Job = { resolve: (reply: ThorstenReply) => void; reject: (error: Error) => void; onProgress?: (fraction: number) => void }

let worker: Worker | null = null
let nextId = 1
const jobs = new Map<number, Job>()

function getWorker(): Worker {
  if (worker) return worker
  worker = new Worker(new URL('./thorsten.worker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (event: MessageEvent<ThorstenReply>) => {
    const reply = event.data
    const job = jobs.get(reply.id)
    if (!job) return
    if (reply.progress) {
      if (reply.progress.total) job.onProgress?.(Math.min(1, reply.progress.loaded / reply.progress.total))
      return
    }
    jobs.delete(reply.id)
    if (reply.error) job.reject(new Error(reply.error))
    else job.resolve(reply)
  }
  worker.onerror = (event) => {
    const error = new Error(event.message || 'The Thorsten voice could not start')
    for (const job of jobs.values()) job.reject(error)
    jobs.clear()
    worker?.terminate()
    worker = null
  }
  return worker
}

// Omit each member of the union, so `speak` keeps its `text`.
type Unsent<R = ThorstenRequest> = R extends unknown ? Omit<R, 'id'> : never

function call(request: Unsent, onProgress?: (fraction: number) => void): Promise<ThorstenReply> {
  const id = nextId++
  return new Promise((resolve, reject) => {
    jobs.set(id, { resolve, reject, onProgress })
    getWorker().postMessage({ ...request, id })
  })
}

export function thorstenSupported(): boolean {
  return typeof Worker !== 'undefined' && typeof navigator !== 'undefined' && !!navigator.storage?.getDirectory
}

let downloaded: Promise<boolean> | null = null

/** Whether the model is in this browser. Checked once, then remembered. */
export function isThorstenDownloaded(): Promise<boolean> {
  if (!thorstenSupported()) return Promise.resolve(false)
  downloaded ??= call({ type: 'status', voiceId: THORSTEN_VOICE })
    .then((r) => !!r.stored)
    .catch(() => false)
  return downloaded
}

/**
 * Downloads the model; `onProgress` gets 0 to 1. Then loads it, because
 * piper-tts-web saves whatever the server sends: a broken download is removed
 * here instead of staying behind as a voice that never speaks.
 */
export async function downloadThorsten(onProgress?: (fraction: number) => void): Promise<void> {
  downloaded = null
  await call({ type: 'download', voiceId: THORSTEN_VOICE }, onProgress)
  try {
    await call({ type: 'warm', voiceId: THORSTEN_VOICE })
  } catch (error) {
    await call({ type: 'remove', voiceId: THORSTEN_VOICE }).catch(() => undefined)
    throw error
  }
  downloaded = Promise.resolve(true)
}

export async function removeThorsten(): Promise<void> {
  await call({ type: 'remove', voiceId: THORSTEN_VOICE })
  downloaded = Promise.resolve(false)
}

/** Loads the model into memory (about 2 s), so the first clip does not wait for it. */
export async function warmUpThorsten(): Promise<void> {
  await call({ type: 'warm', voiceId: THORSTEN_VOICE })
}

/** Makes a WAV clip of German text. */
export async function thorstenWav(text: string): Promise<Blob> {
  const reply = await call({ type: 'speak', voiceId: THORSTEN_VOICE, text })
  if (!reply.wav) throw new Error('The Thorsten voice returned no audio')
  return reply.wav
}
