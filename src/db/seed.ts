import type { LernzeitDB } from './db'
import { KV_KEYS, newId } from './db'
import type { Deck, StoredImage, Topic } from './types'
import { prepareCardPack, writeCardPack, type CardPack, type PackResult } from '@/data/io'
import { installStarterQuestions, loadStarterQuestions } from '@/data/questions'
import { installStarterStories, loadStarterStories } from '@/data/stories'
import { uniformGoals } from '@/lib/goals'
import { dateKey } from '@/lib/time'
import { withMyWords } from './starter/my-words'

/** Illustrations from the design mockups, used instead of the emoji for these starter cards. */
const ART: Record<string, string> = {
  apple: '<path d="M60 34 C50 25 32 28 32 48 C32 68 46 80 54 80 C57 80 58 78 60 78 C62 78 63 80 66 80 C74 80 88 68 88 48 C88 28 70 25 60 34Z" fill="#C8412F"/><path d="M60 34 C60 27 62 22 65 18" stroke="#5B4636" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M63 26 C67 18 77 16 82 19 C78 26 69 29 63 26Z" fill="#5F8F4E"/>',
  house: '<path d="M34 46 L60 24 L86 46 V76 H34 Z" fill="#FFFFFF" stroke="#1C211E" stroke-width="2.5" stroke-linejoin="round"/><rect x="54" y="56" width="12" height="20" fill="#5F8F4E"/><rect x="40" y="52" width="9" height="9" fill="#BFD3EA"/><rect x="71" y="52" width="9" height="9" fill="#BFD3EA"/>',
  sun: '<circle cx="60" cy="45" r="16" fill="#E9B949"/><path d="M60 17v8M60 65v8M32 45h8M80 45h8M40 25l6 6M74 59l6 6M80 25l-6 6M46 59l-6 6" stroke="#E9B949" stroke-width="3" stroke-linecap="round" fill="none"/>',
  cup: '<path d="M40 38 H76 V58 C76 68 68 74 58 74 C48 74 40 68 40 58 Z" fill="#FFFFFF" stroke="#1C211E" stroke-width="2.5"/><path d="M76 44 C86 44 86 58 76 58" fill="none" stroke="#1C211E" stroke-width="2.5"/><path d="M50 22 C46 27 54 30 50 34 M60 20 C56 25 64 28 60 32" stroke="#9A9D97" stroke-width="2" fill="none" stroke-linecap="round"/>',
  book: '<path d="M30 28 C40 24 52 26 60 32 C68 26 80 24 90 28 V72 C80 68 68 70 60 76 C52 70 40 68 30 72 Z" fill="#FFFFFF" stroke="#1C211E" stroke-width="2.5" stroke-linejoin="round"/><path d="M60 32 V76" stroke="#1C211E" stroke-width="2.5"/><path d="M37 38 H53 M37 46 H53 M67 38 H83 M67 46 H83" stroke="#2D5EA8" stroke-width="2" stroke-linecap="round"/>',
  tree: '<rect x="56" y="54" width="8" height="24" fill="#7A5A3F"/><circle cx="60" cy="38" r="20" fill="#5F8F4E"/><circle cx="46" cy="50" r="12" fill="#6E9E5C"/><circle cx="74" cy="50" r="12" fill="#6E9E5C"/>',
  key: '<circle cx="42" cy="46" r="12" fill="none" stroke="#B8902F" stroke-width="5"/><path d="M54 46 H88 M80 46 V56 M72 46 V53" stroke="#B8902F" stroke-width="5" stroke-linecap="round" fill="none"/>',
  bread: '<path d="M32 62 V48 C32 36 44 30 60 30 C76 30 88 36 88 48 V62 C88 68 84 72 78 72 H42 C36 72 32 68 32 62 Z" fill="#D9A866"/><path d="M48 40 L52 52 M60 38 L60 52 M72 40 L68 52" stroke="#B9844A" stroke-width="2.5" stroke-linecap="round" fill="none"/>',
  flower: '<path d="M60 50 V80" stroke="#5F8F4E" stroke-width="3" fill="none"/><path d="M60 70 C66 62 74 62 78 64 C74 70 66 72 60 70Z" fill="#5F8F4E"/><circle cx="60" cy="24" r="8" fill="#D77A97"/><circle cx="71" cy="33" r="8" fill="#D77A97"/><circle cx="67" cy="46" r="8" fill="#D77A97"/><circle cx="53" cy="46" r="8" fill="#D77A97"/><circle cx="49" cy="33" r="8" fill="#D77A97"/><circle cx="60" cy="36" r="6" fill="#E9B949"/>',
}

