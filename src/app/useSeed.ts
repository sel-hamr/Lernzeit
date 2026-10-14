import { useEffect, useState } from 'react'
import { db } from '@/db/db'
import { ensureSeeded } from '@/db/seed'

/** Creates the example topics and starter deck on first launch. */
export function useSeed(): boolean {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    ensureSeeded(db)
      .catch((err) => console.error('Seeding failed', err))
      .finally(() => setReady(true))
  }, [])
  return ready
}
