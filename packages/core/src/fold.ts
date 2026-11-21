/*
 * The first sign-in on a browser merges its library into the cloud's. Each
 * browser installed the starter on its own, with its own random ids, so the
 * same German topic, decks and cards can sit in both under different ids.
 * Folding maps those local copies onto the cloud's and keeps whatever only
 * the browser has. Records with the same id on both sides are not folded:
 * newest-wins settles them on the server, by `uploadTime`.
 */
import { isSynced, recordId, SYNC_TABLES, type SyncTable } from './sync'
import type { PracticeDeckTime, StoredFsrs } from './types'

/** Every synced record of one side, per table. Images are `ImageMeta`, kv rows `{ key, value }`. */
export type Library = Partial<Record<SyncTable, Record<string, unknown>[]>>

export interface FoldResult {
  /** The local records to push, pointed at the cloud's copies where they were folded. */
  upload: Library
  /** Local ids that were mapped onto a cloud record or dropped. */
  dropLocal: { tbl: SyncTable; id: string }[]
  summary: {
    /** Uploaded records the cloud did not have. */
    added: Partial<Record<SyncTable, number>>
    /** Local records mapped onto or dropped for a cloud copy. */
    folded: Partial<Record<SyncTable, number>>
  }
}

type Row = Record<string, unknown>
type IdMap = Map<string, string>

const num = (v: unknown): number | undefined => (typeof v === 'number' ? v : undefined)
const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const norm = (v: unknown): string => str(v).trim().toLowerCase()
const key = (...parts: unknown[]): string => JSON.stringify(parts)
/** An id pointed through a map, or left as it is. */
const via = (map: IdMap, id: unknown): unknown => (typeof id === 'string' ? (map.get(id) ?? id) : id)

/** `row` with `field` pointed through `map`; the same row when nothing changes. */
function repoint(row: Row, field: string, map: IdMap): Row {
  const id = row[field]
  const to = typeof id === 'string' ? map.get(id) : undefined
  return to === undefined ? row : { ...row, [field]: to }
}

/** The field that says when a record without `updatedAt` last changed. */
const TIME_FIELD: Partial<Record<SyncTable, string>> = {
  reviewLogs: 'reviewedAt',
  sessions: 'end',
  drillStats: 'lastAt',
  exerciseStats: 'lastAt',
  responses: 'at',
  practiceRuns: 'end',
}

/** When a record that never synced counts as changed, for newest-wins on the server. */
export function uploadTime(tbl: SyncTable, row: Record<string, unknown>): number {
  const updatedAt = num(row.updatedAt)
  if (updatedAt !== undefined) return updatedAt
  if (tbl === 'reviews') return num((row.fsrs as Partial<StoredFsrs> | undefined)?.last_review) ?? 0
  const field = TIME_FIELD[tbl]
  const at = field === undefined ? undefined : num(row[field])
  return at ?? num(row.createdAt) ?? 0
}

/** A candidate for one review or drill stat id: a local row, moved there or already there. */
interface Candidate {
  row: Row
  from: string
  score: number
}

