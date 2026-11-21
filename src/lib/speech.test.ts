import { describe, expect, it } from 'vitest'
import { shortVoiceName } from './speech'

describe('shortVoiceName', () => {
  it('keeps the name of the voice, without the maker and the language', () => {
    expect(shortVoiceName('Microsoft Katja Online (Natural) - German (Germany)')).toBe('Katja')
    expect(shortVoiceName('Google Deutsch')).toBe('Deutsch')
    expect(shortVoiceName('Anna')).toBe('Anna')
    expect(shortVoiceName('Microsoft Hedda - German (Germany)')).toBe('Hedda')
  })
})
