import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { PRACTICE_RETURN } from './queue'
import { STORY_THEMES } from './storyThemes'
import { TOUR_STOPS, tourRoute, tourStops, tourTarget, type TourFacts, type TourStop } from './tour'

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
const EVERYTHING: TourFacts = { cards: true, story: 'story-1', recall: true, wide: true }
const NOTHING: TourFacts = { cards: false, recall: true, wide: true }
const ids = (stops: TourStop[]) => stops.map((s) => s.id)
const stop = (id: string) => TOUR_STOPS.find((s) => s.id === id)!

describe('tour stops', () => {
  it('walks every part of the app, from a welcome to a send-off', () => {
    expect(ids(tourStops(ALL_FEATURES, EVERYTHING))).toEqual([
      'welcome', 'today', 'decks', 'flashcards', 'practice-card', 'practice-rate', 'stories', 'story-card', 'reader', 'word-note', 'word-card',
      'timer', 'board', 'history', 'docs', 'ai', 'audio', 'features', 'done',
    ])
  })

  it('leaves out practice without cards, and reading without a story', () => {
    const stops = ids(tourStops(ALL_FEATURES, NOTHING))
    for (const id of ['practice-card', 'practice-rate', 'story-card', 'reader', 'word-note', 'word-card']) expect(stops).not.toContain(id)
    expect(stops).toContain('flashcards')
    expect(stops).toContain('stories')
  })

  it('leaves out the practice screen when practice asks you to type', () => {
    const stops = ids(tourStops(ALL_FEATURES, { ...EVERYTHING, recall: false }))
    expect(stops).not.toContain('practice-card')
    expect(stops).not.toContain('practice-rate')
  })

  it('shows the word card beside the story only where the reader has room for it', () => {
    const stops = ids(tourStops(ALL_FEATURES, { ...EVERYTHING, wide: false }))
    expect(stops).toContain('word-note')
    expect(stops).not.toContain('word-card')
  })

  it('opens and points at the story it picked', () => {
    const stops = tourStops(ALL_FEATURES, EVERYTHING)
    expect(stops.find((s) => s.id === 'story-card')?.target).toBe('a[href="/stories/story-1"]')
    expect(stops.find((s) => s.id === 'reader')?.path).toBe('/stories/story-1')
    for (const s of stops) expect(`${s.path ?? ''} ${s.target ?? ''}`).not.toContain(':story')
  })

  it('leaves out the stops of features that are turned off', () => {
    const stops = ids(tourStops(ALL_FEATURES.filter((f) => f !== 'stories' && f !== 'board'), EVERYTHING))
    for (const id of ['stories', 'story-card', 'reader', 'word-note', 'word-card', 'board']) expect(stops).not.toContain(id)
    expect(stops).toContain('practice-rate')
  })

  it('keeps the welcome, the Settings stops and the send-off with every feature off', () => {
    expect(ids(tourStops([], EVERYTHING))).toEqual(['welcome', 'ai', 'audio', 'features', 'done'])
  })

  it('names only features that exist', () => {
    const plugins = [...code.matchAll(/definePlugin\(\{\s*id: '([^']+)'/g)].map((m) => m[1])
    expect(plugins.sort()).toEqual([...ALL_FEATURES].sort())
    for (const s of TOUR_STOPS) if (s.feature) expect(ALL_FEATURES).toContain(s.feature)
  })

  it('gives every stop a unique id, a title and a body', () => {
    expect(new Set(ids(TOUR_STOPS)).size).toBe(TOUR_STOPS.length)
    for (const s of TOUR_STOPS) {
      expect(s.title.trim()).not.toBe('')
      expect(s.body.trim()).not.toBe('')
    }
  })

  it('opens the page of every stop that points at something or acts on a page', () => {
    for (const s of TOUR_STOPS) if (s.target || s.prepare) expect(s.path, s.id).toMatch(/^\//)
  })

  it('points only at things the pages have', () => {
    for (const s of TOUR_STOPS) {
      if (!s.target) continue
      const tag = /^\[data-tour="([^"]+)"\]$/.exec(s.target)?.[1]
      const id = /^#([\w-]+)$/.exec(s.target)?.[1]
      const attribute = /^\[(data-[\w-]+)\]$/.exec(s.target)?.[1]
      const storyLink = s.target === 'a[href="/stories/:story"]'
      expect(tag ?? id ?? attribute ?? storyLink, `${s.id} has an unknown selector ${s.target}`).toBeTruthy()
      if (tag) expect(code, s.id).toContain(`data-tour="${tag}"`)
      // Settings cards take their id from a prop or from AI_CONNECTION_ID.
      if (id) expect(code.includes(`id="${id}"`) || code.includes(`'${id}'`), s.id).toBe(true)
      if (attribute) expect(code, s.id).toContain(attribute)
      if (storyLink) expect(code).toContain('to={`/stories/${story.id}`}')
    }
  })

  it('has the buttons and words its page actions press', () => {
    for (const name of ['practice-show', 'practice-rate']) expect(code).toContain(`data-tour="${name}"`)
    expect(code).toContain('data-noted=')
  })

  it('quotes the real practice gaps on the rating stop', () => {
    const body = stop('practice-rate').body
    expect(body).toContain(`back ${PRACTICE_RETURN[1]} cards later`)
    expect(body).toContain(`after ${PRACTICE_RETURN[2]}`)
    expect(body).toContain(`after ${PRACTICE_RETURN[3]}`)
    expect(stop('flashcards').body).toContain('<svg')
  })

  it('tells the stories stop about several decks and the theme ideas', () => {
    const body = stop('stories').body
    expect(body).toContain('one, several or all')
    expect(body).toContain(`${STORY_THEMES.length} theme ideas`)
  })

  it('builds the selector for a data-tour name', () => {
    expect(tourTarget('today-goals')).toBe('[data-tour="today-goals"]')
  })
})

describe('tourRoute', () => {
  const at = (path?: string): TourStop => ({ id: 'x', title: 'X', body: 'x', path })

  it('opens the page of a stop that is elsewhere', () => {
    expect(tourRoute(at('/stories'), '/')).toBe('/stories')
    expect(tourRoute(at('/'), '/settings')).toBe('/')
    expect(tourRoute(at('/flashcards/review?cards=all'), '/flashcards')).toBe('/flashcards/review?cards=all')
  })

  it('stays when the page is already open', () => {
    expect(tourRoute(at('/flashcards'), '/flashcards')).toBeUndefined()
    expect(tourRoute(at('/flashcards'), '/flashcards/')).toBeUndefined()
    expect(tourRoute(at('/'), '/')).toBeUndefined()
    // The practice screen keeps its round: the next stop on it does not reload it.
    expect(tourRoute(at('/flashcards/review?cards=all'), '/flashcards/review')).toBeUndefined()
  })

  it('stays for a stop without a page', () => {
    expect(tourRoute(at(), '/history')).toBeUndefined()
  })
})
