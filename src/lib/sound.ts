import type { EndSound } from '@/db/types'

/** Synthesised end-of-session sounds, so no audio files are needed offline. */

let context: AudioContext | null = null

function audio(): AudioContext | null {
  if (typeof window === 'undefined' || !('AudioContext' in window)) return null
  context ??= new AudioContext()
  return context
}

/** Call from a click so later sounds may play (browser autoplay rules). */
export function unlockAudio() {
  const ctx = audio()
  if (ctx && ctx.state === 'suspended') void ctx.resume()
}

function strike(ctx: AudioContext, freq: number, at: number, gain: number, decay: number) {
  // A bell is a few inharmonic partials that fade at different speeds.
  const partials: [number, number, number][] = [
    [1, 1, 1],
    [2.76, 0.42, 0.55],
    [5.4, 0.18, 0.35],
    [0.5, 0.25, 1.2],
  ]
  for (const [ratio, level, length] of partials) {
    const osc = ctx.createOscillator()
    const amp = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = freq * ratio
    amp.gain.setValueAtTime(0.0001, at)
    amp.gain.exponentialRampToValueAtTime(gain * level, at + 0.01)
    amp.gain.exponentialRampToValueAtTime(0.0001, at + decay * length)
    osc.connect(amp).connect(ctx.destination)
    osc.start(at)
    osc.stop(at + decay * length + 0.05)
  }
}

export function playEndSound(kind: EndSound) {
  if (kind === 'none') return
  const ctx = audio()
  if (!ctx) return
  if (ctx.state === 'suspended') void ctx.resume()
  const t = ctx.currentTime + 0.02
  if (kind === 'bell') {
    strike(ctx, 659.25, t, 0.22, 2.6)
    strike(ctx, 659.25, t + 1.1, 0.14, 2.4)
  } else {
    strike(ctx, 523.25, t, 0.16, 1.6)
    strike(ctx, 659.25, t + 0.22, 0.16, 1.6)
    strike(ctx, 783.99, t + 0.44, 0.18, 2.2)
  }
}

export const END_SOUND_LABEL: Record<EndSound, string> = {
  bell: 'Soft bell',
  chime: 'Chime',
  none: 'No sound',
}
