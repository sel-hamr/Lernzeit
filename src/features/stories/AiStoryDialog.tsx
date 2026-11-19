import { useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import clsx from 'clsx'
import { Check, ChevronDown, ChevronRight, Copy } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Field, Segmented, Select, Textarea } from '@/components/ui/form'
import { useFeedback } from '@/components/ui/feedback'
import { AI_TAG } from '@/bridge/actions'
import { useBridgeIndicator } from '@/bridge/status'
import { useDecks, useLearningText, useStories } from '@/data/hooks'
import { STORY_LEVELS } from '@/data/stories'
import type { StoryLevel } from '@/db/types'
import { AI_CONNECTION_ID } from '@/features/settings/AiConnectionGroup'
import { DeckPicker } from '@/features/flashcards/DeckPicker'
import { storage } from '@/lib/browser'
import { parseDeckIds } from '@/lib/deckPick'
import { buildStoryPrompt, isPromptWord, pickPromptWords, storyWordCount, type StoryLength } from '@/lib/storyPrompt'
import { FEATURED_THEMES, pickTheme, STORY_THEMES, themeOf } from '@/lib/storyThemes'
import { ThemeIdeasDialog } from './ThemeIdeasDialog'
import { useVocabulary } from './vocabulary'

const LENGTHS: { value: StoryLength; label: string }[] = [
  { value: 'short', label: 'Short' },
  { value: 'medium', label: 'Medium' },
  { value: 'long', label: 'Long' },
]
/** The chosen deck ids as a JSON list; before several decks could be chosen it held one id. */
const DECKS_KEY = 'lernzeit-ai-story-deck'

/**
 * Asks Claude Desktop or Claude Code for a story from the words of the decks
 * you choose, or all of them. The AI
 * connection cannot read cards, so the words go in a prompt you paste there;
 * Claude saves the story here with create_story.
 */
export function AiStoryDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="Write a story with AI" description="Claude writes a story with the words of the decks you choose and saves it here through the AI connection." size="lg">
      {open && <AiStoryForm onClose={onClose} />}
    </Dialog>
  )
}

const ideaClass = (on: boolean) =>
  clsx(
    'h-7 rounded-full border px-2.5 text-chip font-medium transition-colors',
    on ? 'border-sage-border bg-sage text-sage-ink' : 'border-line bg-main text-ink-2 hover:border-line-strong hover:text-ink',
  )

/**
 * Theme ideas under the theme box, and "More themes" for all of them. An idea
 * puts its scene in the box (one idea at a time, and you can still edit it); a
 * second click clears it. An idea picked from the popup shows here too.
 */
