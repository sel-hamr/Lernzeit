import type { PackInfo } from '../types'

/** Modern Standard Arabic, written without vowel marks, as in most texts. Verbs are given in the present: يكتب (he writes). */
export const info: PackInfo = {
  code: 'ar',
  name: 'Arabic',
  endonym: 'العربية',
  speech: 'ar-SA',
  rtl: true,
  sample: 'الكلب يلعب في الحديقة.',
  natives: ['en'],
  levels: ['A1', 'A2'],
}
