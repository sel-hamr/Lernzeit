/**
 * Text-to-speech with the browser's built-in voices (no API needed).
 * The app speaks through `speak` in data/voice, which can use the offline Thorsten voice for German instead.
 */

const supported = typeof window !== 'undefined' && 'speechSynthesis' in window

export function speechSupported(): boolean {
  return supported
}

/** The browser's voices for a language ("fr-FR" or "fr"), voices on this device first. */
export function voicesFor(lang: string): SpeechSynthesisVoice[] {
  if (!supported) return []
  const base = lang.split('-')[0].toLowerCase()
  return speechSynthesis
    .getVoices()
    .filter((v) => v.lang.toLowerCase().replace('_', '-').split('-')[0] === base)
    .sort((a, b) => Number(b.localService) - Number(a.localService) || a.name.localeCompare(b.name))
}

/** Voices load asynchronously in most browsers. */
export function onVoicesChanged(callback: () => void): () => void {
  if (!supported) return () => {}
  speechSynthesis.addEventListener('voiceschanged', callback)
  return () => speechSynthesis.removeEventListener('voiceschanged', callback)
}

export function browserSpeak(text: string, opts: { voiceURI?: string; rate?: number; lang?: string } = {}) {
  if (!supported || !text.trim()) return
  speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
  const lang = opts.lang ?? 'de-DE'
  utterance.lang = lang
  utterance.rate = opts.rate ?? 0.95
  // A chosen voice of another language (from before the language changed) is passed over.
  const voices = voicesFor(lang)
  const voice = voices.find((v) => v.voiceURI === opts.voiceURI) ?? voices.find((v) => v.lang === lang) ?? voices[0]
  if (voice) utterance.voice = voice
  speechSynthesis.speak(utterance)
}

export function browserStop() {
  if (supported) speechSynthesis.cancel()
}

/** "Microsoft Katja Online (Natural) - German (Germany)" → "Katja": a voice's name, short enough for the navbar. */
export function shortVoiceName(name: string): string {
  return name.replace(/^(Microsoft|Google|Apple)\s+/, '').split(/\s+[-(]/)[0].replace(/\s+Online$/, '').trim() || name
}
