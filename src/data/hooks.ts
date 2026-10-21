import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, DEFAULT_SETTINGS, KV_KEYS } from '@/db/db'
import type { ActiveTimer, Card, CardReview, Deck, DrillStat, ExerciseStat, GrammarTopic, ImageFit, Question, QuestionResponse, ReviewLog, Session, Settings, Story, Task, Topic } from '@/db/types'
import { buildQueue, usageToday } from '@/lib/queue'
import { onVoicesChanged, voicesFor } from '@/lib/speech'
import { dateKey, nextMidnightMs } from '@/lib/time'
import { hasLearningData, languageOf, type Language } from './languages'
import type { PendingNote } from './timer'

export function useSettings(): Settings {
  const row = useLiveQuery(() => db.kv.get(KV_KEYS.settings), [])
  return useMemo(() => ({ ...DEFAULT_SETTINGS, ...((row?.value as Partial<Settings>) ?? {}) }), [row])
}

/** The language you learn and your own, from Settings. */
export function useLanguage(): Language {
  const { learning, native } = useSettings()
  return useMemo(() => languageOf({ learning, native }), [learning, native])
}

/** Attributes for text in the language you learn: its `lang`, and a direction that follows the text, for Arabic. */
export function useLearningText(): { lang: string; dir: 'auto' } {
  const { speech } = useLanguage()
  return useMemo(() => ({ lang: speech, dir: 'auto' }), [speech])
}

/** Attributes for text in your own language (meanings, translations, explanations): its `lang` and direction. */
export function useNativeText(): { lang: string; dir: 'rtl' | 'ltr' } {
  const { native } = useLanguage()
  return useMemo(() => ({ lang: native.code, dir: native.rtl ? 'rtl' : 'ltr' }), [native.code, native.rtl])
}

/** False while there is nothing to learn yet (Welcome then offers the packs); undefined while loading. */
export function useHasLearningData(): boolean | undefined {
  return useLiveQuery(() => hasLearningData(db), [])
}

const EMPTY: never[] = []

/** Active topics in display order. Pass `true` to include archived ones. */
export function useTopics(includeArchived = false): Topic[] {
  const topics = useLiveQuery(() => db.topics.orderBy('order').toArray(), [])
  return useMemo(() => (topics ?? EMPTY).filter((t) => includeArchived || !t.archived), [topics, includeArchived])
}

/** `undefined` while loading, `null` when no timer is running. */
export function useActiveTimer(): ActiveTimer | null | undefined {
  return useLiveQuery(async () => ((await db.kv.get(KV_KEYS.activeTimer))?.value as ActiveTimer | undefined) ?? null, [])
}

export function usePendingNote(): PendingNote | undefined {
  return useLiveQuery(async () => (await db.kv.get(KV_KEYS.pendingNote))?.value as PendingNote | undefined, [])
}

/** Sessions with from <= date <= to. */
export function useSessionsBetween(from: string, to: string): Session[] {
  return useLiveQuery(() => db.sessions.where('date').between(from, to, true, true).sortBy('start'), [from, to]) ?? EMPTY
}

export function useAllSessions(): Session[] | undefined {
  return useLiveQuery(() => db.sessions.toArray(), [])
}

export function useDecks(): Deck[] {
  return useLiveQuery(() => db.decks.orderBy('order').toArray(), []) ?? EMPTY
}

export function useCards(): Card[] | undefined {
  return useLiveQuery(() => db.cards.toArray(), [])
}

export function useCard(id: string | undefined): Card | undefined {
  return useLiveQuery(() => (id ? db.cards.get(id) : undefined), [id])
}

export function useAllReviews(): CardReview[] | undefined {
  return useLiveQuery(() => db.reviews.toArray(), [])
}

export function useLogsForCard(cardId: string | undefined): ReviewLog[] {
  return useLiveQuery(() => (cardId ? db.reviewLogs.where('cardId').equals(cardId).toArray() : []), [cardId]) ?? EMPTY
}

export function useLogsSince(day: string): ReviewLog[] {
  return useLiveQuery(() => db.reviewLogs.where('day').aboveOrEqual(day).toArray(), [day]) ?? EMPTY
}

export function useTasks(): Task[] | undefined {
  return useLiveQuery(() => db.tasks.orderBy('order').toArray(), [])
}

/** Stories, last opened or added first. */
export function useStories(): Story[] | undefined {
  return useLiveQuery(async () => (await db.stories.toArray()).sort((a, b) => (b.openedAt ?? b.createdAt) - (a.openedAt ?? a.createdAt)), [])
}

