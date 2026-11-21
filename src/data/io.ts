import Papa from 'papaparse'
import { isSynced, SYNCED_KV_KEYS, SYNC_TABLES, splitSettings } from '@lernzeit/core/sync'
import { OfflineError, SignedOutError, resetCloud } from '@/sync/api'
import { readAccount } from '@/sync/account'
import { MISSING_IMAGES_KEY, stopSync, syncNow, withLock } from '@/sync/engine'
import { applyRemote } from '@/sync/outbox'
import { db, getSettings, KV_KEYS, newId, type LernzeitDB, type OutboxEntry } from '@/db/db'
import type { Card, CardType, Conjugation, Deck, DeckDirections, Doc, DocFolder, DrillStat, ExerciseStat, Gender, GrammarTopic, KV, PracticeRun, Question, QuestionResponse, ReviewLog, Session, Settings, StoredImage, Story, Task, Topic, CardReview } from '@lernzeit/core/types'
import { cleanConjugation } from '@lernzeit/core/conjugation'
import { splitArticle } from '@lernzeit/core/german'
import { blobToDataUrl, dataUrlToBlob } from '@/lib/image'
import { directionsFor, newReview } from '@lernzeit/core/srs'

/* ---------------------------------------------------------------- CSV ---- */

export interface CsvRow {
  english: string
  german: string
  gender?: Gender
  plural?: string
  exampleDe?: string
  exampleEn?: string
  tags: string[]
  deck?: string
  type: CardType
  verbForms?: string
  conjugation?: Conjugation
  emoji?: string
}

export interface CsvPreview {
  rows: CsvRow[]
  skipped: { line: number; reason: string }[]
  deckNames: string[]
}

const GENDERS = new Set<string>(['der', 'die', 'das'])

function cell(record: Record<string, string>, ...names: string[]): string {
  for (const name of names) {
    const value = record[name]
    if (value !== undefined && value.trim()) return value.trim()
  }
  return ''
}

/** Reads `english, german, gender, plural, example_de, example_en, tags, deck`. */
export function parseCardsCsv(text: string): CsvPreview {
  const BOM = String.fromCharCode(0xfeff)
  const parsed = Papa.parse<Record<string, string>>(text.startsWith(BOM) ? text.slice(1) : text, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => h.trim().toLowerCase().replace(/[\s-]+/g, '_'),
  })
  const rows: CsvRow[] = []
  const skipped: CsvPreview['skipped'] = []

  parsed.data.forEach((record, i) => {
    const line = i + 2 // header is line 1
    const english = cell(record, 'english', 'en')
    let german = cell(record, 'german', 'de')
    if (!english || !german) {
      skipped.push({ line, reason: 'English and German are required' })
      return
    }
    const rawType = cell(record, 'type').toLowerCase()
    const type: CardType = rawType === 'sentence' || rawType === 'cloze' ? rawType : german.includes('{{') ? 'cloze' : 'word'
    let gender = cell(record, 'gender', 'article').toLowerCase() as Gender | ''
    if (gender && !GENDERS.has(gender)) gender = ''
    if (type === 'word' && !gender) {
      const split = splitArticle(german)
      german = split.word
      gender = split.gender ?? ''
    } else if (type === 'word' && gender) {
      german = splitArticle(german).word
    }
    rows.push({
      english,
      german,
      type,
      gender: gender || undefined,
      plural: cell(record, 'plural') || undefined,
      exampleDe: cell(record, 'example_de', 'example') || undefined,
      exampleEn: cell(record, 'example_en', 'translation') || undefined,
      verbForms: cell(record, 'verb_forms', 'verbforms') || undefined,
      conjugation: cleanConjugation({ present: cell(record, 'present'), past: cell(record, 'past'), perfect: cell(record, 'perfect') }),
      tags: cell(record, 'tags')
        .split(/[;,|]/)
        .map((t) => t.trim())
        .filter(Boolean),
      deck: cell(record, 'deck') || undefined,
      emoji: cell(record, 'emoji') || undefined,
    })
  })

  for (const error of parsed.errors) {
    if (error.row !== undefined) skipped.push({ line: error.row + 2, reason: error.message })
  }
  const deckNames = [...new Set(rows.map((r) => r.deck).filter((d): d is string => !!d))]
  return { rows, skipped, deckNames }
}

