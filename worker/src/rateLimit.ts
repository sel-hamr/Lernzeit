/**
 * Per-address limits for the OAuth routes anyone can call (`oauth_hits` in D1). A request is
 * written down and counted in one transaction, so requests sent in parallel cannot all slip
 * under the limit; a refused one is taken off again, so the table holds at most `max` rows per
 * address and route.
 */

export interface Limit {
  /** Which route the rows belong to. */
  bucket: string
  max: number
  windowMs: number
}

const HOUR = 60 * 60 * 1000

/** At most 10 client registrations per address an hour. */
export const REGISTER_LIMIT: Limit = { bucket: 'register', max: 10, windowMs: HOUR }
/** At most 30 openings or submissions of the authorize page, together, per address in 15 minutes. */
export const AUTHORIZE_LIMIT: Limit = { bucket: 'authorize', max: 30, windowMs: HOUR / 4 }

/**
 * At most 200 KV-writing sign-in steps a day from all addresses together: a client registration, an
 * opening of the authorize page, and a new page after a wrong password. Each costs a KV write or
 * two, and the free plan allows 1,000 a day for everything, tokens included; the per-address limits
 * alone would let one address spend them all (30 openings per 15 minutes is 2,880 a day), and with
 * them Claude's refreshes. Counted only for hits the per-address limit let through.
 */
export const SIGN_IN_BUDGET: Limit = { bucket: 'sign-in-day', max: 200, windowMs: 24 * HOUR }

/** What a refused hit says once the budget is spent. */
export const BUDGET_SPENT = 'Too many sign-in attempts today. Try again tomorrow.'

/** Counts one KV-writing sign-in step against SIGN_IN_BUDGET and says whether it is still allowed. */
export function withinSignInBudget(db: D1Database): Promise<boolean> {
  return withinLimit(db, SIGN_IN_BUDGET, 'all')
}

/** Counts this request against `limit` and says whether it is still allowed. */
export async function withinLimit(db: D1Database, limit: Limit, ip: string): Promise<boolean> {
  const now = Date.now()
  const [, inserted, counted] = await db.batch<{ id: number } | { n: number }>([
    db.prepare('DELETE FROM oauth_hits WHERE bucket = ? AND at <= ?').bind(limit.bucket, now - limit.windowMs),
    db.prepare('INSERT INTO oauth_hits (bucket, ip, at) VALUES (?, ?, ?) RETURNING rowid AS id').bind(limit.bucket, ip, now),
    db.prepare('SELECT COUNT(*) AS n FROM oauth_hits WHERE bucket = ? AND ip = ?').bind(limit.bucket, ip),
  ])
  if ((counted.results[0] as { n: number }).n <= limit.max) return true
  await db.prepare('DELETE FROM oauth_hits WHERE rowid = ?').bind((inserted.results[0] as { id: number }).id).run()
  return false
}