/** `undefined` while loading, `null` when there is no such story. */
export function useStory(id: string | undefined): Story | null | undefined {
  return useLiveQuery(async () => (id ? ((await db.stories.get(id)) ?? null) : null), [id])
}

export function useQuestions(): Question[] | undefined {
  return useLiveQuery(() => db.questions.toArray(), [])
}

/** Every answer typed in practice, oldest first. */
export function useResponses(): QuestionResponse[] | undefined {
  return useLiveQuery(() => db.responses.orderBy('at').toArray(), [])
}

/** Grammar topics, oldest first. */
export function useGrammarTopics(): GrammarTopic[] | undefined {
  return useLiveQuery(() => db.grammarTopics.orderBy('createdAt').toArray(), [])
}

/** `undefined` while loading, `null` when there is no such topic. */
export function useGrammarTopic(id: string | undefined): GrammarTopic | null | undefined {
  return useLiveQuery(async () => (id ? ((await db.grammarTopics.get(id)) ?? null) : null), [id])
}

/** How each grammar exercise has gone. */
export function useExerciseStats(): ExerciseStat[] | undefined {
  return useLiveQuery(() => db.exerciseStats.toArray(), [])
}

/** How each card does in each drill. */
export function useDrillStats(): DrillStat[] | undefined {
  return useLiveQuery(() => db.drillStats.toArray(), [])
}

/** Current time, refreshed every `intervalMs` while `enabled`. */
export function useNow(intervalMs = 1000, enabled = true): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!enabled) return
    const tick = () => setNow(Date.now())
    tick()
    // Align to the next whole second so clocks tick together.
    let interval: ReturnType<typeof setInterval> | undefined
    const align = setTimeout(() => {
      tick()
      interval = setInterval(tick, intervalMs)
    }, intervalMs - (Date.now() % intervalMs))
    const onVisible = () => document.visibilityState === 'visible' && tick()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearTimeout(align)
      if (interval) clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [intervalMs, enabled])
  return now
}

/** Today's date key; updates itself at midnight. */
export function useToday(): string {
  const [today, setToday] = useState(() => dateKey())
  useEffect(() => {
    const id = setTimeout(() => setToday(dateKey()), nextMidnightMs(Date.now()) - Date.now() + 500)
    const onVisible = () => setToday(dateKey())
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearTimeout(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [today])
  return today
}

const imageCache = new Map<string, { url: string; fit: ImageFit }>()

/** Object URL and fit for a stored image (cached, so lists do not flicker). */
export function useImage(imageId: string | undefined): { url?: string; fit?: ImageFit } {
  const cached = imageId ? imageCache.get(imageId) : undefined
  const image = useLiveQuery(() => (imageId && !cached ? db.images.get(imageId) : undefined), [imageId, cached])
  return useMemo(() => {
    if (!imageId) return {}
    if (cached) return cached
    if (!image) return {}
    const entry = { url: URL.createObjectURL(image.blob), fit: image.fit }
    imageCache.set(imageId, entry)
    return entry
  }, [imageId, cached, image])
}

export interface StudyQueue {
  queue: CardReview[]
  newCount: number
  reviewCount: number
  learningCount: number
  total: number
  byDeck: Map<string, number>
  loaded: boolean
}

/** Today's review queue across all decks (or one deck), honouring daily limits. */
export function useStudyQueue(deckId?: string, refreshMs = 60_000): StudyQueue {
  const today = useToday()
  const now = useNow(refreshMs)
  const reviews = useAllReviews()
  const decks = useDecks()
  const cards = useCards()
  const logs = useLogsSince(today)
  return useMemo(() => {
    if (!reviews || !cards) {
      return { queue: [], newCount: 0, reviewCount: 0, learningCount: 0, total: 0, byDeck: new Map(), loaded: false }
    }
    const created = new Map(cards.map((c) => [c.id, c.createdAt]))
    const selected = deckId ? decks.filter((d) => d.id === deckId) : decks
    const { queue, counts } = buildQueue({
      reviews,
      decks: selected,
      usage: usageToday(logs, today),
      now,
      createdAt: (id) => created.get(id) ?? 0,
    })
    const byDeck = new Map<string, number>()
    for (const r of queue) byDeck.set(r.deckId, (byDeck.get(r.deckId) ?? 0) + 1)
    return { queue, ...counts, byDeck, loaded: true }
  }, [reviews, cards, decks, logs, today, now, deckId])
}

/** The browser's voices for a language. They load asynchronously, so a change renders again. */
export function useVoices(lang: string) {
  const [, setLoads] = useState(0)
  useEffect(() => onVoicesChanged(() => setLoads((n) => n + 1)), [])
  return voicesFor(lang)
}