function ThemeIdeas({ theme, onChange }: { theme: string; onChange: (theme: string) => void }) {
  const [moreOpen, setMoreOpen] = useState(false)
  const picked = themeOf(theme)
  const ideas = picked && !FEATURED_THEMES.includes(picked) ? [...FEATURED_THEMES, picked] : FEATURED_THEMES
  return (
    <div role="group" aria-label="Theme ideas" className="flex flex-wrap gap-1.5 pt-1">
      {ideas.map((idea) => (
        <button key={idea.name} type="button" aria-pressed={idea === picked} title={idea.scene} onClick={() => onChange(pickTheme(theme, idea.scene))} className={ideaClass(idea === picked)}>
          {idea.name}
        </button>
      ))}
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => setMoreOpen(true)}
        className="flex h-7 items-center gap-0.5 rounded-full px-2 text-chip font-medium text-sage-ink transition-colors hover:bg-sage/60"
      >
        {STORY_THEMES.length - FEATURED_THEMES.length} more themes
        <ChevronRight size={13} strokeWidth={2} aria-hidden />
      </button>
      <ThemeIdeasDialog open={moreOpen} onClose={() => setMoreOpen(false)} theme={theme} onPick={onChange} />
    </div>
  )
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
  const decks = useDecks()
  const vocabulary = useVocabulary()
  const stories = useStories()
  const navigate = useNavigate()
  const { toast } = useFeedback()
  const [openedAt] = useState(() => Date.now())
  const [deckIds, setDeckIds] = useState(() => parseDeckIds(storage.get(DECKS_KEY)))
  const [level, setLevel] = useState<StoryLevel>('A1')
  const [length, setLength] = useState<StoryLength>('short')
  const [theme, setTheme] = useState('')
  const [copied, setCopied] = useState(false)
  const [showPrompt, setShowPrompt] = useState(false)

  // Decks deleted since they were chosen drop out; none left means all decks.
  const chosen = useMemo(() => decks.filter((d) => deckIds.includes(d.id)), [decks, deckIds])
  const words = useMemo(() => {
    const ids = new Set(chosen.map((d) => d.id))
    const cards = [...vocabulary.cards.values()].filter((c) => !ids.size || ids.has(c.deckId))
    return pickPromptWords(cards, (id) => vocabulary.knowledge.get(id))
  }, [vocabulary, chosen])
  const deckOptions = useMemo(() => {
    const perDeck = new Map<string, number>()
    for (const card of vocabulary.cards.values()) if (isPromptWord(card)) perDeck.set(card.deckId, (perDeck.get(card.deckId) ?? 0) + 1)
    return decks.map((d) => ({ value: d.id, label: d.name, count: perDeck.get(d.id) ?? 0 }))
  }, [vocabulary, decks])
  const prompt = buildStoryPrompt({ level, length, theme, words })
  // The story Claude saved while this dialog was open.
  const arrived = stories?.find((s) => s.createdAt >= openedAt && s.tags.includes(AI_TAG))

  const pickDecks = (ids: string[]) => {
    setDeckIds(ids)
    storage.set(DECKS_KEY, JSON.stringify(ids))
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
        <Field label="Words from" htmlFor="ai-deck" className="sm:col-span-2">
          <DeckPicker id="ai-deck" decks={deckOptions} value={chosen.map((d) => d.id)} onChange={pickDecks} unit="word" />
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
        <div className="flex flex-col gap-1.5">
          <span className="text-small font-medium text-ink-2">Length in words</span>
          {/* The level sets how long each length is: a short A1 story has 60 words, a short B1 story 150. */}
          <Segmented label="Length" options={LENGTHS.map((l) => ({ ...l, count: storyWordCount(level, l.value) }))} value={length} onChange={setLength} />
        </div>
        <Field label="Theme (optional)" htmlFor="ai-theme" className="sm:col-span-2">
          <Textarea
            id="ai-theme"
            rows={3}
            maxLength={400}
            value={theme}
            onChange={(e) => setTheme(e.target.value)}
            placeholder="What the story is about, such as two friends who get lost on a hike"
          />
          <ThemeIdeas theme={theme} onChange={setTheme} />
        </Field>
      </div>

      <ol className="flex flex-col gap-4 border-t border-line pt-5">
        <Step n={1} done={copied}>
          <span>Copy the prompt.</span>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary" icon={<Copy size={15} strokeWidth={1.8} />} onClick={() => void copyPrompt()}>
              Copy prompt
            </Button>
            <button
              type="button"
              aria-expanded={showPrompt}
              aria-controls="ai-prompt"
              onClick={() => setShowPrompt((v) => !v)}
              className="flex items-center gap-1 text-small text-sage-ink transition-colors hover:text-ink"
            >
              {showPrompt ? 'Hide the prompt' : 'See the prompt'}
              <ChevronDown size={14} strokeWidth={2} aria-hidden className={clsx('transition-transform', showPrompt && 'rotate-180')} />
            </button>
          </div>
          {/* Under the buttons and as wide as the step, so the prompt reads like a page. */}
          {showPrompt && (
            <Textarea
              id="ai-prompt"
              readOnly
              rows={12}
              value={prompt}
              aria-label="Prompt"
              className="animate-fade-in border-line bg-soft text-small leading-relaxed text-ink-2 [scrollbar-width:thin] focus:bg-main"
            />
          )}
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