/** Imports parsed rows. Rows without a deck go to `fallbackDeckId`; unknown deck names are created. */
export async function importCsvRows(rows: CsvRow[], fallbackDeckId: string, database: LernzeitDB = db): Promise<{ cards: number; newDecks: number }> {
  return database.transaction('rw', [database.decks, database.cards, database.reviews], async () => {
    const decks = await database.decks.toArray()
    const byName = new Map(decks.map((d) => [d.name.toLowerCase(), d]))
    const fallback = decks.find((d) => d.id === fallbackDeckId) ?? decks[0]
    let order = decks.reduce((max, d) => Math.max(max, d.order), -1) + 1
    let newDecks = 0
    const now = Date.now()
    const cards: Card[] = []
    const reviews: CardReview[] = []

    for (const [i, row] of rows.entries()) {
      let deck: Deck | undefined = row.deck ? byName.get(row.deck.toLowerCase()) : fallback
      if (!deck && row.deck) {
        deck = {
          id: newId(),
          name: row.deck,
          topicId: fallback?.topicId,
          newPerDay: 15,
          reviewsPerDay: 150,
          directions: { imageToDe: true, enToDe: true, deToEn: false },
          order: order++,
          createdAt: now,
        }
        await database.decks.add(deck)
        byName.set(deck.name.toLowerCase(), deck)
        newDecks++
      }
      if (!deck) throw new Error('Create a deck before importing')
      const card: Card = {
        id: newId(),
        deckId: deck.id,
        type: row.type,
        english: row.english,
        german: row.german,
        gender: row.type === 'word' ? row.gender : undefined,
        plural: row.plural,
        verbForms: row.verbForms,
        conjugation: row.conjugation,
        exampleDe: row.exampleDe,
        exampleEn: row.exampleEn,
        emoji: row.emoji,
        tags: row.tags,
        createdAt: now + i,
        updatedAt: now + i,
      }
      cards.push(card)
      for (const direction of directionsFor(card, deck)) reviews.push(newReview(card, direction, now))
    }
    await database.cards.bulkAdd(cards)
    await database.reviews.bulkAdd(reviews)
    return { cards: cards.length, newDecks }
  })
}

export const CSV_TEMPLATE =
  'english,german,gender,plural,example_de,example_en,tags,deck,emoji\n' +
  'dog,Hund,der,die Hunde,Der Hund spielt im Garten.,The dog is playing in the garden.,"Animals, A1",German A1,🐕\n'

/* --------------------------------------------------------- Card packs ---- */

/**
 * A shareable set of decks and cards (`"format": "lernzeit-cards"`), as in
 * the German starter file. Cards keep their ids, so importing a pack twice
 * only adds what is missing.
 */
export interface CardPackDeck {
  id: string
  name: string
  /** Topic name, e.g. "German". */
  topic?: string
  directions?: Partial<DeckDirections>
  newPerDay?: number
  reviewsPerDay?: number
}

export interface CardPackCard {
  id?: string
  deckId: string
  type?: CardType
  english: string
  german: string
  gender?: Gender | null
  plural?: string | null
  verbForms?: string | null
  /** Each tense as six forms for ich, du, er/sie/es, wir, ihr, sie. */
  conjugation?: Conjugation | null
  partOfSpeech?: string | null
  exampleDe?: string | null
  exampleEn?: string | null
  tags?: string[]
  /** A data: URL; other image links are ignored (they would not work offline). */
  image?: string | null
  emoji?: string | null
  imageQuery?: string | null
}

export interface CardPack {
  format: 'lernzeit-cards'
  version: number
  description?: string
  decks: CardPackDeck[]
  cards: CardPackCard[]
}

export function isCardPack(value: unknown): value is CardPack {
  const v = value as Partial<CardPack> | null
  return !!v && v.format === 'lernzeit-cards' && Array.isArray(v.decks) && Array.isArray(v.cards)
}

