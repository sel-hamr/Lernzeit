/*
 * A small Markdown reader for Docs, so the phone needs no Markdown package: headings, paragraphs,
 * bullet and numbered lists (nested by indent, with task boxes), quotes, fenced code, rules,
 * GitHub tables and pictures, and inline **bold**, *italic*, ~~strike~~, `code` and [links](url).
 * Raw HTML stays as text, as on the web, so pasted text cannot run anything.
 */

export interface Span {
  text: string
  bold?: boolean
  italic?: boolean
  strike?: boolean
  code?: boolean
  /** A link's target, only http(s) and mailto; other links stay as text. */
  href?: string
}

export type MdBlock =
  | { type: 'heading'; level: number; spans: Span[]; text: string }
  | { type: 'paragraph'; spans: Span[] }
  | { type: 'list'; ordered: boolean; items: { depth: number; marker: string; checked?: boolean; spans: Span[] }[] }
  | { type: 'quote'; blocks: MdBlock[] }
  | { type: 'code'; lang: string; text: string }
  | { type: 'rule' }
  | { type: 'table'; header: Span[][]; rows: Span[][][] }
  | { type: 'image'; alt: string; src: string }

type Marks = Omit<Span, 'text'>

const INLINE: { re: RegExp; mark: (m: RegExpExecArray) => { pre?: string; inner?: string; text?: string; marks: Marks } }[] = [
  { re: /`([^`]+)`/, mark: (m) => ({ text: m[1], marks: { code: true } }) },
  { re: /\*\*(.+?)\*\*|__(.+?)__/, mark: (m) => ({ inner: m[1] ?? m[2], marks: { bold: true } }) },
  { re: /~~(.+?)~~/, mark: (m) => ({ inner: m[1], marks: { strike: true } }) },
  { re: /\*(?=\S)(.+?)\*/, mark: (m) => ({ inner: m[1], marks: { italic: true } }) },
  // _italic_ only between words, so snake_case names stay as they are.
  { re: /(^|[\s(])_(?=\S)(.+?)_(?![\p{L}\d])/u, mark: (m) => ({ pre: m[1], inner: m[2], marks: { italic: true } }) },
  { re: /\[([^\]]+)\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/, mark: (m) => ({ inner: m[1], marks: { href: m[2] } }) },
  { re: /\bhttps?:\/\/[^\s<>()]+[^\s<>().,;:!?'"]/, mark: (m) => ({ text: m[0], marks: { href: m[0] } }) },
]

const safeHref = (href?: string) => (href && /^(https?:|mailto:)/i.test(href) ? href : undefined)

/** Inline Markdown to styled spans; neighbours with the same marks are joined. */
export function parseSpans(text: string, marks: Marks = {}): Span[] {
  const out: Span[] = []
  let rest = text
  while (rest) {
    let best: { index: number; length: number; rule: (typeof INLINE)[number]; m: RegExpExecArray } | undefined
    for (const rule of INLINE) {
      const m = rule.re.exec(rest)
      if (m && (!best || m.index < best.index)) best = { index: m.index, length: m[0].length, rule, m }
    }
    if (!best) {
      push(out, { ...marks, text: rest })
      break
    }
    if (best.index) push(out, { ...marks, text: rest.slice(0, best.index) })
    const { pre, inner, text: plain, marks: added } = best.rule.mark(best.m)
    if (pre) push(out, { ...marks, text: pre })
    const merged: Marks = { ...marks, ...added, href: added.href !== undefined ? safeHref(added.href) : marks.href }
    if (inner !== undefined) for (const span of parseSpans(inner, merged)) push(out, span)
    else push(out, { ...merged, text: plain ?? '' })
    rest = rest.slice(best.index + best.length)
  }
  return out
}

function push(out: Span[], span: Span) {
  if (!span.text) return
  const clean = Object.fromEntries(Object.entries(span).filter(([, v]) => v !== undefined && v !== false)) as Span
  const last = out.at(-1)
  const same = (a: Span, b: Span) => ['bold', 'italic', 'strike', 'code', 'href'].every((k) => a[k as keyof Span] === b[k as keyof Span])
  if (last && same(last, clean)) last.text += clean.text
  else out.push(clean)
}

/** A span's plain text. */
export const plainText = (spans: Span[]): string => spans.map((s) => s.text).join('')

const LIST_RE = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/
const TABLE_SEP_RE = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/
const IMAGE_RE = /^!\[([^\]]*)\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)$/

const cells = (line: string) =>
  line
    .trim()
    .replace(/^\||\|$/g, '')
    // An escaped \| is a pipe inside a cell.
    .replace(/\\\|/g, '\u0000')
    .split('|')
    .map((c) => parseSpans(c.trim().split('\u0000').join('|')))

/** Markdown to blocks. */
export function parseMarkdown(body: string): MdBlock[] {
  const lines = body.replace(/\r\n?/g, '\n').split('\n')
  const blocks: MdBlock[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) {
      i++
      continue
    }
    const fence = /^\s*(```|~~~)\s*([\w+-]*)/.exec(line)
    if (fence) {
      const code: string[] = []
      i++
      while (i < lines.length && !lines[i].trim().startsWith(fence[1])) code.push(lines[i++])
      i++
      blocks.push({ type: 'code', lang: fence[2], text: code.join('\n') })
      continue
    }
    const heading = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line)
    if (heading) {
      const spans = parseSpans(heading[2])
      blocks.push({ type: 'heading', level: heading[1].length, spans, text: plainText(spans) })
      i++
      continue
    }
    if (/^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(line)) {
      blocks.push({ type: 'rule' })
      i++
      continue
    }
    const image = IMAGE_RE.exec(line.trim())
    if (image) {
      blocks.push({ type: 'image', alt: image[1], src: image[2] })
      i++
      continue
    }
    if (/^\s*>/.test(line)) {
      const quoted: string[] = []
      while (i < lines.length && /^\s*>/.test(lines[i])) quoted.push(lines[i++].replace(/^\s*>\s?/, ''))
      blocks.push({ type: 'quote', blocks: parseMarkdown(quoted.join('\n')) })
      continue
    }
    if (line.includes('|') && i + 1 < lines.length && TABLE_SEP_RE.test(lines[i + 1])) {
      const header = cells(line)
      i += 2
      const rows: Span[][][] = []
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) rows.push(cells(lines[i++]))
      blocks.push({ type: 'table', header, rows })
      continue
    }
    const first = LIST_RE.exec(line)
    if (first) {
      const ordered = /\d/.test(first[2])
      const items: Extract<MdBlock, { type: 'list' }>['items'] = []
      const base = first[1].length
      while (i < lines.length) {
        const m = LIST_RE.exec(lines[i])
        // A list of the other kind at the same depth starts a new list.
        if (m && m[1].length <= base && /\d/.test(m[2]) !== ordered) break
        if (m) {
          const task = /^\[( |x|X)\]\s+(.*)$/.exec(m[3])
          items.push({ depth: Math.max(0, Math.floor((m[1].length - base) / 2)), marker: /\d/.test(m[2]) ? m[2].replace(')', '.') : '•', ...(task ? { checked: task[1] !== ' ' } : {}), spans: parseSpans(task ? task[2] : m[3]) })
          i++
        } else if (lines[i].trim() && /^\s{2,}/.test(lines[i]) && items.length) {
          // A wrapped line belongs to the item above.
          const last = items[items.length - 1]
          last.spans = [...last.spans, ...parseSpans(` ${lines[i].trim()}`)]
          i++
        } else break
      }
      blocks.push({ type: 'list', ordered, items })
      continue
    }
    const paragraph: string[] = []
    while (i < lines.length && lines[i].trim() && !LIST_RE.test(lines[i]) && !/^\s*(#{1,6}\s|>|```|~~~)/.test(lines[i]) && !IMAGE_RE.test(lines[i].trim())) paragraph.push(lines[i++].trim())
    if (!paragraph.length) paragraph.push(lines[i++].trim())
    blocks.push({ type: 'paragraph', spans: parseSpans(paragraph.join(' ')) })
  }
  return blocks
}

/** The headings, for the contents sheet (three or more make one worth showing). */
export const docHeadings = (blocks: MdBlock[]): { index: number; level: number; text: string }[] =>
  blocks.flatMap((b, index) => (b.type === 'heading' ? [{ index, level: b.level, text: b.text }] : []))
