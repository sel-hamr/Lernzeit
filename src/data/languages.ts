import { db, getSettings, KV_KEYS, newId, updateSettings, type LernzeitDB } from '@/db/db'
import type { Card, Settings, StoredImage, StoryLevel } from '@/db/types'
import { cleanConjugation } from '@/lib/conjugation'
import { nextTopicColor } from '@/lib/colors'
import { uniformGoals } from '@/lib/goals'
import { endonym, isRtl, languageName, LEVELS, loadPack, localizePack, packInfo, speechLang, type LangCode, type LocalizedPack } from '@/languages'
import { installStarterTopics, refreshStarterTopics, STARTER_GRAMMAR_VERSION } from './grammar'
import { prepareCardPack, writeCardPack } from './io'
import { installStarterQuestions } from './questions'
import { installStarterStories } from './stories'
import { createTopic } from './topics'

/** The language you learn and your own, as the app shows and speaks them. */
export interface Language {
  code: LangCode
  /** "French" */
  name: string
  /** "fr-FR", for the voice and the `lang` attribute. */
  speech: string
  rtl: boolean
  /** Letters a keyboard may lack: ä, é… */
  letters: string[]
  /** A short sentence to test the voice with. */
  sample: string
  native: { code: LangCode; name: string; rtl: boolean }
}

export function languageOf(settings: Pick<Settings, 'learning' | 'native'>): Language {
  return {
    code: settings.learning,
    name: languageName(settings.learning),
    speech: speechLang(settings.learning),
    rtl: isRtl(settings.learning),
    letters: packInfo(settings.learning)?.letters ?? [],
    sample: packInfo(settings.learning)?.sample ?? endonym(settings.learning),
    native: { code: settings.native, name: languageName(settings.native), rtl: isRtl(settings.native) },
  }
}

/** True once there is something to learn: a deck, a card, a story, a question or a grammar topic. */
export async function hasLearningData(database: LernzeitDB = db): Promise<boolean> {
  const counts = await Promise.all([database.decks, database.cards, database.stories, database.questions, database.grammarTopics].map((t) => t.count()))
  return counts.some((n) => n > 0)
}

export interface LanguageChoice {
  learning: LangCode
  native: LangCode
  /** One level, or several installed in the pack's order. */
  levels: StoryLevel[]
}

export interface InstallResult {
  cards: number
  stories: number
  questions: number
  topics: number
}

/** Goal for the topic a pack creates: half an hour a day. */
const DEFAULT_GOAL = 30

