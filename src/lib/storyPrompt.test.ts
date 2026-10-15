import { describe, expect, it } from 'vitest'
import type { Card } from '@/db/types'
import type { Knowledge } from './reader'
import { buildStoryPrompt, ENOUGH_FAMILIAR, pickPromptWords, storyWordCount } from './storyPrompt'

let order = 0
function card(german: string, extra: Partial<Card> = {}): Card {
  order++
  return { id: german, deckId: 'd', type: 'word', english: german, german, tags: [], createdAt: order, updatedAt: order, ...extra }
}

describe('pickPromptWords', () => {
  const cards = [
    card('Hund', { gender: 'der' }),
    card('gehen'),
    card('der / die / das'),
    card('Guten Morgen!', { type: 'sentence' }),
    card('Katze', { gender: 'die' }),
    card('schön'),
  ]

  it('puts learning words first, then known, then the next new words in deck order', () => {
    const knowledge: Record<string, Knowledge> = { gehen: 'known', Katze: 'learning' }
    expect(pickPromptWords(cards, (id) => knowledge[id])).toEqual({ familiar: ['die Katze', 'gehen'], upcoming: ['der Hund', 'schön'] })
  })

  it('skips sentences and article lists', () => {
    expect(pickPromptWords(cards, () => undefined)).toEqual({ familiar: [], upcoming: ['der Hund', 'gehen', 'die Katze', 'schön'] })
  })

  it('sends every word of a big deck', () => {
    const many = Array.from({ length: 600 }, (_, i) => card(`Wort${i}`))
    const studied = pickPromptWords(many, (id) => (Number(id.slice(4)) < 100 ? 'learning' : 'new'))
    expect([studied.familiar.length, studied.upcoming.length]).toEqual([100, 500])
    expect(pickPromptWords(many, () => 'new').upcoming).toHaveLength(600)
  })
})

describe('buildStoryPrompt', () => {
  /** Enough studied words to build a story from them alone. */
  const studied = Array.from({ length: ENOUGH_FAMILIAR }, (_, i) => `Wort${i}`)
  const words = { familiar: studied, upcoming: ['die Katze'] }

  it('asks for the topic, length and words, then to save the story in Lernzeit', () => {
    const prompt = buildStoryPrompt({ level: 'A1', length: 'short', theme: ' the zoo ', words })
    expect(prompt).toContain('I am learning German at level A1 (beginner).')
    expect(prompt).toContain('- Topic: the zoo.')
    expect(prompt).toContain('- About 60 words, in 3 short paragraphs.')
    expect(prompt).toContain('- Build the story mostly from the words below.\n- Words I know or am learning: Wort0, Wort1')
    expect(prompt).toContain('- You may also use up to 3 of these new words: die Katze.')
    expect(prompt).toContain('Save the story with the Lernzeit create_story tool:\n- title: the German title\n- level: A1\n')
    expect(prompt).toContain('- translation: the English translation, with the same paragraphs')
  })

  it('changes the length, grammar and freedom with the level', () => {
    const a1 = buildStoryPrompt({ level: 'A1', length: 'medium', theme: '', words })
    const b1 = buildStoryPrompt({ level: 'B1', length: 'medium', theme: '', words })
    const c1 = buildStoryPrompt({ level: 'C1', length: 'medium', theme: '', words })
    expect(a1).toContain('About 90 words')
    expect(a1).toContain('Present tense only.')
    expect(b1).toContain('About 250 words')
    expect(b1).toContain('Tell the story in Präteritum')
    expect(b1).toContain('Use as many of the words below as fit naturally.')
    expect(b1).toContain('up to 8 of these new words')
    expect(c1).toContain('About 550 words')
    expect(c1).toContain('Konjunktiv I')
    expect(c1).not.toContain('Present tense only.')
    expect([storyWordCount('A1', 'short'), storyWordCount('A2', 'long'), storyWordCount('C2', 'long')]).toEqual([60, 200, 1000])
  })

  it('uses the whole deck while too few words are studied', () => {
    const few = buildStoryPrompt({ level: 'A1', length: 'short', theme: '', words: { familiar: ['der Nachname'], upcoming: ['der Tee', 'die Milch'] } })
    expect(few).toContain('- Words I know or am learning, to use as often as you can: der Nachname.')
    expect(few).toContain('- More words from my deck: der Tee, die Milch.')
    expect(few).not.toContain('up to 3')

    const none = buildStoryPrompt({ level: 'B1', length: 'short', theme: '', words: { familiar: [], upcoming: ['der Hund'] } })
    expect(none).toContain('- Words from my deck: der Hund.')
    expect(none).toContain('something from everyday life')
    expect(buildStoryPrompt({ level: 'A2', length: 'short', theme: '', words: { familiar: [], upcoming: [] } })).not.toContain('words below')
  })

  it('lists every word it is given', () => {
    const many = { familiar: ['die Wohnung', 'gehen'], upcoming: Array.from({ length: 500 }, (_, i) => `Wort${i}`) }
    const prompt = buildStoryPrompt({ level: 'A2', length: 'long', theme: '', words: many })
    expect(prompt).toContain('Wort0, Wort1')
    expect(prompt).toContain('Wort499.')
  })
})
