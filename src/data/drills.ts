import { db, type LernzeitDB } from '@/db/db'
import type { DrillKind, DrillStat } from '@/db/types'
import { nextStat } from '@/lib/drills'

/** Saves one drill answer to the card's stat for that drill. */
export async function saveDrillAnswer(cardId: string, drill: DrillKind, correct: boolean, database: LernzeitDB = db): Promise<DrillStat> {
  return database.transaction('rw', database.drillStats, async () => {
    const stat = nextStat(await database.drillStats.get(`${cardId}:${drill}`), cardId, drill, correct, Date.now())
    await database.drillStats.put(stat)
    return stat
  })
}
