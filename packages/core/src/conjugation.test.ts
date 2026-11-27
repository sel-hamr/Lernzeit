import { describe, expect, it } from 'vitest'
import { cleanConjugation, formsOf, isImpersonal, tenseProblem } from './conjugation'

describe('conjugation tables', () => {
  it('reads six forms in the order ich, du, er, wir, ihr, sie', () => {
    expect(formsOf('fahre, fährst, fährt, fahren, fahrt, fahren')).toEqual([['fahre'], ['fährst'], ['fährt'], ['fahren'], ['fahrt'], ['fahren']])
  })

  it('reads a dash or a blank as a form that is not asked, and a slash as two right spellings', () => {
    expect(formsOf('–, -, regnet, , —, –')).toEqual([undefined, undefined, ['regnet'], undefined, undefined, undefined])
    expect(formsOf('fand, fandest / fandst, fand, fanden, fandet, fanden')?.[1]).toEqual(['fandest', 'fandst'])
  })

  it('reads nothing from a line without exactly six forms', () => {
    expect(formsOf('fahre, fährst, fährt')).toBeUndefined()
    expect(formsOf('')).toBeUndefined()
    expect(formsOf(undefined)).toBeUndefined()
    expect(tenseProblem('fahre, fährst, fährt')).toBe('Needs 6 forms, has 3')
    expect(tenseProblem('fahre, fährst, fährt, fahren, fahrt, fahren')).toBeUndefined()
    expect(tenseProblem('  ')).toBeUndefined()
  })

  it('tidies a table and drops empty tenses', () => {
    expect(cleanConjugation({ present: '  fahre,fährst , fährt,fahren, fahrt,  fahren ', past: ' ', perfect: undefined })).toEqual({
      present: 'fahre, fährst, fährt, fahren, fahrt, fahren',
    })
    expect(cleanConjugation({ past: '' })).toBeUndefined()
    expect(cleanConjugation(undefined)).toBeUndefined()
    // Anything that is not a table of strings is ignored.
    expect(cleanConjugation({ present: 3, future: 'x' })).toBeUndefined()
    expect(cleanConjugation('fahre')).toBeUndefined()
  })

  it('knows a weather verb by its table: only the es form', () => {
    expect(isImpersonal({ present: '–, –, regnet, –, –, –', perfect: '–, –, hat geregnet, –, –, –' })).toBe(true)
    expect(isImpersonal({ present: 'fahre, fährst, fährt, fahren, fahrt, fahren' })).toBe(false)
  })
})