function svgImage(body: string): StoredImage {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="180" viewBox="0 0 120 90">${body}</svg>`
  return { id: newId(), blob: new Blob([svg], { type: 'image/svg+xml' }), width: 240, height: 180, fit: 'contain' }
}

/**
 * Installs levels of a pack: their decks, cards, stories, questions and
 * grammar, with a topic named after the language for the study time. Safe to
 * run again: what is already there is skipped. The first install sets the
 * language you learn; another language needs a reset first, because the app
 * speaks and labels one language at a time.
 */
export async function installLanguage({ learning, native, levels }: LanguageChoice, database: LernzeitDB = db): Promise<InstallResult> {
  const info = packInfo(learning)
  if (!info) throw new Error(`There is no ${languageName(learning)} pack`)
  if (!info.natives.includes(native)) throw new Error(`The ${info.name} pack is not written in ${languageName(native)} yet`)
  if (!levels.length) throw new Error('Pick a level')
  const missing = levels.find((l) => !info.levels.includes(l))
  if (missing) throw new Error(`The ${info.name} pack has no ${missing} level`)
  const settings = await getSettings(database)
  const sameLanguage = settings.learning === learning && settings.native === native
  if (!sameLanguage && (await hasLearningData(database))) {
    throw new Error(`You are learning ${languageName(settings.learning)}. Reset all data in Settings to learn ${info.name} instead.`)
  }

  // Load and prepare before the transaction: IndexedDB transactions cannot wait on other work.
  const local = localizePack(info, await loadPack(learning), native, levels)
  const prepared = await prepareCardPack(local.cards)
  const tables = [
    database.kv, database.topics, database.decks, database.cards, database.reviews, database.images,
    database.stories, database.questions, database.grammarTopics, database.exerciseStats,
  ]
  return database.transaction('rw', tables, async () => {
    const topics = await database.topics.toArray()
    if (!topics.some((t) => !t.archived && t.name.toLowerCase() === info.name.toLowerCase())) {
      await createTopic({ name: info.name, color: nextTopicColor(topics.map((t) => t.color)), goals: uniformGoals(DEFAULT_GOAL) }, database)
    }

    // Drawings are stored only for cards that are actually added.
    const present = new Set((await database.cards.bulkGet([...local.art.keys()])).filter((c): c is Card => !!c).map((c) => c.id))
    const images = new Map<string, string>()
    const rows: StoredImage[] = []
    for (const [cardId, body] of local.art) {
      if (present.has(cardId)) continue
      const image = svgImage(body)
      images.set(cardId, image.id)
      rows.push(image)
    }
    if (rows.length) await database.images.bulkAdd(rows)

    const { cards } = await writeCardPack(prepared, { imageForCard: (id) => images.get(id) }, database)
    const result: InstallResult = {
      cards,
      stories: await installStarterStories(local.stories, database),
      questions: await installStarterQuestions(local.questions, database),
      topics: await installStarterTopics(local.topics, database),
    }
    const installed = new Set([...(sameLanguage ? settings.levels : []), ...levels])
    await updateSettings({ learning, native, levels: LEVELS.filter((l) => installed.has(l)) }, database)
    // The pack is the current version: nothing for the updates from before packs to do.
    await database.kv.bulkPut([
      { key: KV_KEYS.starterGrammar, value: STARTER_GRAMMAR_VERSION },
      { key: KV_KEYS.starterConjugations, value: Date.now() },
    ])
    return result
  })
}

/** The current language's pack at the levels you installed, or undefined when there is no pack for it. */
export async function installedContent(database: LernzeitDB = db): Promise<LocalizedPack | undefined> {
  const { learning, native, levels } = await getSettings(database)
  const info = packInfo(learning)
  if (!info) return undefined
  return localizePack(info, await loadPack(learning), native, levels)
}

/** Adds back the pack's stories, questions or grammar topics you deleted. Returns how many were added. */
export async function addStarterContent(part: 'stories' | 'questions' | 'topics', database: LernzeitDB = db): Promise<number> {
  const local = await installedContent(database)
  if (!local) return 0
  if (part === 'stories') return installStarterStories(local.stories, database)
  if (part === 'questions') return installStarterQuestions(local.questions, database)
  return installStarterTopics(local.topics, database)
}

/* ------------------------------------------- Installs from before packs ---- */

/** Brings an install from before packs up to date, in the background at startup. */
export async function updateStarterData(database: LernzeitDB = db): Promise<void> {
  await markLegacyLevels(database)
  await Promise.all([addStarterConjugations(database), syncStarterTopics(database)])
}

/**
 * A German install from before packs (or a restored backup of one) had every
 * level. Its settings say so once, so Starter buttons and Add a level work.
 */
export async function markLegacyLevels(database: LernzeitDB = db): Promise<void> {
  if (!(await database.kv.get(KV_KEYS.seeded))) return
  const stored = (await database.kv.get(KV_KEYS.settings))?.value as Partial<Settings> | undefined
  if (stored?.levels || (stored?.learning ?? 'de') !== 'de') return
  await updateSettings({ levels: [...(packInfo('de')?.levels ?? [])] }, database)
}

/**
 * Brings the grammar topics you have not edited up to the pack's version
 * once, when STARTER_GRAMMAR_VERSION is newer. A German install from before
 * packs (or a restored backup) gets the topics it never had the first time.
 */
export async function syncStarterTopics(database: LernzeitDB = db): Promise<{ added: number; updated: number }> {
  const synced = (await database.kv.get(KV_KEYS.starterGrammar))?.value
  if (synced === STARTER_GRAMMAR_VERSION) return { added: 0, updated: 0 }
  const { learning } = await getSettings(database)
  const legacy = synced === undefined && learning === 'de' && !!(await database.kv.get(KV_KEYS.seeded))
  const local = synced !== undefined || legacy ? await installedContent(database) : undefined
  const added = legacy && local ? await installStarterTopics(local.topics, database) : 0
  const updated = local ? await refreshStarterTopics(database, local.topics) : 0
  await database.kv.put({ key: KV_KEYS.starterGrammar, value: STARTER_GRAMMAR_VERSION })
  return { added, updated }
}

/**
 * German starter verbs saved before cards had a conjugation get the pack's
 * tables, so grammar practice can ask them. Runs once. A verb you changed
 * (other verb forms than the pack) or gave a table yourself is left alone.
 * Returns how many cards were filled.
 */
export async function addStarterConjugations(database: LernzeitDB = db): Promise<number> {
  if (await database.kv.get(KV_KEYS.starterConjugations)) return 0
  const { learning } = await getSettings(database)
  const tables = new Map(learning === 'de' ? (await loadPack('de')).cards.filter((c) => c.conjugation).map((c) => [c.id, c]) : [])
  return database.transaction('rw', [database.cards, database.kv], async () => {
    if (await database.kv.get(KV_KEYS.starterConjugations)) return 0
    const cards = (await database.cards.bulkGet([...tables.keys()])).filter((c): c is Card => !!c)
    const filled = cards.flatMap((card) => {
      const source = tables.get(card.id)!
      if (card.conjugation || card.verbForms !== source.verbForms) return []
      return [{ ...card, conjugation: cleanConjugation(source.conjugation) }]
    })
    await database.cards.bulkPut(filled)
    await database.kv.put({ key: KV_KEYS.starterConjugations, value: Date.now() })
    return filled.length
  })
}