/** Checks a parsed JSON file and returns it as a pack, or throws a readable error. */
export function parseCardPack(value: unknown): CardPack {
  if (!isCardPack(value)) throw new Error('This file is not a Lernzeit card pack')
  if (value.version > 1) throw new Error('This card pack comes from a newer version of Lernzeit')
  const deckIds = new Set(value.decks.map((d) => d.id))
  value.cards.forEach((c, i) => {
    if (!c || typeof c.english !== 'string' || typeof c.german !== 'string' || !c.english.trim() || !c.german.trim()) {
      throw new Error(`Card ${i + 1} needs English and German`)
    }
    if (!deckIds.has(c.deckId)) throw new Error(`Card ${i + 1} points to an unknown deck "${c.deckId}"`)
  })
  return value
}

const clean = (v: string | null | undefined) => (typeof v === 'string' && v.trim() ? v.trim() : undefined)

/** Images in a pack are decoded before writing, since a database transaction cannot wait for that. */
export interface PreparedPack {
  pack: CardPack
  images: Map<number, StoredImage>
}

export async function prepareCardPack(pack: CardPack): Promise<PreparedPack> {
  const images = new Map<number, StoredImage>()
  await Promise.all(
    pack.cards.map(async (c, i) => {
      if (!c.image?.startsWith('data:image/')) return
      try {
        const blob = await dataUrlToBlob(c.image)
        images.set(i, { id: newId(), blob, width: 0, height: 0, fit: blob.type === 'image/svg+xml' ? 'contain' : 'cover' })
      } catch {
        /* a broken image just means no picture */
      }
    }),
  )
  return { pack, images }
}

export interface PackResult {
  cards: number
  skipped: number
  newDecks: number
}

/** Writes a prepared pack. Existing cards (same id) are left alone; decks are matched by id, then by name. */
export async function writeCardPack(
  { pack, images }: PreparedPack,
  opts: { imageForCard?: (cardId: string) => string | undefined } = {},
  database: LernzeitDB = db,
): Promise<PackResult> {
  return database.transaction('rw', [database.topics, database.decks, database.cards, database.reviews, database.images], async () => {
    const [topics, decks] = await Promise.all([database.topics.toArray(), database.decks.toArray()])
    const topicByName = new Map(topics.map((t) => [t.name.toLowerCase(), t]))
    let order = decks.reduce((max, d) => Math.max(max, d.order), -1) + 1
    const now = Date.now()
    const deckFor = new Map<string, Deck>()
    let newDecks = 0

    for (const pd of pack.decks) {
      let deck = decks.find((d) => d.id === pd.id) ?? decks.find((d) => d.name.toLowerCase() === pd.name.trim().toLowerCase())
      if (!deck) {
        deck = {
          id: pd.id,
          name: pd.name.trim(),
          topicId: pd.topic ? topicByName.get(pd.topic.toLowerCase())?.id : undefined,
          newPerDay: pd.newPerDay ?? 15,
          reviewsPerDay: pd.reviewsPerDay ?? 150,
          directions: { imageToDe: true, enToDe: true, deToEn: false, ...pd.directions },
          order: order++,
          createdAt: now,
        }
        await database.decks.add(deck)
        newDecks++
      }
      deckFor.set(pd.id, deck)
    }

    const ids = pack.cards.map((c) => c.id).filter((id): id is string => !!id)
    const existing = new Set((await database.cards.bulkGet(ids)).filter((c): c is Card => !!c).map((c) => c.id))
    const cards: Card[] = []
    const reviews: CardReview[] = []
    const newImages: StoredImage[] = []

    pack.cards.forEach((pc, i) => {
      if (pc.id && existing.has(pc.id)) return
      const deck = deckFor.get(pc.deckId)!
      const type: CardType = pc.type === 'sentence' || pc.type === 'cloze' ? pc.type : 'word'
      const id = pc.id ?? newId()
      const image = images.get(i)
      if (image) newImages.push(image)
      const card: Card = {
        id,
        deckId: deck.id,
        type,
        english: pc.english.trim(),
        german: pc.german.trim(),
        gender: type === 'word' && pc.gender && GENDERS.has(pc.gender) ? pc.gender : undefined,
        plural: clean(pc.plural),
        verbForms: clean(pc.verbForms),
        conjugation: cleanConjugation(pc.conjugation),
        partOfSpeech: clean(pc.partOfSpeech),
        exampleDe: clean(pc.exampleDe),
        exampleEn: clean(pc.exampleEn),
        emoji: clean(pc.emoji),
        imageQuery: clean(pc.imageQuery),
        imageId: image?.id ?? opts.imageForCard?.(id),
        tags: (pc.tags ?? []).map((t) => t.trim()).filter(Boolean),
        // Keep the pack's order for new cards.
        createdAt: now + i,
        updatedAt: now + i,
      }
      cards.push(card)
      for (const direction of directionsFor(card, deck)) reviews.push(newReview(card, direction, now))
    })

    if (newImages.length) await database.images.bulkAdd(newImages)
    await database.cards.bulkAdd(cards)
    await database.reviews.bulkAdd(reviews)
    return { cards: cards.length, skipped: pack.cards.length - cards.length, newDecks }
  })
}

