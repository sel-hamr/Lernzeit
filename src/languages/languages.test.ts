import { describe, expect, it } from 'vitest'
import { exerciseProblem, parseExercise, parseInline, parseRule, wordsOf } from '@/lib/grammar'
import { parseCloze } from '@/lib/german'
import { alignTranslation } from '@/lib/reader'
import { LEVELS, levelSummary, loadPack, PACK as info } from '.'

/* The German pack, checked the way the app will read it. */

const content = await loadPack()

describe('the German pack', () => {
  it('keeps every id unique, so installing never skips an item', () => {
    const ids = [
      ...content.decks.map((d) => `deck ${d.id}`),
      ...content.cards.map((x) => x.id),
      ...content.stories.map((x) => x.id),
      ...content.questions.map((x) => x.id),
      ...content.grammar.flatMap((t) => [t.id, ...t.exercises.map((e) => e.id)]),
    ]
    const seen = new Set<string>()
    const twice = ids.filter((id) => seen.has(id) || !seen.add(id))
    expect(twice).toEqual([])
  })

  it('describes itself: name, voice and levels in order', () => {
    expect(info.name && info.sample).toBeTruthy()
    expect(info.speech).toBe('de-DE')
    expect(info.levels.length).toBeGreaterThan(0)
    expect(info.levels).toEqual(LEVELS.filter((l) => info.levels.includes(l)))
  })

  it('has something to learn at every level it offers, and nothing at others', () => {
    for (const level of info.levels) {
      const summary = levelSummary(content, level)
      expect(Object.values(summary).reduce((a, b) => a + b), level).toBeGreaterThan(0)
    }
    const levels = new Set<string>(info.levels)
    const items = [...content.cards, ...content.stories, ...content.questions, ...content.grammar]
    expect(items.filter((x) => !levels.has(x.level)).map((x) => x.id)).toEqual([])
  })

  it('puts every card in one of its decks', () => {
    const decks = new Set(content.decks.map((d) => d.id))
    expect(content.cards.filter((c) => !decks.has(c.deckId)).map((c) => c.id)).toEqual([])
    for (const c of content.cards) expect(c.text.trim(), c.id).toBeTruthy()
    for (const c of content.cards.filter((x) => x.type === 'cloze')) expect(parseCloze(c.text), c.id).not.toBeNull()
  })

  it('gives stories a translation that lines up paragraph by paragraph', () => {
    for (const s of content.stories) {
      expect(s.title.trim() && s.text.trim(), s.id).toBeTruthy()
      if (s.translation) expect(alignTranslation(s.text, s.translation), s.id).not.toBeNull()
    }
  })

  it('asks questions with a suggested answer and useful words', () => {
    for (const q of content.questions) {
      expect(q.question.trim() && q.set.trim() && q.suggested?.trim(), q.id).toBeTruthy()
      expect(q.words?.length, q.id).toBeGreaterThanOrEqual(3)
    }
  })

  it('writes grammar that parses: rules, examples and every exercise', () => {
    for (const t of content.grammar) {
      expect(t.title.trim() && t.group.trim(), t.id).toBeTruthy()
      expect(t.examples.length, t.id).toBeGreaterThanOrEqual(2)
      expect(t.exercises.length, t.id).toBeGreaterThanOrEqual(5)
      for (const block of parseRule(t.rule)) {
        if (block.type === 'table') for (const row of block.rows) expect(row.length, `${t.id}: ${row.join(' | ')}`).toBe(block.header.length)
        const parts = block.type === 'table' ? [...block.header, ...block.rows.flat()] : block.type === 'list' ? block.items : [block.text]
        for (const text of parts) expect(parseInline(text).some((p) => p.text.includes('*')), `${t.id}: ${text}`).toBe(false)
      }
      for (const e of t.exercises) {
        expect(exerciseProblem(e.text), `${e.id} ${e.text}`).toBeUndefined()
        const form = parseExercise(e.text)!
        if (form.type === 'gap') expect(new Set(form.wrong).size, e.id).toBe(form.wrong.length)
        if (form.type === 'mistake') expect(form.answers, e.id).not.toContain(form.shown)
        if (form.type === 'order') {
          const sorted = (s: string) => wordsOf(s).map((w) => w.toLowerCase()).sort().join(' ')
          for (const other of form.answers) expect(sorted(other), e.id).toBe(sorted(form.answers[0]))
        }
      }
    }
  })
})
