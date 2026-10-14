/** German text-to-speech with the browser's built-in voices (no API needed). */

const supported = typeof window !== 'undefined' && 'speechSynthesis' in window

export function speechSupported(): boolean {
  return supported
}

export function germanVoices(): SpeechSynthesisVoice[] {
  if (!supported) return []
  return speechSynthesis
    .getVoices()
    .filter((v) => v.lang.toLowerCase().startsWith('de'))
    .sort((a, b) => Number(b.localService) - Number(a.localService) || a.name.localeCompare(b.name))
}

/** Voices load asynchronously in most browsers. */
export function onVoicesChanged(callback: () => void): () => void {
  if (!supported) return () => {}
  speechSynthesis.addEventListener('voiceschanged', callback)
  return () => speechSynthesis.removeEventListener('voiceschanged', callback)
}

export function speak(text: string, opts: { voiceURI?: string; rate?: number; lang?: string } = {}) {
  if (!supported || !text.trim()) return
  speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
  const lang = opts.lang ?? 'de-DE'
  utterance.lang = lang
  utterance.rate = opts.rate ?? 0.95
  if (lang.startsWith('de')) {
    const voices = germanVoices()
    const voice = voices.find((v) => v.voiceURI === opts.voiceURI) ?? voices.find((v) => v.lang === 'de-DE') ?? voices[0]
    if (voice) utterance.voice = voice
  }
  speechSynthesis.speak(utterance)
}

export function stopSpeaking() {
  if (supported) speechSynthesis.cancel()
}