/* ------------------------------------------------------------- Backup ---- */

interface BackupImage {
  id: string
  width: number
  height: number
  fit: StoredImage['fit']
  dataUrl: string
}

export interface Backup {
  app: 'lernzeit'
  version: 1
  exportedAt: number
  topics: Topic[]
  sessions: Session[]
  decks: Deck[]
  cards: Card[]
  reviews: CardReview[]
  reviewLogs: ReviewLog[]
  tasks: Task[]
  /** Missing in backups made before stories were added. */
  stories?: Story[]
  /** Missing in backups made before questions were added. */
  questions?: Question[]
  responses?: QuestionResponse[]
  /** Missing in backups made before drills were added. */
  drillStats?: DrillStat[]
  /** Missing in backups made before grammar topics were added. */
  grammarTopics?: GrammarTopic[]
  exerciseStats?: ExerciseStat[]
  /** Missing in backups made before practice history was added. */
  practiceRuns?: PracticeRun[]
  /** Missing in backups made before docs were added. */
  docFolders?: DocFolder[]
  docs?: Doc[]
  images: BackupImage[]
  settings: Settings
}

export async function exportBackup(database: LernzeitDB = db): Promise<Backup> {
  const [topics, sessions, decks, cards, reviews, reviewLogs, tasks, stories, questions, responses, drillStats, grammarTopics, exerciseStats, practiceRuns, docFolders, docs, images, settings] = await Promise.all([
    database.topics.toArray(),
    database.sessions.toArray(),
    database.decks.toArray(),
    database.cards.toArray(),
    database.reviews.toArray(),
    database.reviewLogs.toArray(),
    database.tasks.toArray(),
    database.stories.toArray(),
    database.questions.toArray(),
    database.responses.toArray(),
    database.drillStats.toArray(),
    database.grammarTopics.toArray(),
    database.exerciseStats.toArray(),
    database.practiceRuns.toArray(),
    database.docFolders.toArray(),
    database.docs.toArray(),
    database.images.toArray(),
    getSettings(database),
  ])
  return {
    app: 'lernzeit',
    version: 1,
    exportedAt: Date.now(),
    topics,
    sessions,
    decks,
    cards,
    reviews,
    reviewLogs,
    tasks,
    stories,
    questions,
    responses,
    drillStats,
    grammarTopics,
    exerciseStats,
    practiceRuns,
    docFolders,
    docs,
    images: await Promise.all(
      images.map(async (img) => ({ id: img.id, width: img.width, height: img.height, fit: img.fit, dataUrl: await blobToDataUrl(img.blob) })),
    ),
    settings,
  }
}

function assertBackup(value: unknown): asserts value is Backup {
  const b = value as Partial<Backup>
  const arrays: (keyof Backup)[] = ['topics', 'sessions', 'decks', 'cards', 'reviews', 'reviewLogs', 'tasks', 'images']
  if (!b || b.app !== 'lernzeit' || typeof b.version !== 'number') throw new Error('This is not a Lernzeit backup file')
  if (b.version > 1) throw new Error('This backup comes from a newer version of Lernzeit')
  for (const key of arrays) if (!Array.isArray(b[key])) throw new Error(`The backup is missing "${key}"`)
  for (const key of ['stories', 'questions', 'responses', 'drillStats', 'grammarTopics', 'exerciseStats', 'practiceRuns', 'docFolders', 'docs'] as const) {
    if (b[key] !== undefined && !Array.isArray(b[key])) throw new Error(`The backup has broken "${key}"`)
  }
}

