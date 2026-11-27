/*
 * What the Today screen shows, as plain functions of the library's records: the web and the phone
 * both read their tables, call these and draw the answer. No storage, no clock of their own.
 */
import type { ActiveTimer, Card, CardReview, PracticeRun, Session, Topic, TopicColor } from './types'
import { goalFor, indexMinutes, isGoalHit, topicStreak } from './goals'
import { dateKey, dateKeyIn, formatClock, formatHM, formatLongDate, localDateTimeIn, MINUTE, nextMidnightIn, nextMidnightMs, startOfDayMs } from './time'
import { practiceTotals } from './practice'
import { State } from './srs'
import { studiedMinutes } from './timer'

export interface TopicProgress {
  topic: Topic
  goal: number
  done: number
  left: number
  hit: boolean
  /** Minutes from the running timer included in `done`. */
  live: number
}

export interface TodayProgress {
  today: string
  topics: TopicProgress[]
  sessions: Session[]
  totalGoal: number
  /** Minutes worked today in all, the running timer included. */
  totalDone: number
  totalLeft: number
  goalsHit: number
  goalCount: number
  timer: ActiveTimer | null | undefined
  now: number
}

/** Minutes the running timer has added to today so far (time before midnight belongs to yesterday). */
export function liveMinutesToday(timer: ActiveTimer | null | undefined, now: number): number {
  if (!timer || (timer.mode === 'pomodoro' && timer.phase === 'break')) return 0
  const studied = studiedMinutes(timer, now)
  const sinceMidnight = (now - startOfDayMs(now)) / MINUTE
  return Math.max(0, Math.min(studied, sinceMidnight))
}

/**
 * Today's goals per topic, plus the time worked in total. `totalDone` counts every
 * session of the day, also on archived topics, so it is all the time you worked today.
 */
export function buildTodayProgress(
  topics: Topic[],
  sessions: Session[],
  timer: ActiveTimer | null | undefined,
  now: number,
  today: string,
): TodayProgress {
  const live = liveMinutesToday(timer, now)
  const rows: TopicProgress[] = topics.map((topic) => {
    const goal = goalFor(topic, today)
    const liveHere = timer?.topicId === topic.id ? live : 0
    const done = sessions.filter((s) => s.topicId === topic.id).reduce((sum, s) => sum + s.minutes, 0) + liveHere
    const doneWhole = Math.floor(done + 1e-6)
    return { topic, goal, done, left: Math.max(0, goal - doneWhole), hit: isGoalHit(done, goal), live: liveHere }
  })
  const withGoal = rows.filter((r) => r.goal > 0)
  return {
    today,
    topics: rows,
    sessions,
    totalGoal: withGoal.reduce((s, r) => s + r.goal, 0),
    totalDone: sessions.reduce((s, x) => s + x.minutes, 0) + live,
    totalLeft: withGoal.reduce((s, r) => s + r.left, 0),
    goalsHit: withGoal.filter((r) => r.hit).length,
    goalCount: withGoal.length,
    timer,
    now,
  }
}

/** The line under the page title: the date and how much of today's goals is left. */
export function todaySubtitle(progress: Pick<TodayProgress, 'today' | 'goalCount' | 'totalLeft'>): string {
  let subtitle = formatLongDate(progress.today)
  if (progress.goalCount === 0) subtitle += ' · no goals today'
  else if (progress.totalLeft === 0) subtitle += ' · every goal reached'
  else subtitle += ` · ${formatHM(progress.totalLeft)} h left to reach your goals`
  return subtitle
}

/** The calendar date at `now`: in `timeZone` when it is a zone the platform knows, else on this device. */
export function dayKeyAt(now: number, timeZone?: string): string {
  if (timeZone) {
    try {
      return dateKeyIn(now, timeZone)
    } catch {
      // An unknown zone name: the device's own day is the best guess.
    }
  }
  return dateKey(now)
}

/** The instant the day of `now` ends (in `timeZone` as `dayKeyAt` reads it). */
export function dayEndsAt(now: number, timeZone?: string): number {
  if (timeZone) {
    try {
      return nextMidnightIn(now, timeZone)
    } catch {
      // See dayKeyAt.
    }
  }
  return nextMidnightMs(now)
}

