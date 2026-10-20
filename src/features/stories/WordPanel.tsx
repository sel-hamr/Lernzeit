import { useId, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { ExternalLink, Plus, Volume2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/primitives'
import { Field, Input, Select } from '@/components/ui/form'
import { useFeedback } from '@/components/ui/feedback'
import { CardImage } from '@/components/CardImage'
import { CardGerman } from '@/components/GermanWord'
import { useUI } from '@/app/ui'
import { createDeck, INCOMPLETE_TAG, saveCard } from '@/data/cards'
import { useDecks, useLanguage, useLearningText, useSettings, useTopics } from '@/data/hooks'
import { STORY_TAG } from '@/data/stories'
import type { Card, TopicColor } from '@/db/types'
import { LAST_DECK_KEY } from '@/features/flashcards/QuickAdd'
import { storage } from '@/lib/browser'
import { GENDER_LABEL, germanText, wordKind } from '@/lib/german'
import { lookupKey, type Knowledge } from '@/lib/reader'
import { speak, voiceOptions } from '@/data/voice'
import type { Vocabulary } from './vocabulary'

/** The chip matches the word's highlight in the text. */
const KNOWLEDGE_CHIP: Record<Knowledge, { label: string; color?: TopicColor }> = {
  new: { label: 'New', color: 'sand' },
  learning: { label: 'Learning', color: 'sage' },
  known: { label: 'Known' },
}

/** What a tapped word is: its card (or cards), or a form to add it to a deck. */
export function WordPanel({ word, sentence, cardIds, vocabulary }: { word: string; sentence: string; cardIds: string[]; vocabulary: Vocabulary }) {
  const learning = useLearningText()
  const settings = useSettings()
  // A word added here has no form that matches the text when it was saved in its base form.
  const [addedId, setAddedId] = useState<string>()
  const say = (text: string) => speak(text, voiceOptions(settings))
  const ids = cardIds.length ? cardIds : addedId ? [addedId] : []
  const cards = ids.map((id) => vocabulary.cards.get(id)).filter((c): c is Card => !!c)

  if (!cards.length) {
    // The card was just added and the live query has not caught up yet.
    if (addedId) return null
    return <UnknownWord word={word} sentence={sentence} onSpeak={say} onAdded={setAddedId} />
  }
  const isForm = cards.every((c) => ![c.german, germanText(c)].some((text) => lookupKey(text) === lookupKey(word)))
  return (
    <div className="flex flex-col gap-5">
      {isForm && (
        <p className="px-2 text-small text-muted">
          <span {...learning} className="font-medium text-ink">
            {word}
          </span>{' '}
          in the story is a form of:
        </p>
      )}
      {cards.map((card) => (
        <CardBlock key={card.id} card={card} knowledge={vocabulary.knowledge.get(card.id) ?? 'new'} compact={cards.length > 1} onSpeak={say} />
      ))}
    </div>
  )
}

function CardBlock({ card, knowledge, compact, onSpeak }: { card: Card; knowledge: Knowledge; compact: boolean; onSpeak: (text: string) => void }) {
  const learning = useLearningText()
  const language = useLanguage()
  const navigate = useNavigate()
  const chip = KNOWLEDGE_CHIP[knowledge]
  const kind = [wordKind(card), card.gender && GENDER_LABEL[card.gender]].filter(Boolean).join(', ')
  const rows: [string, string][] = []
  if (card.plural) rows.push(['Plural', card.plural])
  if (card.verbForms) rows.push(['Verb forms', card.verbForms])
  if (card.exampleDe) rows.push(['Example', card.exampleDe])

  return (
    <article className="flex flex-col gap-3.5">
      <CardImage imageId={card.imageId} emoji={card.emoji} label={card.german} seed={card.id} alt={card.english} className={compact ? 'h-24' : 'h-40'} />
      <div className="flex items-start justify-between gap-3 px-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h3 {...learning} className="text-[20px] leading-tight font-semibold tracking-[-0.01em]">
            <CardGerman card={card} />
          </h3>
          <div className="text-small text-muted">
            {card.english} · {kind}
          </div>
        </div>
        <Button variant="outline" iconOnly aria-label={`Play ${language.name} audio`} onClick={() => onSpeak(germanText(card))}>
          <Volume2 size={18} strokeWidth={1.8} />
        </Button>
      </div>
      <div className="flex flex-wrap gap-1.5 px-2">
        {chip.color ? (
          <Chip tone="topic" color={chip.color}>
            {chip.label}
          </Chip>
        ) : (
          <Chip tone="neutral">{chip.label}</Chip>
        )}
        {card.tags.includes(INCOMPLETE_TAG) && <Chip tone="soft">Incomplete</Chip>}
      </div>
      {rows.length > 0 && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 px-2 text-small">
          {rows.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-muted">{label}</dt>
              <dd {...learning} className="text-right">
                {value}
              </dd>
            </div>
          ))}
        </dl>
      )}
      <Button variant="outline" className="mx-2" onClick={() => navigate(`/flashcards?card=${card.id}`)}>
        Open card
      </Button>
    </article>
  )
}

