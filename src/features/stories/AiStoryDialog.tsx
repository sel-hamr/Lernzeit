import { useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import clsx from 'clsx'
import { Check, Copy } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Field, Input, Segmented, Select, Textarea } from '@/components/ui/form'
import { useFeedback } from '@/components/ui/feedback'
import { AI_TAG } from '@/bridge/actions'
import { useBridgeIndicator } from '@/bridge/status'
import { useDecks, useLanguage, useLearningText, useStories } from '@/data/hooks'
import { STORY_LEVELS } from '@/data/stories'
import type { StoryLevel } from '@/db/types'
import { AI_CONNECTION_ID } from '@/features/settings/AiConnectionGroup'
import { storage } from '@/lib/browser'
import { buildStoryPrompt, pickPromptWords, storyWordCount, type PromptWords, type StoryLength } from '@/lib/storyPrompt'
import { count } from '@/lib/text'
import { useVocabulary } from './vocabulary'

const LENGTHS: { value: StoryLength; label: string }[] = [
  { value: 'short', label: 'Short' },
  { value: 'medium', label: 'Medium' },
  { value: 'long', label: 'Long' },
]
const ALL_DECKS = 'all'
const DECK_KEY = 'lernzeit-ai-story-deck'

/**
 * Asks Claude Desktop or Claude Code for a story from a deck's words. The AI
 * connection cannot read cards, so the words go in a prompt you paste there;
 * Claude saves the story here with create_story.
 */
export function AiStoryDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="Write a story with AI" description="Claude writes a story with your deck's words and saves it here through the AI connection." size="lg">
      {open && <AiStoryForm onClose={onClose} />}
    </Dialog>
  )
}

function wordsSummary(words: PromptWords, deckName: string): string {
  const total = words.familiar.length + words.upcoming.length
  if (!total) return `${deckName} has no words yet, so Claude uses everyday words.`
  const all = `The prompt has all ${count(total, 'word')} of ${deckName}`
  if (!words.familiar.length) return `${all}. None are studied yet; study a few to make the stories easier.`
  return `${all}: ${words.familiar.length} you know or are learning, and ${words.upcoming.length} new.`
}

/** Whether Claude can reach this browser; the story cannot arrive otherwise. */
function ConnectionNote() {
  const ai = useBridgeIndicator()
  const ready = ai?.status === 'connected' || ai?.status === 'standby'
  if (ready) {
    return (
      <p className="flex items-center gap-2 text-small text-sage-ink">
        <span className="size-2 rounded-full bg-sage-dot" aria-hidden />
        The AI connection is on. Claude can save the story here.
      </p>
    )
  }
  return (
    <div className="flex flex-col gap-1 rounded-row border border-line bg-soft px-4 py-3 text-small">
      <span className="font-medium">{ai ? `AI connection: ${ai.label}` : 'Turn on the AI connection first'}</span>
      <span className="text-muted">
        {ai?.hint ?? 'It lets Claude Desktop or Claude Code save the story in this browser.'}{' '}
        <Link to={`/settings#${AI_CONNECTION_ID}`} className="text-sage-ink underline-offset-2 hover:underline">
          Open AI connection settings
        </Link>
      </span>
    </div>
  )
}

function Step({ n, done, children }: { n: number; done?: boolean; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span
        aria-hidden
        className={clsx(
          'flex size-6 shrink-0 items-center justify-center rounded-full text-chip font-semibold',
          done ? 'bg-sage-dot text-on-dark' : 'bg-field text-ink-2',
        )}
      >
        {done ? <Check size={13} strokeWidth={2.5} /> : n}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-2 pt-0.5 text-body">{children}</div>
    </li>
  )
}