/** Which of the seven card-image pastels a card gets: the same on every device. */
export function pastelIndex(seed: string): number {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0) % 7
}

function dayHash(day: string): number {
  let h = 0
  for (const ch of day) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return h
}

/**
 * A different learned word each day (stable through the day). Falls back to
 * any word with an image while nothing has been learned yet.
 */
export function pickWordOfTheDay(cards: Card[], reviews: CardReview[], day: string): Card | undefined {
  const learned = new Set(reviews.filter((r) => r.state === State.Review).map((r) => r.cardId))
  const words = cards.filter((c) => c.type === 'word').sort((a, b) => a.id.localeCompare(b.id))
  const pictured = (c: Card) => !!c.imageId || !!c.emoji
  // Nouns with a picture make the nicest word of the day.
  let pool = words.filter((c) => learned.has(c.id) && pictured(c))
  if (!pool.length) pool = words.filter((c) => learned.has(c.id))
  if (!pool.length) pool = words.filter((c) => pictured(c) && (c.gender || c.partOfSpeech === 'noun'))
  if (!pool.length) pool = words
  return pool.length ? pool[dayHash(day) % pool.length] : undefined
}

export interface TodayInput {
  /** Every topic, archived ones too (their sessions still show). */
  topics: Topic[]
  /** Every session: the streak reads past days. */
  sessions: Session[]
  cards: Card[]
  reviews: CardReview[]
  practiceRuns: PracticeRun[]
  now: number
  /** The owner's IANA zone (`kv/timeZone`); the device's own zone when missing. */
  timeZone?: string
  timer?: ActiveTimer | null
}

export interface TodaySession {
  id: string
  /** "14:02" in the owner's zone. */
  startClock: string
  endClock: string
  /** Undefined for a topic that was deleted. */
  topicName?: string
  topicColor?: TopicColor
  note?: string
  /** Whole minutes, at least 1. */
  minutes: number
}

export interface TodayView {
  today: string
  /** "Wednesday, 14 October" */
  longDate: string
  /** The date and the time left, as one line. */
  subtitle: string
  /** Active topics in order, with today's goal progress. */
  progress: TodayProgress
  sessions: TodaySession[]
  practised: { ms: number; reviewed: number }
  /** The first topic's goal streak, in days. */
  streak: { days: number; topicName?: string }
  word?: Card
  /** When the day changes: the screen reads again then. */
  dayEndsAt: number
}

function clockIn(ms: number, timeZone?: string): string {
  if (timeZone) {
    try {
      return localDateTimeIn(ms, timeZone).slice(11)
    } catch {
      // See dayKeyAt.
    }
  }
  return formatClock(ms)
}

/** Everything the Today screen draws, for the day `now` falls on. */
export function buildToday(input: TodayInput): TodayView {
  const { now, timeZone } = input
  const today = dayKeyAt(now, timeZone)
  const active = input.topics.filter((t) => !t.archived).sort((a, b) => a.order - b.order)
  const todays = input.sessions.filter((s) => s.date === today).sort((a, b) => a.start - b.start)
  const progress = buildTodayProgress(active, todays, input.timer, now, today)
  const byId = new Map(input.topics.map((t) => [t.id, t]))
  const mainTopic = active[0]
  const practised = practiceTotals(input.practiceRuns.filter((r) => r.day === today))
  return {
    today,
    longDate: formatLongDate(today),
    subtitle: todaySubtitle(progress),
    progress,
    sessions: todays.map((s) => ({
      id: s.id,
      startClock: clockIn(s.start, timeZone),
      endClock: clockIn(s.end, timeZone),
      topicName: byId.get(s.topicId)?.name,
      topicColor: byId.get(s.topicId)?.color,
      note: s.note || undefined,
      minutes: Math.max(1, Math.round(s.minutes)),
    })),
    practised: { ms: practised.ms, reviewed: practised.reviewed },
    streak: {
      days: mainTopic ? topicStreak(mainTopic, indexMinutes(input.sessions), today).current : 0,
      topicName: mainTopic?.name,
    },
    word: pickWordOfTheDay(input.cards, input.reviews, today),
    dayEndsAt: dayEndsAt(now, timeZone),
  }
}