function UnknownWord({ word, sentence, onSpeak, onAdded }: { word: string; sentence: string; onSpeak: (text: string) => void; onAdded: (cardId: string) => void }) {
  const learning = useLearningText()
  const language = useLanguage()
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3 px-1">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h3 {...learning} className="text-[22px] leading-tight font-semibold tracking-[-0.01em] break-words">
            {word}
          </h3>
          <p className="text-small text-muted">Not in your decks yet.</p>
        </div>
        <Button variant="outline" iconOnly aria-label={`Play ${language.name} audio`} onClick={() => onSpeak(word)}>
          <Volume2 size={18} strokeWidth={1.8} />
        </Button>
      </div>
      <a
        href={`https://dict.leo.org/englisch-deutsch/${encodeURIComponent(word)}`}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 self-start px-1 text-small text-sage-ink hover:text-ink"
      >
        Look it up on LEO <ExternalLink size={13} strokeWidth={1.8} />
      </a>
      <AddWordForm word={word} sentence={sentence} onAdded={onAdded} />
    </div>
  )
}

/** Adds the word as a card, with the story's sentence as its example. */
function AddWordForm({ word, sentence, onAdded }: { word: string; sentence: string; onAdded: (cardId: string) => void }) {
  const learning = useLearningText()
  const language = useLanguage()
  const decks = useDecks()
  const topics = useTopics()
  const { toast } = useFeedback()
  const { openCardEditor } = useUI()
  const id = useId()
  const [german, setGerman] = useState(word)
  const [english, setEnglish] = useState('')
  const [deckId, setDeckId] = useState(() => storage.get(LAST_DECK_KEY) ?? '')
  const [saving, setSaving] = useState(false)
  const effectiveDeck = decks.some((d) => d.id === deckId) ? deckId : (decks[0]?.id ?? '')
  const ready = !!german.trim() && !!english.trim() && !saving

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!ready) return
    setSaving(true)
    try {
      const target = effectiveDeck || (await createDeck({ name: `${language.name} words`, topicId: topics[0]?.id })).id
      const card = await saveCard(
        { deckId: target, type: 'word', english, german, exampleDe: sentence, tags: [INCOMPLETE_TAG, STORY_TAG] },
        { kind: 'keep' },
      )
      storage.set(LAST_DECK_KEY, target)
      toast(`Added “${germanText(card)}”`, { action: { label: 'Edit', onClick: () => openCardEditor({ cardId: card.id }) } })
      onAdded(card.id)
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not add the word', { tone: 'error' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3.5 rounded-row border border-line bg-soft p-4">
      <div className="text-small font-medium">Add it to a deck</div>
      <Field label={language.name} htmlFor={`${id}-de`} hint={language.code === 'de' ? 'The base form, with the article for a noun: der Hund, gehen' : 'The base form, with the article for a noun'}>
        <Input id={`${id}-de`} value={german} onChange={(e) => setGerman(e.target.value)} autoComplete="off" {...learning} />
      </Field>
      <Field label={language.native.name} htmlFor={`${id}-en`}>
        <Input id={`${id}-en`} value={english} onChange={(e) => setEnglish(e.target.value)} placeholder="Meaning" autoComplete="off" dir="auto" />
      </Field>
      {decks.length > 1 && (
        <Field label="Deck" htmlFor={`${id}-deck`}>
          <Select id={`${id}-deck`} value={effectiveDeck} onChange={(e) => setDeckId(e.target.value)}>
            {decks.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <p className="text-chip text-muted">
        Example from the story:{' '}
        <span {...learning} className="text-ink-2">
          {sentence}
        </span>
      </p>
      <Button type="submit" variant="primary" disabled={!ready} icon={<Plus size={16} strokeWidth={1.8} />}>
        Add card
      </Button>
    </form>
  )
}
