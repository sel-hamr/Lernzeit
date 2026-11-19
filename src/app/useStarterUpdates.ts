import { useEffect } from 'react'
import { db } from '@/db/db'
import { updateStarterData } from '@/data/languages'

/**
 * Brings installs from before packs up to date, in the background. A new,
 * empty browser goes through the welcome in StarterDialog instead.
 */
export function useStarterUpdates() {
  useEffect(() => {
    updateStarterData(db).catch((err) => console.error('Updating starter data failed', err))
  }, [])
}
