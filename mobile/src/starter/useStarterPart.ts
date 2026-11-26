import Constants from 'expo-constants'
import { useState } from 'react'
import { notice } from '../notice'
import { useLocalLibrary } from '../store/live'
import { installStarterPart, type StarterPart } from './starter'

/** The "Starter stories / questions / topics" button: downloads the German starter and adds what is missing. */
export function useStarterPart(part: StarterPart, noun: [string, string]): { busy: boolean; install: () => void } {
  const library = useLocalLibrary()
  const [busy, setBusy] = useState(false)
  const install = () => {
    if (busy) return
    setBusy(true)
    installStarterPart(library, String(Constants.expoConfig?.extra?.apiUrl ?? ''), part, noun)
      .then(notice, (err: unknown) => notice(err instanceof Error ? err.message : 'Could not add the starter content.'))
      .finally(() => setBusy(false))
  }
  return { busy, install }
}
