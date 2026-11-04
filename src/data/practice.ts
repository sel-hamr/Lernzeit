import { db, type LernzeitDB } from '@/db/db'
import type { PracticeRun } from '@/db/types'

/**
 * Saves a review session as it stands. The review page calls this after every
 * rating and undo, so a session left half-way is kept too. A session with no
 * rating left (all of them undone) is removed.
 */
export async function savePracticeRun(run: PracticeRun, database: LernzeitDB = db) {
  if (run.reviewed > 0) await database.practiceRuns.put(run)
  else await database.practiceRuns.delete(run.id)
}
