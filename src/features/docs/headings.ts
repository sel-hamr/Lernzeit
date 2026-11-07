import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import { unified } from 'unified'

export interface DocHeading {
  level: number
  text: string
  id: string
}

interface MarkdownNode {
  type: string
  depth?: number
  value?: string
  children?: MarkdownNode[]
  data?: { hProperties?: Record<string, unknown> }
}

const textOf = (node: MarkdownNode): string => node.value ?? node.children?.map(textOf).join('') ?? ''

function slugify(text: string): string {
  const slug = text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-')
  return slug || 'section'
}

/** Lists the headings and gives each an id. The reader and the table of contents both run this, so their ids match. */
function collectHeadings(tree: MarkdownNode): DocHeading[] {
  const headings: DocHeading[] = []
  const seen = new Map<string, number>()
  const walk = (node: MarkdownNode) => {
    if (node.type === 'heading') {
      const text = textOf(node)
      const slug = slugify(text)
      const times = seen.get(slug) ?? 0
      seen.set(slug, times + 1)
      const id = times ? `${slug}-${times}` : slug
      node.data = { ...node.data, hProperties: { ...node.data?.hProperties, id } }
      headings.push({ level: node.depth ?? 1, text, id })
    }
    node.children?.forEach(walk)
  }
  walk(tree)
  return headings
}

/** A remark plugin that writes the ids. */
export function remarkHeadingIds() {
  return (tree: unknown) => {
    collectHeadings(tree as MarkdownNode)
  }
}

export function scrollToHeading(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
}

const parser = unified().use(remarkParse).use(remarkGfm)

/** The headings for a table of contents: levels 1 to 3, without a lone top heading that only repeats the title. */
export function docHeadings(body: string): DocHeading[] {
  const all = collectHeadings(parser.parse(body) as MarkdownNode).filter((h) => h.level <= 3)
  return all.filter((h) => h.level === 1).length === 1 ? all.filter((h) => h.level > 1) : all
}
