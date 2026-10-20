import { useEffect } from 'react'
import { db } from '@/db/db'
import { updateStarterData } from '@/data/languages'

/**
 * The app starts empty: Welcome offers the language packs. This only brings
 * installs from before packs up to date, in the background.
 */
export function useStarterUpdates() {
  useEffect(() => {
    updateStarterData(db).catch((err) => console.error('Updating starter data failed', err))
  }, [])
}