/** Words for why the cloud could not be reset, ending in what the owner was trying to do. */
function cloudFailure(error: unknown, task: string): Error {
  if (error instanceof OfflineError) return new Error(`You're offline. Connect to ${task}.`)
  if (error instanceof SignedOutError) return new Error(`Sign in to ${task}.`)
  return error instanceof Error ? error : new Error(String(error))
}

/** A restore or reset is running here: a second one would empty the cloud again under the first. */
let replacing = false

/** Queues every synced row of this device in the outbox at `at`. */
async function queueAll(database: LernzeitDB, at: number): Promise<void> {
  const entries: OutboxEntry[] = []
  for (const tbl of SYNC_TABLES) {
    for (const key of await database.table(tbl).toCollection().primaryKeys()) {
      if (isSynced(tbl, String(key))) entries.push({ tbl, id: String(key), at })
    }
  }
  await database.outbox.bulkPut(entries)
}

/**
 * Empties the cloud, then this device, as one change that is not recorded in the outbox (the other
 * devices learn of it from the cloud). Runs holding the sync lock, so no sync pushes the old library
 * back in between. `write` adds the new library in the same local transaction; everything it needs
 * must be prepared before, since the cloud is emptied first. If the cloud cannot be reset (offline,
 * signed out, refused) nothing local changes and the error says why. If the local change then fails,
 * this device's library is queued for upload at once, which puts it back into the cloud. If even that
 * fails, sync stops in this tab (a pull would apply the cloud's tombstones here) and the error says
 * to export a backup.
 *
 * Kept: `meta` (this device's id, the account, the pull cursor: pulling the cloud's tombstones for
 * what is gone is harmless) and every kv key that does not sync, such as this device's settings.
 * The new rows wait in the outbox, stamped after the cloud's reset (its clock, not this device's),
 * so the reset can never win over them. The caller starts the upload.
 */
async function replaceLibrary(database: LernzeitDB, task: string, failed: string, write?: () => Promise<void>): Promise<void> {
  if (!(await readAccount(database))) throw new Error(`Sign in to ${task}.`)
  if (replacing) throw new Error('A restore or reset is already running.')
  replacing = true
  try {
    await withLock(async () => {
      let resetAt: number
      try {
        resetAt = (await resetCloud()).at
      } catch (error) {
        throw cloudFailure(error, task)
      }
      const at = Math.max(Date.now(), resetAt + 1)
      try {
        await applyRemote(database, async () => {
          await Promise.all([
            ...SYNC_TABLES.filter((tbl) => tbl !== 'kv').map((tbl) => database.table(tbl).clear()),
            database.kv.bulkDelete([...SYNCED_KV_KEYS]),
            database.outbox.clear(),
            database.meta.delete(MISSING_IMAGES_KEY),
          ])
          if (!write) return
          await write()
          await queueAll(database, at)
        })
      } catch (error) {
        console.error(`${failed} The cloud was emptied, then this browser's change failed:`, error)
        // The local change rolled back, so the old library is intact; the cloud is not. Put it back.
        try {
          await applyRemote(database, () => queueAll(database, at))
        } catch (queueError) {
          console.error(`${failed} This browser's library could not be queued to upload again:`, queueError)
          // A sync now would pull the cloud's tombstones and empty this browser too.
          stopSync()
          throw new Error(
            `${failed} The cloud is empty and this browser's library could not be queued to upload again. Don't close this tab: export a backup in Settings → Your data now.`,
            { cause: queueError },
          )
        }
        void syncNow(database).catch(() => {})
        throw new Error(`${failed} Your library was kept.`, { cause: error })
      }
    })
  } finally {
    replacing = false
  }
}

