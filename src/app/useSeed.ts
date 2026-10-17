import { useEffect, useState } from 'react'
import { db } from '@/db/db'
import { syncStarterTopics } from '@/data/grammar'
import { addStarterConjugations, ensureSeeded } from '@/db/seed'

/** Creates the example topics and starter deck on first launch, then fills in starter data added since. */
export function useSeed(): boolean {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    ensureSeeded(db)
      .catch((err) => console.error('Seeding failed', err))
      .finally(() => setReady(true))
      .then(() => Promise.all([addStarterConjugations(db), syncStarterTopics(db)]))
      .catch((err) => console.error('Adding starter data failed', err))
  }, [])
  return ready
}