/** Merges the local library into the cloud's. Pure: it reads both sides and changes neither. */
export function foldLibraries(local: Library, cloud: Library): FoldResult {
  const rows = (lib: Library, tbl: SyncTable): Row[] => lib[tbl] ?? []
  const cloudIds = new Map(SYNC_TABLES.map((tbl) => [tbl, new Set(rows(cloud, tbl).map((r) => recordId(tbl, r)))]))
  const inCloud = (tbl: SyncTable, id: string) => cloudIds.get(tbl)!.has(id)

  const removed = new Map<SyncTable, Set<string>>()
  const drop = (tbl: SyncTable, id: string) => {
    const set = removed.get(tbl) ?? new Set<string>()
    removed.set(tbl, set.add(id))
  }
  const kept = (tbl: SyncTable) => rows(local, tbl).filter((r) => !removed.get(tbl)?.has(recordId(tbl, r)))

  /**
   * Maps each local record the cloud does not have by id onto the first cloud
   * record with the same key that `accept` allows, and drops the local copy.
   */
  function match(
    tbl: SyncTable,
    localKey: (r: Row) => string,
    cloudKey: (r: Row) => string = localKey,
    accept: (l: Row, c: Row) => boolean = () => true,
  ): IdMap {
    const byKey = new Map<string, Row[]>()
    for (const c of rows(cloud, tbl)) {
      const k = cloudKey(c)
      byKey.set(k, [...(byKey.get(k) ?? []), c])
    }
    const map: IdMap = new Map()
    for (const l of rows(local, tbl)) {
      const id = str(l.id)
      if (inCloud(tbl, id)) continue
      const to = byKey.get(localKey(l))?.find((c) => accept(l, c))
      if (to === undefined) continue
      map.set(id, str(to.id))
      drop(tbl, id)
    }
    return map
  }

  // 1–3: topics by name, decks by name in the same topic, cards by their words in the same deck.
  const topicMap = match('topics', (r) => norm(r.name))
  const deckMap = match(
    'decks',
    (r) => key(norm(r.name), via(topicMap, r.topicId)),
    (r) => key(norm(r.name), r.topicId),
  )
  const cardMap = match(
    'cards',
    (r) => key(via(deckMap, r.deckId), norm(r.german), norm(r.english)),
    (r) => key(r.deckId, norm(r.german), norm(r.english)),
  )

  // 4: content that is the same on both sides is dropped here.
  match('stories', (r) => key(r.title, r.text))
  const questionMap = match(
    'questions',
    (r) => key(r.set, r.question),
    undefined,
    // The owner's own answer is theirs: a question that has one folds only into a copy with the same answer.
    (l, c) => str(l.myAnswer).trim() === '' || str(l.myAnswer).trim() === str(c.myAnswer).trim(),
  )
  const grammarMap = match('grammarTopics', (r) => key(r.title, r.rule))
  // Folders fold top-down: a folder matches once its parent has.
  const folderMap: IdMap = new Map()
  for (let size = -1; folderMap.size > size; ) {
    size = folderMap.size
    const found = match('docFolders', (r) => key(via(folderMap, r.parentId), r.name))
    for (const [from, to] of found) folderMap.set(from, to)
  }
  match('docs', (r) => key(via(folderMap, r.folderId), r.title, r.body))

  /**
   * Reviews and drill stats are keyed by card. Those of a folded card move to
   * the cloud card's key. Where that key is taken, the row with the higher
   * score is kept, a tie going to the cloud's.
   */
  function settle(
    tbl: 'reviews' | 'drillStats',
    move: (r: Row, card: string) => Row,
    rewrite: (r: Row) => Row,
    score: (r: Row, side: 'local' | 'cloud') => number,
  ): Row[] {
    const cloudById = new Map(rows(cloud, tbl).map((r) => [str(r.id), r]))
    const groups = new Map<string, Candidate[]>()
    for (const r of rows(local, tbl)) {
      const card = cardMap.get(str(r.cardId))
      const row = card === undefined ? rewrite(r) : move(r, card)
      const id = str(row.id)
      groups.set(id, [...(groups.get(id) ?? []), { row, from: str(r.id), score: score(r, 'local') }])
    }
    const out: Row[] = []
    for (const [id, list] of groups) {
      // Nothing moved onto this id: same ids on both sides are left to newest-wins.
      if (list.every((c) => c.from === id)) {
        out.push(...list.map((c) => c.row))
        continue
      }
      const best = list.reduce((a, b) => (b.score > a.score || (b.score === a.score && b.from === id) ? b : a))
      const theirs = cloudById.get(id)
      const keep = theirs !== undefined && score(theirs, 'cloud') >= best.score ? undefined : best
      for (const c of list) if (c !== keep || c.from !== id) drop(tbl, c.from)
      if (keep) out.push(keep.row)
    }
    return out
  }

  const logCounts = (lib: Library) => {
    const counts = new Map<string, number>()
    for (const l of rows(lib, 'reviewLogs')) counts.set(str(l.reviewId), (counts.get(str(l.reviewId)) ?? 0) + 1)
    return counts
  }
  const logs = { local: logCounts(local), cloud: logCounts(cloud) }
  const reviews = settle(
    'reviews',
    (r, card) => ({ ...repoint(r, 'deckId', deckMap), id: `${card}:${str(r.direction)}`, cardId: card }),
    (r) => repoint(r, 'deckId', deckMap),
    (r, side) => logs[side].get(str(r.id)) ?? 0,
  )
  const drillStats = settle(
    'drillStats',
    (r, card) => ({ ...r, id: `${card}:${str(r.drill)}`, cardId: card }),
    (r) => r,
    (r) => (num(r.right) ?? 0) + (num(r.wrong) ?? 0),
  )

  // Every review log is kept, pointed at the card it now belongs to.
  const reviewLogs = rows(local, 'reviewLogs').map((l) => {
    const row = repoint(l, 'deckId', deckMap)
    const card = cardMap.get(str(l.cardId))
    return card === undefined ? row : { ...row, cardId: card, reviewId: `${card}:${str(l.direction)}` }
  })

  // A folded grammar topic keeps the scores of the exercises the cloud copy has.
  const cloudGrammar = new Map(rows(cloud, 'grammarTopics').map((g) => [str(g.id), g]))
  const exerciseStats = rows(local, 'exerciseStats').filter((s) => {
    const to = grammarMap.get(str(s.topicId))
    if (to === undefined) return true
    const exercises = (cloudGrammar.get(to)?.exercises ?? []) as { id?: unknown }[]
    if (exercises.some((e) => e.id === s.id)) return true
    drop('exerciseStats', str(s.id))
    return false
  })

  // 6: a synced kv key the cloud already has keeps the cloud's value.
  const kv = rows(local, 'kv').filter((r) => {
    const id = recordId('kv', r)
    if (!isSynced('kv', id)) return false
    if (!inCloud('kv', id)) return true
    drop('kv', id)
    return false
  })

  const byTopic = (r: Row) => repoint(r, 'topicId', topicMap)
  const upload: Library = {
    topics: kept('topics'),
    sessions: kept('sessions').map(byTopic),
    decks: kept('decks').map(byTopic),
    cards: kept('cards').map((r) => repoint(r, 'deckId', deckMap)),
    reviews,
    reviewLogs,
    images: kept('images'),
    tasks: kept('tasks').map(byTopic),
    stories: kept('stories').map(byTopic),
    questions: kept('questions'),
    responses: kept('responses').map((r) => repoint(r, 'questionId', questionMap)),
    drillStats,
    grammarTopics: kept('grammarTopics'),
    exerciseStats: exerciseStats.map((s) => repoint(s, 'topicId', grammarMap)),
    practiceRuns: kept('practiceRuns').map((r) => runDecks(r, deckMap)),
    docFolders: kept('docFolders').map((r) => repoint(r, 'parentId', folderMap)),
    docs: kept('docs').map((r) => repoint(r, 'folderId', folderMap)),
    kv: kv.map((r) => (r.key === 'activeTimer' && isRow(r.value) ? { ...r, value: byTopic(r.value) } : r)),
  }

  const result: FoldResult = { upload: {}, dropLocal: [], summary: { added: {}, folded: {} } }
  for (const tbl of SYNC_TABLES) {
    const list = upload[tbl] ?? []
    if (list.length) result.upload[tbl] = list
    const added = list.filter((r) => !inCloud(tbl, recordId(tbl, r))).length
    if (added) result.summary.added[tbl] = added
    const gone = removed.get(tbl) ?? new Set()
    if (gone.size) result.summary.folded[tbl] = gone.size
    for (const id of gone) result.dropLocal.push({ tbl, id })
  }
  return result
}

const isRow = (v: unknown): v is Row => typeof v === 'object' && v !== null && !Array.isArray(v)

/** A practice run's per-deck times keyed by the folded decks, adding up decks that became one. */
function runDecks(run: Row, deckMap: IdMap): Row {
  if (!isRow(run.decks) || !Object.keys(run.decks).some((id) => deckMap.has(id))) return run
  const decks: Record<string, PracticeDeckTime> = {}
  for (const [id, time] of Object.entries(run.decks as Record<string, PracticeDeckTime>)) {
    const to = deckMap.get(id) ?? id
    const had = decks[to]
    decks[to] = had ? { ms: had.ms + time.ms, reviewed: had.reviewed + time.reviewed, correct: had.correct + time.correct } : time
  }
  return { ...run, decks }
}
