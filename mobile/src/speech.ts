/*
 * German read aloud with expo-speech, at the speed and voice from Settings. A screen that speaks
 * stops its speech when it closes, as the web's pages do.
 */
import * as Speech from 'expo-speech'
import { useCallback, useEffect } from 'react'
import { useSettings } from './data/settings'

export function useSay(): (text: string) => void {
  const { speechRate, voiceURI } = useSettings()
  useEffect(() => () => void Speech.stop(), [])
  return useCallback(
    (text: string) => {
      if (!text.trim()) return
      Speech.stop()
      Speech.speak(text, { language: 'de-DE', rate: speechRate, voice: voiceURI })
    },
    [speechRate, voiceURI],
  )
}

export const stopSpeaking = () => {
  Speech.stop()
}
