import type { StarterStory } from '@/data/stories'

export type { StarterStory }

/**
 * An easy A1 story, read toward German. `n` becomes its id (4 → story-0004),
 * which must never change: installing the stories again skips the ids it has.
 */
export function easyStory(n: number, title: string, theme: string, text: string, translation: string): StarterStory {
  return { id: `story-${String(n).padStart(4, '0')}`, title, level: 'A1', topic: 'German', tags: ['starter', theme], text, translation }
}