function svgImage(id: string, body: string): StoredImage {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="180" viewBox="0 0 120 90">${body}</svg>`
  return { id, blob: new Blob([svg], { type: 'image/svg+xml' }), width: 240, height: 180, fit: 'contain' }
}

/** Starter pack card id -> illustration. */
const ART_FOR_CARD: Record<string, keyof typeof ART> = {
  'de-0046': 'apple',
  'de-0021': 'house',
  'de-0210': 'sun',
  'de-0066': 'cup',
  'de-0146': 'book',
  'de-0215': 'tree',
  'de-0031': 'key',
  'de-0042': 'bread',
  'de-0216': 'flower',
}

/** The bundled German pack (top words, everyday sentences) plus My Words. Loaded on demand. */
export async function loadStarterPack(): Promise<CardPack> {
  const { default: json } = await import('./starter/german-starter.json')
  return withMyWords(json as CardPack)
}

/**
 * Adds the starter decks. Safe to run again: cards that already exist are
 * skipped. Illustrations are stored only for cards that are actually added.
 */
export async function installStarterPack(database: LernzeitDB, pack?: CardPack): Promise<PackResult> {
  const prepared = await prepareCardPack(pack ?? (await loadStarterPack()))
  return database.transaction('rw', [database.topics, database.decks, database.cards, database.reviews, database.images], async () => {
    const wanted = Object.keys(ART_FOR_CARD)
    const present = new Set((await database.cards.bulkGet(wanted)).filter(Boolean).map((c) => c!.id))
    const images = new Map<string, string>()
    const rows: StoredImage[] = []
    for (const cardId of wanted) {
      if (present.has(cardId)) continue
      const image = svgImage(newId(), ART[ART_FOR_CARD[cardId]])
      images.set(cardId, image.id)
      rows.push(image)
    }
    if (rows.length) await database.images.bulkAdd(rows)
    return writeCardPack(prepared, { imageForCard: (id) => images.get(id) }, database)
  })
}

/** First launch: the German and AI topics, the starter decks, stories and questions, and an empty AI deck. */
export async function ensureSeeded(database: LernzeitDB): Promise<void> {
  if (await database.kv.get(KV_KEYS.seeded)) return
  // Load the pack before the transaction: IndexedDB transactions cannot wait on other work.
  const pack = await loadStarterPack()
  const prepared = await prepareCardPack(pack)
  const stories = await loadStarterStories()
  const questions = await loadStarterQuestions()
  await database.transaction(
    'rw',
    [database.kv, database.topics, database.decks, database.cards, database.reviews, database.images, database.stories, database.questions],
    async () => {
      if (await database.kv.get(KV_KEYS.seeded)) return
      const now = Date.now()
      const today = dateKey(now)

      const german: Topic = {
        id: newId(), name: 'German', color: 'sage', goalMinutes: uniformGoals(150),
        goalHistory: [{ since: today, goals: uniformGoals(150) }], archived: false, order: 0, createdAt: now,
      }
      const ai: Topic = {
        id: newId(), name: 'AI', color: 'blue', goalMinutes: uniformGoals(120),
        goalHistory: [{ since: today, goals: uniformGoals(120) }], archived: false, order: 1, createdAt: now,
      }
      await database.topics.bulkAdd([german, ai])

      const images = new Map<string, string>()
      const rows = Object.entries(ART_FOR_CARD).map(([cardId, art]) => {
        const image = svgImage(newId(), ART[art])
        images.set(cardId, image.id)
        return image
      })
      await database.images.bulkAdd(rows)
      await writeCardPack(prepared, { imageForCard: (id) => images.get(id) }, database)

      const aiDeck: Deck = {
        id: newId(), name: 'AI terms', topicId: ai.id, newPerDay: 15, reviewsPerDay: 150,
        directions: { imageToDe: false, enToDe: true, deToEn: true }, order: 100, createdAt: now,
      }
      await database.decks.add(aiDeck)
      await installStarterStories(database, stories)
      await installStarterQuestions(database, questions)
      await database.kv.put({ key: KV_KEYS.seeded, value: now })
    },
  )
}
