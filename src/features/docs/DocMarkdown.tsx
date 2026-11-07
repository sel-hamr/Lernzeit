import { memo, useRef, useState, type ComponentProps } from 'react'
import Markdown, { defaultUrlTransform, type Components, type UrlTransform } from 'react-markdown'
import clsx from 'clsx'
import rehypeHighlight from 'rehype-highlight'
import remarkGfm from 'remark-gfm'
import { Check, Copy } from 'lucide-react'
import { useFeedback } from '@/components/ui/feedback'
import { useImage } from '@/data/hooks'
import { docImageId } from '@/lib/docs'
import { remarkHeadingIds, scrollToHeading } from './headings'

const REMARK_PLUGINS = [remarkGfm, remarkHeadingIds]
const REHYPE_PLUGINS = [rehypeHighlight]

/** Only a picture may use the app's own image: links. The rest follow the same safe rules as GitHub. */
const docUrl: UrlTransform = (url, key) => (key === 'src' && docImageId(url) ? url : defaultUrlTransform(url))

function hashTarget(hash: string): string {
  try {
    return decodeURIComponent(hash.slice(1))
  } catch {
    return hash.slice(1)
  }
}

function DocLink({ href, title, id, children }: ComponentProps<'a'>) {
  if (href?.startsWith('#')) {
    return (
      <a
        id={id}
        href={href}
        title={title}
        onClick={(e) => {
          e.preventDefault()
          scrollToHeading(hashTarget(href))
        }}
      >
        {children}
      </a>
    )
  }
  // A link to another file of a repository leads nowhere here, so it stays as text.
  if (!href || !/^(https?:|mailto:)/i.test(href)) return <span title={href}>{children}</span>
  return (
    <a id={id} href={href} title={title} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  )
}

function StoredImage({ id, alt, title }: { id: string; alt?: string; title?: string }) {
  const { url } = useImage(id)
  return url ? <img src={url} alt={alt ?? ''} title={title} /> : <span className="text-muted">{alt || 'Image'}</span>
}

function DocImage({ src, alt, title }: ComponentProps<'img'>) {
  const stored = docImageId(typeof src === 'string' ? src : undefined)
  if (stored) return <StoredImage id={stored} alt={alt} title={title} />
  return <img src={src} alt={alt ?? ''} title={title} loading="lazy" referrerPolicy="no-referrer" />
}

function CodeBlock({ children }: ComponentProps<'pre'>) {
  const ref = useRef<HTMLPreElement>(null)
  const [copied, setCopied] = useState(false)
  const { toast } = useFeedback()
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(ref.current?.textContent ?? '')
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast('Could not copy the code', { tone: 'error' })
    }
  }
  return (
    <div className="doc-code">
      <button type="button" className="doc-code-copy" aria-label="Copy code" title="Copy code" onClick={() => void copy()}>
        {copied ? <Check size={14} strokeWidth={2} /> : <Copy size={14} strokeWidth={1.8} />}
      </button>
      <pre ref={ref} dir="ltr">
        {children}
      </pre>
    </div>
  )
}

function DocTable({ children }: ComponentProps<'table'>) {
  return (
    <div className="doc-table">
      <table>{children}</table>
    </div>
  )
}

const COMPONENTS: Components = { a: DocLink, img: DocImage, pre: CodeBlock, table: DocTable }

/** Markdown shown like a GitHub README. Raw HTML in the text is not rendered, so pasted text cannot run code. */
export const DocMarkdown = memo(function DocMarkdown({ body, hideTitle }: { body: string; hideTitle?: boolean }) {
  return (
    <div className={clsx('doc-prose', hideTitle && 'doc-prose-no-title')}>
      <Markdown remarkPlugins={REMARK_PLUGINS} rehypePlugins={REHYPE_PLUGINS} urlTransform={docUrl} components={COMPONENTS}>
        {body}
      </Markdown>
    </div>
  )
})