function AiStoryForm({ onClose }: { onClose: () => void }) {
  const learning = useLearningText()
  const language = useLanguage()
  const decks = useDecks()
  const vocabulary = useVocabulary()
  const stories = useStories()
  const navigate = useNavigate()
  const { toast } = useFeedback()
  const [openedAt] = useState(() => Date.now())
  const [deckId, setDeckId] = useState(() => storage.get(DECK_KEY) ?? ALL_DECKS)
  const [level, setLevel] = useState<StoryLevel>('A1')
  const [length, setLength] = useState<StoryLength>('short')
  const [theme, setTheme] = useState('')
  const [copied, setCopied] = useState(false)

  const deck = decks.find((d) => d.id === deckId)
  const words = useMemo(() => {
    const cards = [...vocabulary.cards.values()].filter((c) => !deck || c.deckId === deck.id)
    return pickPromptWords(cards, (id) => vocabulary.knowledge.get(id))
  }, [vocabulary, deck])
  const prompt = buildStoryPrompt({ level, length, theme, words, language: { code: language.code, name: language.name, native: language.native.name } })
  // The story Claude saved while this dialog was open.
  const arrived = stories?.find((s) => s.createdAt >= openedAt && s.tags.includes(AI_TAG))

  const pickDeck = (id: string) => {
    setDeckId(id)
    storage.set(DECK_KEY, id)
  }

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(prompt)
      setCopied(true)
      toast('Prompt copied. Paste it into Claude Desktop.')
    } catch {
      toast('Could not copy. Open “See the prompt” and copy it from there.', { tone: 'error' })
    }
  }

  return (
    <div className="flex flex-col gap-5 pb-1">
      <ConnectionNote />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Words from" htmlFor="ai-deck">
          <Select id="ai-deck" value={deck ? deck.id : ALL_DECKS} onChange={(e) => pickDeck(e.target.value)}>
            <option value={ALL_DECKS}>All decks</option>
            {decks.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Level" htmlFor="ai-level">
          <Select id="ai-level" value={level} onChange={(e) => setLevel(e.target.value as StoryLevel)}>
            {STORY_LEVELS.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Theme (optional)" htmlFor="ai-theme">
          <Input id="ai-theme" value={theme} onChange={(e) => setTheme(e.target.value)} placeholder="a day at the market" autoComplete="off" />
        </Field>
        <div className="flex flex-col gap-1.5">
          <span className="text-small font-medium text-ink-2">Length in words</span>
          {/* The level sets how long each length is: a short A1 story has 60 words, a short B1 story 150. */}
          <Segmented label="Length" options={LENGTHS.map((l) => ({ ...l, count: storyWordCount(level, l.value) }))} value={length} onChange={setLength} />
        </div>
      </div>
      <p className="text-small text-muted">{vocabulary.loaded ? wordsSummary(words, deck?.name ?? 'your decks') : null}</p>

      <ol className="flex flex-col gap-4 border-t border-line pt-5">
        <Step n={1} done={copied}>
          <span>Copy the prompt.</span>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary" icon={<Copy size={15} strokeWidth={1.8} />} onClick={() => void copyPrompt()}>
              Copy prompt
            </Button>
            <details className="min-w-0 flex-1">
              <summary className="cursor-pointer text-small text-sage-ink hover:text-ink">See the prompt</summary>
              <Textarea readOnly rows={10} value={prompt} aria-label="Prompt" className="mt-2 text-small" />
            </details>
          </div>
        </Step>
        <Step n={2}>Paste it into Claude Desktop or Claude Code, and send it.</Step>
        <Step n={3} done={!!arrived}>
          {arrived ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span>
                <span {...learning} className="font-medium">
                  {arrived.title}
                </span>{' '}
                is here.
              </span>
              <Button
                variant="primary"
                onClick={() => {
                  onClose()
                  navigate(`/stories/${arrived.id}`)
                }}
              >
                Read it
              </Button>
            </div>
          ) : (
            <span className="text-muted">Claude writes the story and saves it here. You see it in this step as soon as it is saved.</span>
          )}
        </Step>
      </ol>
    </div>
  )
}
