import { describe, expect, it } from 'vitest'
import { exerciseProblem, parseExercise, parseInline, parseRule, wordsOf } from '@/lib/grammar'
import { parseCloze } from '@/lib/german'
import { alignTranslation } from '@/lib/reader'
import { hasText, LEVELS, levelSummary, loadPack, localize, PACKS, type PackContent, type Text } from '.'

/*
 * Every pack, checked the way the app will read it. A pack added with
 * `npm run lang:add` is checked here too, so `npm test` says what is missing.
 */

const folders = Object.keys(import.meta.glob('./*/info.ts')).map((path) => path.split('/')[1])
const contents = new Map<string, PackContent>(await Promise.all(PACKS.map(async (p) => [p.code, await loadPack(p.code)] as const)))

/** Every Text in a pack with where it is, for messages. */
function texts(content: PackContent): [where: string, text: Text][] {
  return [
    ...content.cards.flatMap((c): [string, Text][] => [[c.id, c.meaning], ...(c.exampleMeaning ? [[`${c.id} example`, c.exampleMeaning] as [string, Text]] : [])]),
    ...content.stories.flatMap((s): [string, Text][] => (s.translation ? [[s.id, s.translation]] : [])),
    ...content.questions.flatMap((q): [string, Text][] => (q.meaning ? [[q.id, q.meaning]] : [])),
    ...content.grammar.flatMap((t): [string, Text][] => [
      [`${t.id} rule`, t.rule],
      ...(t.meaning ? [[`${t.id} title`, t.meaning] as [string, Text]] : []),
      ...(t.summary ? [[`${t.id} summary`, t.summary] as [string, Text]] : []),
      ...t.examples.flatMap((e): [string, Text][] => (e.meaning ? [[`${t.id} ${e.text}`, e.meaning]] : [])),
      ...t.exercises.flatMap((e): [string, Text][] => [...(e.meaning ? [[e.id, e.meaning] as [string, Text]] : []), ...(e.why ? [[`${e.id} why`, e.why] as [string, Text]] : [])]),
    ]),
  ]
}

describe('language packs', () => {
  it('finds a pack in every folder, named after its code', () => {
    expect(PACKS.map((p) => p.code).sort()).toEqual(folders.sort())
    expect(PACKS.map((p) => p.code)).toEqual(expect.arrayContaining(['ar', 'de', 'en', 'es', 'fr']))
  })

  it('keeps every id unique across all packs, so installing one never skips another', () => {
    const ids = [...contents.values()].flatMap((c) => [
      ...c.decks.map((d) => `deck ${d.id}`),
      ...c.cards.map((x) => x.id),
      ...c.stories.map((x) => x.id),
      ...c.questions.map((x) => x.id),
      ...c.grammar.flatMap((t) => [t.id, ...t.exercises.map((e) => e.id)]),
    ])
    const seen = new Set<string>()
    const twice = ids.filter((id) => seen.has(id) || !seen.add(id))
    expect(twice).toEqual([])
  })

  describe.each(PACKS.map((p) => [p.name, p] as const))('%s', (_, info) => {
    const content = contents.get(info.code)!

    it('describes itself: names, voice, natives and levels in order', () => {
      expect(info.name && info.endonym && info.sample).toBeTruthy()
      expect(info.speech.split('-')[0]).toBe(info.code)
      expect(info.natives.length).toBeGreaterThan(0)
      expect(info.natives).not.toContain(info.code)
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

    it('writes every meaning and explanation in each native language it offers', () => {
      for (const native of info.natives) {
        const missing = texts(content).filter(([, text]) => !hasText(text, native)).map(([where]) => where)
        expect(missing, `not in ${native}`).toEqual([])
      }
    })

    it('gives stories a translation that lines up paragraph by paragraph', () => {
      for (const s of content.stories) {
        expect(s.title.trim() && s.text.trim(), s.id).toBeTruthy()
        for (const native of info.natives) {
          if (s.translation) expect(alignTranslation(s.text, localize(s.translation, native)), `${s.id} in ${native}`).not.toBeNull()
        }
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
        for (const native of info.natives) {
          for (const block of parseRule(localize(t.rule, native)!)) {
            if (block.type === 'table') for (const row of block.rows) expect(row.length, `${t.id} ${native}: ${row.join(' | ')}`).toBe(block.header.length)
            const parts = block.type === 'table' ? [...block.header, ...block.rows.flat()] : block.type === 'list' ? block.items : [block.text]
            for (const text of parts) expect(parseInline(text).some((p) => p.text.includes('*')), `${t.id} ${native}: ${text}`).toBe(false)
          }
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
})

describe('localize', () => {
  it('reads a plain string as English and a map by native language', () => {
    expect(localize('dog', 'en')).toBe('dog')
    expect(localize({ ar: 'كلب', fr: 'chien' }, 'fr')).toBe('chien')
    // A missing language falls back to English, then to any.
    expect(localize({ en: 'dog', fr: 'chien' }, 'es')).toBe('dog')
    expect(localize({ fr: 'chien' }, 'es')).toBe('chien')
    expect(hasText('dog', 'en')).toBe(true)
    expect(hasText('dog', 'fr')).toBe(false)
    expect(hasText({ fr: ' ' }, 'fr')).toBe(false)
  })
})
