import { describe, expect, it } from 'vitest'
import type { ActiveTimer, Session, Topic, WeekGoals } from '@/db/types'
import { MINUTE, WEEKDAYS } from '@/lib/time'
import { buildTodayProgress } from './progress'

const TODAY = '2026-11-19'
const NOON = new Date(2026, 10, 19, 12, 0).getTime()

const week = (minutes: number) => Object.fromEntries(WEEKDAYS.map((d) => [d, minutes])) as WeekGoals

const topic = (id: string, goal: number, archived = false): Topic => ({
  id,
  name: id,
  color: 'sage',
  goalMinutes: week(goal),
  goalHistory: [],
  archived,
  order: 0,
  createdAt: 0,
})

const session = (topicId: string, minutes: number): Session => ({
  id: `${topicId}-${minutes}`,
  topicId,
  start: NOON - minutes * MINUTE,
  end: NOON,
  minutes,
  date: TODAY,
  source: 'timer',
})

const timer = (topicId: string, startedMinutesAgo: number): ActiveTimer => ({
  runId: 'run',
  topicId,
  mode: 'free',
  startedAt: NOON - startedMinutesAgo * MINUTE,
  pausedTotalMs: 0,
  phase: 'focus',
  cycle: 1,
  firstStartedAt: NOON - startedMinutesAgo * MINUTE,
  note: '',
})

describe('buildTodayProgress', () => {
  it('adds up the time worked today across topics', () => {
    const p = buildTodayProgress([topic('german', 120), topic('coding', 60)], [session('german', 60), session('coding', 50)], null, NOON, TODAY)
    expect(p.totalDone).toBe(110)
    expect(p.totalGoal).toBe(180)
    expect(p.goalsHit).toBe(0)
  })

  it('counts the running timer in the total and in its topic', () => {
    const p = buildTodayProgress([topic('german', 120)], [session('german', 60)], timer('german', 15), NOON, TODAY)
    expect(p.totalDone).toBe(75)
    expect(p.topics[0].done).toBe(75)
    expect(p.topics[0].live).toBe(15)
  })

  it('counts time on topics that are not listed, like archived ones', () => {
    const p = buildTodayProgress([topic('german', 120)], [session('german', 30), session('old', 20)], timer('old', 10), NOON, TODAY)
    expect(p.topics).toHaveLength(1)
    expect(p.topics[0].done).toBe(30)
    expect(p.totalDone).toBe(60)
  })

  it('counts time on topics without a goal, but not their zero goal', () => {
    const p = buildTodayProgress([topic('german', 60), topic('reading', 0)], [session('reading', 25)], null, NOON, TODAY)
    expect(p.totalDone).toBe(25)
    expect(p.totalGoal).toBe(60)
    expect(p.goalCount).toBe(1)
  })
})
