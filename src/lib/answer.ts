/**
 * Typed-answer checking. Accepts small slips (case, ue for ü, a missing
 * umlaut, ss for ß, punctuation) but always reports the exact spelling.
 */

export type Verdict = 'exact' | 'close' | 'wrong'

export interface CheckResult {
  verdict: Verdict
  /** Why a "close" answer was not exact, for a short hint. */
  notes: string[]
  /** Letter-by-letter comparison of what was typed against the answer. */
  diff: DiffPart[]
}

export type DiffPart = { text: string; kind: 'ok' | 'wrong' | 'missing' | 'extra' }

const ARTICLES = new Set(['der', 'die', 'das'])

function tidy(s: string): string {
  return s
    .normalize('NFC')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

/** Drops punctuation that never changes meaning for this purpose. */
function stripPunct(s: string): string {
  return s.replace(/[.,!?;:"„“”«»()]/g, '').replace(/\s+/g, ' ').trim()
}

function transliterate(s: string): string {
  return s.replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
}

function dropUmlauts(s: string): string {
  return s.replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ß/g, 'ss')
}

/** ae/oe/ue typed for an umlaut, folded down to plain vowels. */
function foldTyped(s: string): string {
  return dropUmlauts(s).replace(/ae/g, 'a').replace(/oe/g, 'o').replace(/ue/g, 'u')
}

function splitLeadingArticle(s: string): { article?: string; rest: string } {
  const [first, ...rest] = s.split(' ')
  if (rest.length && ARTICLES.has(first.toLowerCase())) return { article: first.toLowerCase(), rest: rest.join(' ') }
  return { rest: s }
}

export function checkAnswer(typed: string, expected: string): CheckResult {
  const input = tidy(typed)
  const target = tidy(expected)
  const diff = diffChars(input, target)

  if (!input) return { verdict: 'wrong', notes: [], diff }
  if (stripPunct(input) === stripPunct(target)) return { verdict: 'exact', notes: [], diff }

  const notes: string[] = []
  let a = stripPunct(input)
  let b = stripPunct(target)

  // Articles: a wrong article is a real mistake, a missing one is a slip.
  const ia = splitLeadingArticle(a)
  const ib = splitLeadingArticle(b)
  if (ib.article) {
    if (ia.article && ia.article !== ib.article) {
      return { verdict: 'wrong', notes: [`The article is "${ib.article}"`], diff }
    }
    if (!ia.article) notes.push(`Remember the article: ${ib.article}`)
    a = ia.rest
    b = ib.rest
  }

  if (a === b) return { verdict: 'close', notes, diff }

  const al = a.toLowerCase()
  const bl = b.toLowerCase()
  if (al === bl) return { verdict: 'close', notes: [...notes, 'Check the capital letters'], diff }

  if (transliterate(al) === transliterate(bl)) {
    return { verdict: 'close', notes: [...notes, 'Write umlauts as ä, ö, ü and ß'], diff }
  }
  if (foldTyped(al) === foldTyped(bl)) {
    return { verdict: 'close', notes: [...notes, 'Watch the umlauts'], diff }
  }

  return { verdict: 'wrong', notes: [], diff }
}

/**
 * Levenshtein alignment of typed text against the answer, merged into runs.
 * "wrong" = typed letter that should be another, "missing" = a letter of the
 * answer that was not typed, "extra" = typed letter that should not be there.
 */
export function diffChars(typed: string, expected: string): DiffPart[] {
  const a = [...typed]
  const b = [...expected]
  const n = a.length
  const m = b.length
  const eq = (x: string, y: string) => x.toLowerCase() === y.toLowerCase()
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  for (let i = 0; i <= n; i++) dp[i][0] = i
  for (let j = 0; j <= m; j++) dp[0][j] = j
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j - 1] + (eq(a[i - 1], b[j - 1]) ? 0 : 1),
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
      )
    }
  }

  const parts: DiffPart[] = []
  const push = (text: string, kind: DiffPart['kind']) => {
    const last = parts[parts.length - 1]
    if (last && last.kind === kind) last.text = text + last.text
    else parts.push({ text, kind })
  }

  let i = n
  let j = m
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && dp[i][j] === dp[i - 1][j - 1] + (eq(a[i - 1], b[j - 1]) ? 0 : 1)) {
      push(a[i - 1], eq(a[i - 1], b[j - 1]) ? 'ok' : 'wrong')
      i--
      j--
    } else if (i > 0 && dp[i][j] === dp[i - 1][j] + 1) {
      push(a[i - 1], 'extra')
      i--
    } else {
      push(b[j - 1], 'missing')
      j--
    }
  }
  return parts.reverse()
}
