import { useRef, useState } from 'react'
import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select } from '@/components/ui/form'
import { useFeedback } from '@/components/ui/feedback'
import { createDeck, quickAddCard } from '@/data/cards'
import { useDecks, useLanguage, useLearningText, useTopics } from '@/data/hooks'
import { storage } from '@/lib/browser'

/** The deck the last quick-added card went to; the story reader adds words there too. */
export const LAST_DECK_KEY = 'lernzeit-quick-deck'

/** The "+" button's form: a word and its meaning, saved in seconds, tagged incomplete. */
export function QuickAddDialog({ open, onClose, onMore }: { open: boolean; onClose: () => void; onMore: (deckId?: string) => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="Quick add" description="Just the words. Add the image and the rest later." size="sm">
      {open && <QuickAddForm onClose={onClose} onMore={onMore} />}
    </Dialog>
  )
}

function QuickAddForm({ onClose, onMore }: { onClose: () => void; onMore: (deckId?: string) => void }) {
  const learning = useLearningText()
  const language = useLanguage()
  const decks = useDecks()
  const topics = useTopics()
  const { toast } = useFeedback()
  const [english, setEnglish] = useState('')
  const [german, setGerman] = useState('')
  const [deckId, setDeckId] = useState<string>(() => storage.get(LAST_DECK_KEY) ?? '')
  const [count, setCount] = useState(0)
  const englishRef = useRef<HTMLInputElement>(null)
  const effectiveDeck = decks.some((d) => d.id === deckId) ? deckId : (decks[0]?.id ?? '')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!english.trim() || !german.trim()) return
    let target = effectiveDeck
    if (!target) target = (await createDeck({ name: `${language.name} words`, topicId: topics[0]?.id })).id
    await quickAddCard({ english, german, deckId: target })
    storage.set(LAST_DECK_KEY, target)
    setEnglish('')
    setGerman('')
    setCount((c) => c + 1)
    toast(`Added “${german.trim()}”`)
    englishRef.current?.focus()
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <Field label={language.native.name} htmlFor="quick-en">
        <Input
          ref={englishRef}
          id="quick-en"
          autoFocus
          value={english}
          onChange={(e) => setEnglish(e.target.value)}
          placeholder={language.native.code === 'en' ? 'dog' : undefined}
          autoComplete="off"
          dir="auto"
        />
      </Field>
      <Field label={language.name} htmlFor="quick-de" hint={language.code === 'de' ? 'Include the article: der Hund' : 'Include the article for a noun'}>
        <Input id="quick-de" value={german} onChange={(e) => setGerman(e.target.value)} placeholder={language.code === 'de' ? 'der Hund' : undefined} autoComplete="off" {...learning} />
      </Field>
      {decks.length > 1 && (
        <Field label="Deck" htmlFor="quick-deck">
          <Select id="quick-deck" value={effectiveDeck} onChange={(e) => setDeckId(e.target.value)}>
            {decks.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Button variant="quiet" size="sm" className="px-0" onClick={() => onMore(effectiveDeck)}>
          All fields
        </Button>
        <div className="ml-auto flex gap-2">
          <Button variant="ghost" onClick={onClose}>
            {count ? 'Done' : 'Cancel'}
          </Button>
          <Button variant="primary" type="submit" disabled={!english.trim() || !german.trim()}>
            Save
          </Button>
        </div>
      </div>
    </form>
  )
}
