import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select, Switch } from '@/components/ui/form'
import { useFeedback } from '@/components/ui/feedback'
import { createDeck, deleteDeck, updateDeck } from '@/data/cards'
import { useCards, useDecks, useLanguage, useTopics } from '@/data/hooks'
import type { Deck, DeckDirections } from '@/db/types'

/** Create a deck (deckId = null) or edit one: name, topic, daily limits and practice directions. */
export function DeckDialog({ deckId, open, onClose, onCreated }: { deckId: string | null; open: boolean; onClose: () => void; onCreated?: (deck: Deck) => void }) {
  const decks = useDecks()
  const deck = deckId ? decks.find((d) => d.id === deckId) : undefined
  return (
    <Dialog open={open} onClose={onClose} title={deck ? 'Deck settings' : 'New deck'} size="md">
      {open && (!deckId || deck) && <DeckForm key={deckId ?? 'new'} deck={deck} onDone={onClose} onCreated={onCreated} />}
    </Dialog>
  )
}

function DeckForm({ deck, onDone, onCreated }: { deck?: Deck; onDone: () => void; onCreated?: (deck: Deck) => void }) {
  const topics = useTopics()
  const cards = useCards()
  const language = useLanguage()
  const { toast, confirm } = useFeedback()
  const [name, setName] = useState(deck?.name ?? '')
  const [topicId, setTopicId] = useState(deck?.topicId ?? topics[0]?.id ?? '')
  const [newPerDay, setNewPerDay] = useState(deck?.newPerDay ?? 15)
  const [reviewsPerDay, setReviewsPerDay] = useState(deck?.reviewsPerDay ?? 150)
  const [directions, setDirections] = useState<DeckDirections>(deck?.directions ?? { imageToDe: true, enToDe: true, deToEn: false })
  const cardCount = cards?.filter((c) => c.deckId === deck?.id).length ?? 0

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const patch = {
      name: name.trim() || 'New deck',
      topicId: topicId || undefined,
      newPerDay: Math.max(0, Math.min(999, newPerDay)),
      reviewsPerDay: Math.max(0, Math.min(9999, reviewsPerDay)),
      directions,
    }
    if (deck) {
      await updateDeck(deck.id, patch)
      toast('Deck saved')
    } else {
      const created = await createDeck({ name: patch.name, topicId: patch.topicId })
      await updateDeck(created.id, patch)
      onCreated?.(created)
      toast('Deck created')
    }
    onDone()
  }

  const remove = async () => {
    if (!deck) return
    const ok = await confirm({
      title: `Delete “${deck.name}”?`,
      body: `This deletes the deck and its ${cardCount} ${cardCount === 1 ? 'card' : 'cards'}, with their review history. Export a backup first if you might want them back.`,
      confirmLabel: 'Delete deck',
      danger: true,
    })
    if (!ok) return
    await deleteDeck(deck.id)
    toast('Deck deleted')
    onDone()
  }

  const toggle = (key: keyof DeckDirections) => (value: boolean) => setDirections((d) => ({ ...d, [key]: value }))

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" htmlFor="deck-name">
          <Input id="deck-name" autoFocus={!deck} value={name} onChange={(e) => setName(e.target.value)} placeholder={`${language.name} A1`} />
        </Field>
        <Field label="Review time counts toward" htmlFor="deck-topic">
          <Select id="deck-topic" value={topicId} onChange={(e) => setTopicId(e.target.value)}>
            <option value="">No topic</option>
            {topics.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="New cards per day" htmlFor="deck-new">
          <Input id="deck-new" type="number" inputMode="numeric" min={0} max={999} value={newPerDay} onChange={(e) => setNewPerDay(Number(e.target.value) || 0)} />
        </Field>
        <Field label="Reviews per day" htmlFor="deck-reviews">
          <Input id="deck-reviews" type="number" inputMode="numeric" min={0} max={9999} value={reviewsPerDay} onChange={(e) => setReviewsPerDay(Number(e.target.value) || 0)} />
        </Field>
      </div>
      <div className="flex flex-col gap-1 rounded-row bg-field px-4 py-3">
        <div className="pb-1 text-small font-medium text-ink-2">Practice directions</div>
        <Switch label={`Image → ${language.name}`} description={`Only the image is shown; answer in ${language.name}. Needs an image.`} checked={directions.imageToDe} onChange={toggle('imageToDe')} />
        <Switch label={`${language.native.name} → ${language.name}`} description="Sentence cards always use this direction." checked={directions.enToDe} onChange={toggle('enToDe')} />
        <Switch label={`${language.name} → ${language.native.name}`} checked={directions.deToEn} onChange={toggle('deToEn')} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {deck && (
          <Button variant="ghost" className="text-red-ink hover:text-red-ink" icon={<Trash2 size={15} strokeWidth={1.8} />} onClick={() => void remove()}>
            Delete deck
          </Button>
        )}
        <div className="ml-auto flex gap-2">
          <Button variant="ghost" onClick={onDone}>
            Cancel
          </Button>
          <Button variant="primary" type="submit">
            {deck ? 'Save' : 'Create deck'}
          </Button>
        </div>
      </div>
    </form>
  )
}
