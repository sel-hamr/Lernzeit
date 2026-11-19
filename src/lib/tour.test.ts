import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { PRACTICE_RETURN } from './queue'
import { STORY_THEMES } from './storyThemes'
import { TOUR_STOPS, tourRoute, tourStops, tourTarget, type TourStop } from './tour'

const SRC = fileURLToPath(new URL('..', import.meta.url))

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return sources(path)
    return /\.tsx?$/.test(entry.name) && !entry.name.endsWith('.test.ts') ? [path] : []
  })
}

const code = sources(SRC).map((file) => readFileSync(file, 'utf8')).join('\n')
const ALL_FEATURES = ['today', 'timer', 'flashcards', 'grammar', 'stories', 'questions', 'docs', 'history', 'board']
const ids = (stops: TourStop[]) => stops.map((s) => s.id)

describe('tour stops', () => {
  it('walks the main parts of the app, from a welcome to a send-off', () => {
    expect(ids(tourStops(ALL_FEATURES))).toEqual(['welcome', 'today', 'flashcards', 'stories', 'timer', 'board', 'history', 'docs', 'ai', 'audio', 'features', 'done'])
  })

  it('leaves out the stops of features that are turned off', () => {
    const stops = ids(tourStops(ALL_FEATURES.filter((f) => f !== 'stories' && f !== 'board')))
    expect(stops).not.toContain('stories')
    expect(stops).not.toContain('board')
    expect(stops).toContain('flashcards')
  })

  it('keeps the welcome, the Settings stops and the send-off with every feature off', () => {
    expect(ids(tourStops([]))).toEqual(['welcome', 'ai', 'audio', 'features', 'done'])
  })

  it('names only features that exist', () => {
    const plugins = [...code.matchAll(/definePlugin\(\{\s*id: '([^']+)'/g)].map((m) => m[1])
    expect(plugins.sort()).toEqual([...ALL_FEATURES].sort())
    for (const stop of TOUR_STOPS) if (stop.feature) expect(ALL_FEATURES).toContain(stop.feature)
  })

  it('gives every stop a unique id, a title and a body', () => {
    expect(new Set(ids(TOUR_STOPS)).size).toBe(TOUR_STOPS.length)
    for (const stop of TOUR_STOPS) {
      expect(stop.title.trim()).not.toBe('')
      expect(stop.body.trim()).not.toBe('')
    }
  })

  it('opens the page of every stop that points at something', () => {
    for (const stop of TOUR_STOPS) if (stop.target) expect(stop.path, stop.id).toMatch(/^\//)
  })

  it('points only at things the pages have', () => {
    for (const stop of TOUR_STOPS) {
      if (!stop.target) continue
      const tag = /^\[data-tour="([^"]+)"\]$/.exec(stop.target)?.[1]
      const id = /^#([\w-]+)$/.exec(stop.target)?.[1]
      expect(tag ?? id, `${stop.id} has an unknown selector ${stop.target}`).toBeTruthy()
      if (tag) expect(code, stop.id).toContain(`data-tour="${tag}"`)
      // Settings cards take their id from a prop or from AI_CONNECTION_ID.
      if (id) expect(code.includes(`id="${id}"`) || code.includes(`'${id}'`), stop.id).toBe(true)
    }
  })

  it('quotes the real practice gaps on the flashcards stop', () => {
    const flashcards = TOUR_STOPS.find((s) => s.id === 'flashcards')!
    expect(flashcards.body).toContain(`back ${PRACTICE_RETURN[1]} cards later`)
    expect(flashcards.body).toContain(`after ${PRACTICE_RETURN[2]}`)
    expect(flashcards.body).toContain(`after ${PRACTICE_RETURN[3]}`)
    expect(flashcards.body).toContain('<svg')
  })

  it('tells the stories stop about several decks and the theme ideas', () => {
    const stories = TOUR_STOPS.find((s) => s.id === 'stories')!
    expect(stories.body).toContain('one, several or all')
    expect(stories.body).toContain(`${STORY_THEMES.length} theme ideas`)
  })

  it('builds the selector for a data-tour name', () => {
    expect(tourTarget('today-goals')).toBe('[data-tour="today-goals"]')
  })
})

describe('tourRoute', () => {
  const stop = (path?: string): TourStop => ({ id: 'x', title: 'X', body: 'x', path })

  it('opens the page of a stop that is elsewhere', () => {
    expect(tourRoute(stop('/stories'), '/')).toBe('/stories')
    expect(tourRoute(stop('/'), '/settings')).toBe('/')
  })

  it('stays when the page is already open', () => {
    expect(tourRoute(stop('/flashcards'), '/flashcards')).toBeUndefined()
    expect(tourRoute(stop('/flashcards'), '/flashcards/')).toBeUndefined()
    expect(tourRoute(stop('/'), '/')).toBeUndefined()
  })

  it('stays for a stop without a page', () => {
    expect(tourRoute(stop(), '/history')).toBeUndefined()
  })
})
