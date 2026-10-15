/** Link to practise one set, or every question. */
export function practicePath(set?: string): string {
  return set ? `/questions/practice?set=${encodeURIComponent(set)}` : '/questions/practice'
}
