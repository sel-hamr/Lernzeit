import { describe, expect, it } from 'vitest'
import { packFiles, packOptions } from './add-language.ts'

describe('lang:add', () => {
  it('fills in the names and defaults from the code', () => {
    expect(packOptions(['it'])).toEqual({ code: 'it', name: 'Italian', endonym: 'Italiano', speech: 'it', natives: ['en'], levels: ['A1'], rtl: false })
    expect(packOptions(['TR', '--speech', 'tr-TR', '--native', 'en, de', '--levels', 'a2,A1'])).toMatchObject({
      code: 'tr',
      name: 'Turkish',
      speech: 'tr-TR',
      natives: ['en', 'de'],
      levels: ['A1', 'A2'],
    })
    expect(packOptions(['fa', '--rtl', '--name', 'Persian'])).toMatchObject({ name: 'Persian', rtl: true })
  })

  it('says what is wrong with the options', () => {
    expect(() => packOptions([])).toThrow('one language code')
    expect(() => packOptions(['italian'])).toThrow('one language code')
    expect(() => packOptions(['it', 'pt'])).toThrow('one language code')
    expect(() => packOptions(['it', '--native', 'it'])).toThrow('leave its code out')
    expect(() => packOptions(['it', '--native', 'english'])).toThrow('not a language code')
    expect(() => packOptions(['it', '--levels', 'D1'])).toThrow('not a level')
  })

  it('writes the pack files with the right ids, quoting what it must', () => {
    const files = packFiles(packOptions(['it', '--endonym', "L'italiano", '--levels', 'A2,B1']))
    expect(Object.keys(files).sort()).toEqual(['content.ts', 'grammar.ts', 'info.ts', 'texts.ts', 'words.ts'])
    expect(files['info.ts']).toContain("endonym: 'L\\'italiano',")
    expect(files['info.ts']).toContain("levels: ['A2', 'B1'],")
    expect(files['info.ts']).not.toContain('rtl')
    expect(files['words.ts']).toContain("words('it', 'it-words', 'A2', [")
    expect(files['words.ts']).toContain('Meanings are English.')
  })

  it('asks for a meaning in every native language when it is not only English', () => {
    const files = packFiles(packOptions(['ru', '--native', 'de,fr', '--rtl']))
    expect(files['info.ts']).toContain('rtl: true,')
    expect(files['words.ts']).toContain("{ de: 'meaning (de)', fr: 'meaning (fr)' }")
  })
})