/** Throws a readable error when a table of the backup holds one id twice. */
function assertUniqueIds(backup: Backup): void {
  const tables = {
    topics: backup.topics, sessions: backup.sessions, decks: backup.decks, cards: backup.cards, reviews: backup.reviews,
    reviewLogs: backup.reviewLogs, tasks: backup.tasks, stories: backup.stories, questions: backup.questions, responses: backup.responses,
    drillStats: backup.drillStats, grammarTopics: backup.grammarTopics, exerciseStats: backup.exerciseStats, practiceRuns: backup.practiceRuns,
    docFolders: backup.docFolders, docs: backup.docs, images: backup.images,
  }
  for (const [name, rows] of Object.entries(tables)) {
    const seen = new Set<unknown>()
    for (const row of rows ?? []) {
      const id = (row as { id?: unknown } | null)?.id
      if (typeof id !== 'string') continue
      if (seen.has(id)) throw new Error(`The backup has "${name}" with the same id twice (${id}).`)
      seen.add(id)
    }
  }
}

/**
 * Replaces the library on every device with the backup: the cloud is emptied first, then the backup
 * is written here and waits in the outbox; the upload to the cloud starts in the background through
 * the sync engine, which retries it when it fails. Resolves once the backup is stored on this device.
 * This device keeps its own settings (voice, theme, reminders).
 */
export async function restoreBackup(raw: unknown, database: LernzeitDB = db): Promise<{ cards: number; sessions: number; tasks: number }> {
  assertBackup(raw)
  const backup = raw
  assertUniqueIds(backup)
  const images: StoredImage[] = await Promise.all(
    backup.images.map(async (img) => ({ id: img.id, width: img.width, height: img.height, fit: img.fit, blob: await dataUrlToBlob(img.dataUrl) })),
  )
  await replaceLibrary(database, 'restore a backup', 'Restore failed.', async () => {
    await database.topics.bulkAdd(backup.topics)
    await database.sessions.bulkAdd(backup.sessions)
    await database.decks.bulkAdd(backup.decks)
    await database.cards.bulkAdd(backup.cards)
    await database.reviews.bulkAdd(backup.reviews)
    await database.reviewLogs.bulkAdd(backup.reviewLogs)
    await database.tasks.bulkAdd(backup.tasks)
    await database.stories.bulkAdd(backup.stories ?? [])
    await database.questions.bulkAdd(backup.questions ?? [])
    await database.responses.bulkAdd(backup.responses ?? [])
    await database.drillStats.bulkAdd(backup.drillStats ?? [])
    await database.grammarTopics.bulkAdd(backup.grammarTopics ?? [])
    await database.exerciseStats.bulkAdd(backup.exerciseStats ?? [])
    await database.practiceRuns.bulkAdd(backup.practiceRuns ?? [])
    await database.docFolders.bulkAdd(backup.docFolders ?? [])
    await database.docs.bulkAdd(backup.docs ?? [])
    await database.images.bulkAdd(images)
    const kv: KV[] = [{ key: KV_KEYS.seeded, value: Date.now() }]
    if (backup.settings) {
      const { shared, device } = splitSettings(backup.settings)
      kv.push({ key: KV_KEYS.settings, value: shared })
      // Device settings belong to the device: a backup only seeds them where there are none.
      if (Object.keys(device).length && !(await database.kv.get(KV_KEYS.deviceSettings))) kv.push({ key: KV_KEYS.deviceSettings, value: device })
    }
    await database.kv.bulkPut(kv)
  })
  // The upload runs on its own; a failure leaves the backup in the outbox for the engine's next try.
  void syncNow(database).catch(() => {})
  return { cards: backup.cards.length, sessions: backup.sessions.length, tasks: backup.tasks.length }
}

/** Deletes the library on every device; the app starts empty again. Needs a sign-in and the cloud. */
export async function resetAllData(database: LernzeitDB = db) {
  await replaceLibrary(database, 'reset your library', 'Reset failed.')
  void syncNow(database).catch(() => {})
}

export function downloadFile(name: string, content: string | Blob, type = 'application/json') {
  const blob = typeof content === 'string' ? new Blob([content], { type }) : content
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
