import { useState } from 'react'
import { useHasLearningData } from '@/data/hooks'
import { LanguageDialog } from './LanguageDialog'

/** Offers the language packs while there is nothing to learn yet. "Not now" hides it until the next visit. */
export function Welcome() {
  const hasData = useHasLearningData()
  const [dismissed, setDismissed] = useState(false)
  return <LanguageDialog mode="welcome" open={hasData === false && !dismissed} onClose={() => setDismissed(true)} />
}
