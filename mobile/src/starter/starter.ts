/*
 * The welcome and the German starter, as on the web (src/data/starter.ts): a first launch with an
 * empty library (and an empty cloud library, once the first sync is in) picks topics and a daily goal
 * and may install the German starter. The starter file is fetched from the Worker, keeping the app
 * small. Cards start new; pictures in the file are left out (the phone shows each card's emoji).
 */
import { packCardRows, type CardPack } from '@lernzeit/core/cardPack'
import { uniformGoals } from '@lernzeit/core/goals'
import { dayKeyAt } from '@lernzeit/core/today'
import type { Deck, Question, Story, GrammarTopic, StoryLevel, Topic, TopicColor } from '@lernzeit/core/types'
import { newId } from '../data/ids'
import { readSettings, saveSettings } from '../data/settings'
import { useLiveQuery } from '../store/live'
import type { LocalLibrary } from '../store/library'
import { LAST_SYNCED_KEY } from '../sync/status'
import { TOPIC_COLOR_KEYS } from '../theme'
import { zoneOf } from '../timer/timerStore'

export const STARTER_PATH = '/starter/german.json'
/** What the German starter holds, shown before it is downloaded. */
export const GERMAN_SUMMARY = { decks: 52, cards: 898, stories: 107, questions: 44, grammar: 27 }
const LEVELS: readonly StoryLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']
export const STARTER_GRAMMAR_VERSION = 2

type StarterStory = Pick<Story, 'id' | 'title' | 'text' | 'translation' | 'level' | 'tags'> & { topic: string; words?: string[] }
type StarterQuestion = Pick<Question, 'id'> & Record<string, unknown>
type StarterTopic = Pick<GrammarTopic, 'id'> & Record<string, unknown> & { level?: StoryLevel }

export interface StarterFile {
  format: 'lernzeit-starter'
  version: number
  topic: string
  pack: CardPack
  stories: StarterStory[]
  questions: StarterQuestion[]
  grammarTopics: StarterTopic[]
}

export function parseStarterFile(value: unknown): StarterFile {
  const v = value as Partial<StarterFile> | null
  if (!v || v.format !== 'lernzeit-starter' || typeof v.topic !== 'string') throw new Error('The starter data is not readable.')
  if (typeof v.version !== 'number' || v.version > 1) throw new Error('The starter data comes from a newer version of Lernzeit.')
  for (const key of ['stories', 'questions', 'grammarTopics'] as const) if (!Array.isArray(v[key])) throw new Error(`The starter data is missing "${key}".`)
  if (!v.pack || v.pack.format !== 'lernzeit-cards' || !Array.isArray(v.pack.cards) || !Array.isArray(v.pack.decks)) throw new Error('The starter data has no cards.')
  return v as StarterFile
}

/** Downloads the German starter from the Worker (`apiUrl` is the app's cloud address). */
export async function loadStarterFile(apiUrl: string, fetcher: typeof fetch = fetch): Promise<StarterFile> {
  let response: Response
  try {
    response = await fetcher(`${apiUrl.replace(/\/+$/, '')}${STARTER_PATH}`)
  } catch {
    throw new Error("Could not download the German content. Check the connection and try again.")
  }
  if (!response.ok) throw new Error('Could not download the German content.')
  return parseStarterFile(await response.json().catch(() => undefined))
}

export interface WelcomeTopic {
  name: string
  /** Daily goal in minutes, every day of the week. */
  minutes: number
  color?: TopicColor
}

export interface SetupResult {
  topics: number
  cards: number
  stories: number
  questions: number
  grammar: number
}

/** Whether a library holds nothing at all: the welcome is for a phone with nothing, in a cloud with nothing. */
export function libraryIsEmpty(library: LocalLibrary): boolean {
  return (['topics', 'sessions', 'decks', 'cards', 'tasks', 'stories', 'questions', 'grammarTopics', 'docs'] as const).every((tbl) => library.count(tbl) === 0)
}

/** True once signed in, synced at least once, with nothing here and no sign the welcome was done on any device. */
export function shouldOfferStarter(library: LocalLibrary): boolean {
  if (library.getMeta<number>(LAST_SYNCED_KEY) === undefined) return false
  if (library.get('kv', 'starterOffer') || library.get('kv', 'seeded')) return false
  return libraryIsEmpty(library)
}

export function useShouldOfferStarter(): boolean {
  return useLiveQuery(['kv', 'topics', 'decks', 'cards', 'sessions', 'tasks', 'stories', 'questions', 'grammarTopics', 'docs', 'meta'], (library) => shouldOfferStarter(library), [])
}

/** The next colour no topic has yet. */
function nextColor(used: TopicColor[]): TopicColor {
  return TOPIC_COLOR_KEYS.find((c) => !used.includes(c)) ?? TOPIC_COLOR_KEYS[used.length % TOPIC_COLOR_KEYS.length]
}

