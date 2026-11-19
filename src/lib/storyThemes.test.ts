import { describe, expect, it } from 'vitest'
import { FEATURED_THEMES, findThemes, pickTheme, STORY_THEMES, THEME_GROUPS, themeOf } from './storyThemes'

describe('story themes', () => {
  it('has distinct ideas, each a scene of a sentence or two', () => {
    expect(new Set(STORY_THEMES.map((t) => t.name.toLowerCase())).size).toBe(STORY_THEMES.length)
    expect(new Set(STORY_THEMES.map((t) => t.scene)).size).toBe(STORY_THEMES.length)
    for (const { scene } of STORY_THEMES) {
      expect(scene.length).toBeGreaterThan(80)
      expect(scene).toMatch(/\.$/)
    }
  })

  it('has ideas in every group, and features ideas that exist', () => {
    for (const group of THEME_GROUPS) expect(STORY_THEMES.some((t) => t.group === group)).toBe(true)
    expect(FEATURED_THEMES).toHaveLength(8)
    for (const t of FEATURED_THEMES) expect(STORY_THEMES).toContain(t)
  })
})

describe('pickTheme', () => {
  it('picks one scene at a time, and clears it when it is picked again', () => {
    const [first, second] = STORY_THEMES
    expect(pickTheme('', second.scene)).toBe(second.scene)
    expect(pickTheme(first.scene, second.scene)).toBe(second.scene)
    expect(pickTheme('a zoo', second.scene)).toBe(second.scene)
    expect(pickTheme(` ${second.scene} `, second.scene)).toBe('')
  })
})

describe('themeOf', () => {
  it('finds the idea whose scene is the theme', () => {
    const idea = STORY_THEMES[5]
    expect(themeOf(` ${idea.scene}\n`)).toBe(idea)
    expect(themeOf('a story about my cat')).toBeUndefined()
    expect(themeOf('')).toBeUndefined()
  })
})

describe('findThemes', () => {
  it('finds every idea without a query or group', () => {
    expect(findThemes('')).toEqual(STORY_THEMES)
  })

  it('searches names and scenes, ignoring case and accents', () => {
    expect(findThemes('CAFE').map((t) => t.name)).toContain('At the café')
    expect(findThemes('passport security suitcase').map((t) => t.name)).toEqual([])
    expect(findThemes('suitcase security').map((t) => t.name)).toEqual(['At the airport'])
  })

  it('keeps to one group', () => {
    const health = findThemes('', 'Health')
    expect(health.length).toBeGreaterThan(0)
    expect(health.every((t) => t.group === 'Health')).toBe(true)
    expect(findThemes('train', 'Health')).toEqual([])
  })
})
