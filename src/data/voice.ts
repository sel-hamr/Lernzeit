import type { Settings, VoiceEngine } from '@/db/types'
import { browserSpeak, browserStop } from '@/lib/speech'
import { isThorstenDownloaded, THORSTEN_VOICE, thorstenWav, warmUpThorsten } from '@/lib/thorsten'
import { clipKey, readClip, saveClip } from './clips'

export interface VoiceOptions {
  engine?: VoiceEngine
  /** Browser voice; also used when Thorsten is not available. */
  voiceURI?: string
  rate?: number
}

/** The voice settings every speaker button uses. */
export function voiceOptions(settings: Pick<Settings, 'voiceEngine' | 'voiceURI' | 'speechRate'>): VoiceOptions {
  return { engine: settings.voiceEngine, voiceURI: settings.voiceURI, rate: settings.speechRate }
}

let playing: HTMLAudioElement | null = null
// Bumped by every speak or stop, so a clip that finishes late never plays over newer audio.
let turn = 0

export function stopSpeaking() {
  turn++
  browserStop()
  if (playing) {
    playing.pause()
    URL.revokeObjectURL(playing.src)
    playing = null
  }
}

/**
 * Speaks German text. With the Thorsten voice it plays a saved clip or makes
 * one; until the voice is downloaded, or if it fails, the browser voice speaks.
 */
export function speak(text: string, opts: VoiceOptions = {}) {
  stopSpeaking()
  if (!text.trim()) return
  if (opts.engine !== 'thorsten') return browserSpeak(text, opts)
  const mine = turn
  thorstenClip(text)
    .catch(() => undefined)
    .then((clip) => {
      if (mine !== turn) return
      if (clip) play(clip, opts.rate)
      else browserSpeak(text, opts)
    })
}

/** Makes the clip ahead of time, so it plays at once later. Does nothing for the browser voice. */
export function prepareSpeech(text: string, opts: VoiceOptions = {}) {
  if (opts.engine === 'thorsten' && text.trim()) void thorstenClip(text).catch(() => undefined)
}

/** Loads the Thorsten voice in the background, for pages that will speak soon. */
export function warmUpVoice(opts: VoiceOptions = {}) {
  if (opts.engine !== 'thorsten') return
  void isThorstenDownloaded()
    .then((ok) => (ok ? warmUpThorsten() : undefined))
    .catch(() => undefined)
}

// Clips being made, so preparing and speaking the same text share one job.
const making = new Map<string, Promise<Blob>>()

/** A saved clip, or a new one. Undefined while the voice is not downloaded. */
async function thorstenClip(text: string): Promise<Blob | undefined> {
  if (!(await isThorstenDownloaded())) return undefined
  const key = clipKey(THORSTEN_VOICE, text)
  const saved = await readClip(key)
  if (saved) return saved
  let job = making.get(key)
  if (!job) {
    job = thorstenWav(text.trim())
      .then(async (wav) => {
        await saveClip(key, wav)
        return wav
      })
      .finally(() => making.delete(key))
    making.set(key, job)
  }
  return job
}

function play(clip: Blob, rate = 1) {
  const audio = new Audio(URL.createObjectURL(clip))
  // Speed without changing the pitch, like the browser voice.
  audio.preservesPitch = true
  audio.playbackRate = rate
  audio.onended = () => {
    if (playing !== audio) return
    URL.revokeObjectURL(audio.src)
    playing = null
  }
  playing = audio
  void audio.play().catch(() => undefined)
}