/** Creates a topic with a daily goal for each pick and, with the German starter, its content under the German topic. */
export function setUpLernzeit(library: LocalLibrary, picks: WelcomeTopic[], german?: StarterFile): SetupResult {
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

  return library.write(() => {
    const today = dayKeyAt(Date.now(), zoneOf(library))
    const existing = library.list<Topic>('topics')
    const colors = existing.map((t) => t.color)
    let order = Math.max(-1, ...existing.map((t) => t.order)) + 1
    const result: SetupResult = { topics: 0, cards: 0, stories: 0, questions: 0, grammar: 0 }
    const now = Date.now()
    for (const t of topics) {
      if (existing.some((e) => !e.archived && e.name.toLowerCase() === t.name.toLowerCase())) continue
      const color = t.color && !colors.includes(t.color) ? t.color : nextColor(colors)
      colors.push(color)
      const goals = uniformGoals(t.minutes)
      const topic: Topic = { id: newId(), name: t.name, color, goalMinutes: goals, goalHistory: [{ since: today, goals }], archived: false, order: order++, createdAt: now }
      library.put('topics', topic)
      existing.push(topic)
      result.topics++
    }

    if (german) {
      const topicByName = new Map(library.list<Topic>('topics').map((t) => [t.name.toLowerCase(), t]))
      const decks = new Map<string, Deck>()
      let deckOrder = Math.max(-1, ...library.list<Deck>('decks').map((d) => d.order)) + 1
      for (const pd of german.pack.decks) {
        const deck: Deck = {
          id: pd.id,
          name: pd.name.trim(),
          topicId: pd.topic ? topicByName.get(pd.topic.toLowerCase())?.id : undefined,
          newPerDay: pd.newPerDay ?? 15,
          reviewsPerDay: pd.reviewsPerDay ?? 150,
          directions: { imageToDe: true, enToDe: true, deToEn: false, ...pd.directions },
          order: deckOrder++,
          createdAt: now,
        }
        library.put('decks', deck)
        decks.set(pd.id, deck)
      }
      german.pack.cards.forEach((pc, i) => {
        const deck = decks.get(pc.deckId)
        if (!deck) return
        // Pictures inside the file are left out; the card keeps its emoji.
        const rows = packCardRows({ ...pc, image: undefined }, deck, { id: pc.id ?? newId(), now, index: i })
        library.put('cards', rows.card)
        for (const r of rows.reviews) library.put('reviews', r)
        result.cards++
      })
      german.stories.forEach(({ topic, words, ...story }, i) => {
        library.put('stories', { ...story, words, topicId: topicByName.get(topic.toLowerCase())?.id, createdAt: now - i, updatedAt: now - i, readCount: 0 })
        result.stories++
      })
      german.questions.forEach((q, i) => {
        library.put('questions', { ...q, createdAt: now + i, updatedAt: now + i })
        result.questions++
      })
      german.grammarTopics.forEach((t, i) => {
        library.put('grammarTopics', { ...t, createdAt: now + i, updatedAt: now + i })
        result.grammar++
      })
      const covered = new Set<StoryLevel>([...readSettings(library).levels, ...[...german.stories.map((s) => s.level), ...german.grammarTopics.map((t) => t.level)].filter((l): l is StoryLevel => !!l)])
      saveSettings(library, { levels: LEVELS.filter((l) => covered.has(l)) })
      library.put('kv', { key: 'starterGrammar', value: STARTER_GRAMMAR_VERSION })
      library.put('kv', { key: 'starterConjugations', value: now })
    }
    library.put('kv', { key: 'starterOffer', value: 'done' })
    // A first visit ends with the walkthrough of the app.
    library.put('kv', { key: 'tour', value: 'pending' })
    return result
  })
}

/** Keeps the library empty and stops asking. The walkthrough still follows. */
export function startEmpty(library: LocalLibrary): void {
  library.write(() => {
    library.put('kv', { key: 'starterOffer', value: 'done' })
    library.put('kv', { key: 'tour', value: 'pending' })
  })
}

export type StarterPart = 'stories' | 'questions' | 'grammarTopics'

/**
 * Adds the starter stories, questions or grammar topics that are missing, at the levels this
 * library has installed (all of them when none are recorded), as the web's Starter buttons do.
 * Returns how many were added.
 */
export function addStarterPart(library: LocalLibrary, german: StarterFile, part: StarterPart): number {
  const levels = readSettings(library).levels
  const wanted = (level?: StoryLevel) => !levels.length || !level || levels.includes(level)
  return library.write(() => {
    const now = Date.now()
    let added = 0
    if (part === 'stories') {
      const topicByName = new Map(library.list<Topic>('topics').filter((t) => !t.archived).map((t) => [t.name.toLowerCase(), t]))
      german.stories.forEach(({ topic, words, ...story }, i) => {
        if (!wanted(story.level) || library.get('stories', story.id)) return
        // The list shows the newest first, so later entries get earlier times to keep the file's order.
        library.put('stories', { ...story, words, topicId: topicByName.get(topic.toLowerCase())?.id, createdAt: now - i, updatedAt: now - i, readCount: 0 })
        added++
      })
    } else {
      const rows: { id: string; level?: unknown }[] = part === 'questions' ? german.questions : german.grammarTopics
      rows.forEach((row, i) => {
        if (!wanted(row.level as StoryLevel | undefined) || library.get(part, row.id)) return
        library.put(part, { ...row, createdAt: now + i, updatedAt: now + i })
        added++
      })
    }
    return added
  })
}

/** Downloads the starter and adds one part of it; the message to show. */
export async function installStarterPart(library: LocalLibrary, apiUrl: string, part: StarterPart, noun: [string, string]): Promise<string> {
  const added = addStarterPart(library, await loadStarterFile(apiUrl), part)
  return added ? `Added ${added} starter ${added === 1 ? noun[0] : noun[1]}` : `All starter ${noun[1]} are already here`
}
