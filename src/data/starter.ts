import { db, getSettings, KV_KEYS, updateSettings, type LernzeitDB } from '@/db/db'
import type { StoryLevel, TopicColor } from '@/db/types'
import { nextTopicColor } from '@/lib/colors'
import { uniformGoals } from '@/lib/goals'
import { LEVELS } from '@/languages'
import { STARTER_GRAMMAR_VERSION, installStarterTopics, type StarterTopic } from './grammar'
import { parseCardPack, prepareCardPack, writeCardPack, type CardPack } from './io'
import { installStarterQuestions, type StarterQuestion } from './questions'
import { installStarterStories, type StarterStory } from './stories'
import { createTopic } from './topics'

/**
 * The German content the welcome screen offers, made from a backup by
 * scripts/make-starter.ts with everything personal left out. It is
 * downloaded only when you pick German.
 */
export const STARTER_URL = '/starter/german.json'

/** What the German starter holds, shown before it is downloaded. A test keeps it in step with the file. */
export const GERMAN_SUMMARY = { decks: 52, cards: 898, stories: 107, questions: 44, grammar: 27 }

export interface StarterFile {
  format: 'lernzeit-starter'
  version: number
  /** The topic its decks and stories count toward: "German". */
  topic: string
  pack: CardPack
  stories: (StarterStory & { words?: string[] })[]
  questions: StarterQuestion[]
  grammarTopics: StarterTopic[]
}

/** Checks a parsed starter file, or throws a readable error. */
export function parseStarterFile(value: unknown): StarterFile {
  const v = value as Partial<StarterFile> | null
  if (!v || v.format !== 'lernzeit-starter' || typeof v.topic !== 'string') throw new Error('The starter data is missing from this copy of Lernzeit')
  if (typeof v.version !== 'number' || v.version > 1) throw new Error('The starter data comes from a newer version of Lernzeit')
  for (const key of ['stories', 'questions', 'grammarTopics'] as const) {
    if (!Array.isArray(v[key])) throw new Error(`The starter data is missing "${key}"`)
  }
  parseCardPack(v.pack)
  return v as StarterFile
}

/** Fetches the German starter. */
export async function loadStarterFile(fetcher: typeof fetch = fetch): Promise<StarterFile> {
  const response = await fetcher(STARTER_URL)
  if (!response.ok) throw new Error('Could not download the German content')
  let raw: unknown
  try {
    raw = await response.json()
  } catch {
    // A server without the file answers with the app's page instead.
    throw new Error('The starter data is missing from this copy of Lernzeit')
  }
  return parseStarterFile(raw)
}

/** True when this browser has no data at all and has not been through the welcome yet. */
export async function shouldOfferStarter(database: LernzeitDB = db): Promise<boolean> {
  if (await database.kv.get(KV_KEYS.starterOffer)) return false
  // A browser that ever had a seed or a restore is not new, even if it is empty now.
  if (await database.kv.get(KV_KEYS.seeded)) return false
  const tables = [
    database.topics, database.sessions, database.decks, database.cards, database.tasks,
    database.stories, database.questions, database.grammarTopics, database.docs,
  ]
  const counts = await Promise.all(tables.map((t) => t.count()))
  return counts.every((n) => n === 0)
}

export interface WelcomeTopic {
  name: string
  /** Daily goal, every day of the week. */
  minutes: number
  /** The colour the welcome screen showed; the next free one if it is taken or missing. */
  color?: TopicColor
}

export interface SetupResult {
  topics: number
  cards: number
  stories: number
  questions: number
  grammar: number
}

/**
 * Creates a topic with a daily goal for each pick and, when the German
 * starter is given, adds its content under the German topic. Cards start
 * new; nothing of anyone's progress comes along.
 */
export async function setUpLernzeit(picks: WelcomeTopic[], german?: StarterFile, database: LernzeitDB = db): Promise<SetupResult> {
  const names = new Set<string>()
  const topics = picks
    .map((p) => ({ name: p.name.trim(), minutes: Math.max(0, Math.round(p.minutes)), color: p.color }))
    .filter((p) => {
      const key = p.name.toLowerCase()
      if (!p.name || names.has(key)) return false
      names.add(key)
      return true
    })
  if (german && !names.has(german.topic.toLowerCase())) topics.unshift({ name: german.topic, minutes: 30, color: undefined })

  // Pictures are decoded before the transaction: IndexedDB transactions cannot wait on other work.
  const prepared = german ? await prepareCardPack(german.pack) : undefined
  const settings = await getSettings(database)
  const tables = [
    database.kv, database.topics, database.decks, database.cards, database.reviews, database.images,
    database.stories, database.questions, database.grammarTopics,
  ]
  return database.transaction('rw', tables, async () => {
    const existing = await database.topics.toArray()
    const colors = existing.map((t) => t.color)
    let created = 0
    for (const topic of topics) {
      if (existing.some((t) => !t.archived && t.name.toLowerCase() === topic.name.toLowerCase())) continue
      const color = topic.color && !colors.includes(topic.color) ? topic.color : nextTopicColor(colors)
      colors.push(color)
      await createTopic({ name: topic.name, color, goals: uniformGoals(topic.minutes) }, database)
      created++
    }

    const result: SetupResult = { topics: created, cards: 0, stories: 0, questions: 0, grammar: 0 }
    if (german && prepared) {
      result.cards = (await writeCardPack(prepared, {}, database)).cards
      result.stories = await installStarterStories(german.stories, database)
      result.questions = await installStarterQuestions(german.questions, database)
      result.grammar = await installStarterTopics(german.grammarTopics, database)
      // The levels it covers, so Add a level offers only the others.
      const levels = [...german.stories.map((s) => s.level), ...german.grammarTopics.map((t) => t.level)]
      const covered = new Set<StoryLevel>([...settings.levels, ...levels.filter((l): l is StoryLevel => !!l)])
      await updateSettings({ levels: LEVELS.filter((l) => covered.has(l)) }, database)
      // The content is current: nothing for the updates from before packs to do.
      await database.kv.bulkPut([
        { key: KV_KEYS.starterGrammar, value: STARTER_GRAMMAR_VERSION },
        { key: KV_KEYS.starterConjugations, value: Date.now() },
      ])
    }
    await database.kv.bulkPut([
      { key: KV_KEYS.starterOffer, value: 'done' },
      // A first visit ends with the tour of the app.
      { key: KV_KEYS.tour, value: 'pending' },
    ])
    return result
  })
}

/** Keeps the browser empty and stops asking. The tour of the app still follows. */
export async function startEmpty(database: LernzeitDB = db): Promise<void> {
  await database.kv.bulkPut([
    { key: KV_KEYS.starterOffer, value: 'empty' },
    { key: KV_KEYS.tour, value: 'pending' },
  ])
}
