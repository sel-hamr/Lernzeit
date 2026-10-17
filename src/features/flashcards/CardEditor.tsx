import { useCallback, useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import { ExternalLink, Trash2, Volume2 } from 'lucide-react'
import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { Field, Input, Segmented, Select, Textarea } from '@/components/ui/form'
import { useFeedback } from '@/components/ui/feedback'
import { createDeck, deleteCard, INCOMPLETE_TAG, saveCard, type ImageChange } from '@/data/cards'
import { useCard, useDecks, useSettings, useTopics } from '@/data/hooks'
import type { Card, CardType, Gender } from '@/db/types'
import type { CardEditorRequest } from '@/app/ui'
import { parseCloze, splitArticle, stripCloze } from '@/lib/german'
import { speak, voiceOptions } from '@/data/voice'
import { ImagePicker } from './ImagePicker'

const TYPE_OPTIONS: { value: CardType; label: string }[] = [
  { value: 'word', label: 'Word' },
  { value: 'sentence', label: 'Sentence' },
  { value: 'cloze', label: 'Cloze' },
]

const GENDER_TEXT: Record<Gender, string> = { der: 'text-der!', die: 'text-die!', das: 'text-das!' }

const GENDER_OPTIONS: { value: Gender | 'none'; label: React.ReactNode }[] = [
  { value: 'none', label: '—' },
  { value: 'der', label: <span className="text-der">der</span> },
  { value: 'die', label: <span className="text-die">die</span> },
  { value: 'das', label: <span className="text-das">das</span> },
]

export function CardEditorDialog({ request, onClose }: { request: CardEditorRequest | null; onClose: () => void }) {
  const card = useCard(request?.cardId)
  const loading = !!request?.cardId && !card
  return (
    <Dialog open={!!request} onClose={onClose} title={request?.cardId ? 'Edit card' : 'Add card'} size="lg">
      {request && !loading && <CardForm key={request.cardId ?? 'new'} card={card} request={request} onDone={onClose} />}
    </Dialog>
  )
}

interface FormState {
  type: CardType
  deckId: string
  english: string
  german: string
  gender: Gender | 'none'
  plural: string
  verbForms: string
  exampleDe: string
  exampleEn: string
  emoji: string
  tags: string
}

function initialState(card: Card | undefined, request: CardEditorRequest, fallbackDeck: string): FormState {
  return {
    type: card?.type ?? request.type ?? 'word',
    deckId: card?.deckId ?? request.deckId ?? fallbackDeck,
    english: card?.english ?? '',
    german: card?.german ?? '',
    gender: card?.gender ?? 'none',
    plural: card?.plural ?? '',
    verbForms: card?.verbForms ?? '',
    exampleDe: card?.exampleDe ?? '',
    exampleEn: card?.exampleEn ?? '',
    emoji: card?.emoji ?? '',
    tags: (card?.tags ?? []).filter((t) => t !== INCOMPLETE_TAG || !!card).join(', '),
  }
}

function CardForm({ card, request, onDone }: { card?: Card; request: CardEditorRequest; onDone: () => void }) {
  const decks = useDecks()
  const topics = useTopics()
  const settings = useSettings()
  const { toast, confirm } = useFeedback()
  const formRef = useRef<HTMLFormElement>(null)
  const germanRef = useRef<HTMLTextAreaElement>(null)
  const [state, setState] = useState<FormState>(() => initialState(card, request, decks[0]?.id ?? ''))
  const [image, setImage] = useState<ImageChange>({ kind: 'keep' })
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({})
  const [newDeckName, setNewDeckName] = useState<string | null>(null)
  const [seed] = useState(() => card?.id ?? crypto.randomUUID())

  const deckId = state.deckId || decks[0]?.id || ''
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setState((s) => ({ ...s, [key]: value }))
    setErrors((e) => ({ ...e, [key]: undefined }))
  }
  const onImage = useCallback((change: ImageChange) => setImage(change), [])

  const validate = (): boolean => {
    const next: typeof errors = {}
    if (!state.english.trim()) next.english = state.type === 'word' ? 'Add the English word' : 'Add the English sentence'
    if (!state.german.trim()) next.german = state.type === 'word' ? 'Add the German word' : 'Add the German sentence'
    if (state.type === 'cloze' && state.german.trim() && !parseCloze(state.german)) next.german = 'Mark the hidden word like {{this}}'
    if (!deckId && newDeckName === null) next.deckId = 'Create a deck first'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const save = async (addAnother: boolean) => {
    if (saving || !validate()) return
    setSaving(true)
    try {
      let targetDeck = deckId
      if (newDeckName !== null) {
        const deck = await createDeck({ name: newDeckName || 'New deck', topicId: topics[0]?.id })
        targetDeck = deck.id
        setNewDeckName(null)
        set('deckId', deck.id)
      }
      let tags = state.tags.split(',').map((t) => t.trim()).filter(Boolean)
      const willHaveImage = image.kind === 'set' || (image.kind === 'keep' && !!card?.imageId) || !!state.emoji.trim()
      // Once a quick-added card gets a picture it is no longer incomplete.
      if (willHaveImage) tags = tags.filter((t) => t !== INCOMPLETE_TAG)
      await saveCard(
        {
          deckId: targetDeck,
          type: state.type,
          english: state.english,
          german: state.german,
          gender: state.gender === 'none' ? undefined : state.gender,
          plural: state.plural,
          verbForms: state.verbForms,
          exampleDe: state.exampleDe,
          exampleEn: state.exampleEn,
          emoji: state.emoji,
          tags,
        },
        image,
        card?.id,
      )
      if (addAnother) {
        toast('Card saved')
        setState((s) => ({ ...initialState(undefined, { ...request, type: s.type }, targetDeck), tags: s.tags }))
        setImage({ kind: 'keep' })
        germanRef.current?.form?.querySelector<HTMLInputElement>('#card-english')?.focus()
      } else {
        toast(card ? 'Card updated' : 'Card added')
        onDone()
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not save the card', { tone: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!card) return
    const ok = await confirm({ title: 'Delete this card?', body: 'Its review history is deleted too.', confirmLabel: 'Delete', danger: true })
    if (!ok) return
    await deleteCard(card.id)
    toast('Card deleted')
    onDone()
  }

  // Typing "der Hund" fills in the gender and keeps just the word.
  const onGermanBlur = () => {
    if (state.type !== 'word') return
    const split = splitArticle(state.german)
    if (split.gender) setState((s) => ({ ...s, german: split.word, gender: split.gender! }))
  }

  const hideSelection = () => {
    const el = germanRef.current
    if (!el) return
    const { selectionStart: a, selectionEnd: b, value } = el
    const picked = value.slice(a, b)
    if (!picked.trim()) {
      toast('Select the word to hide first')
      return
    }
    // Only one word is hidden: earlier markers are removed.
    const lead = picked.match(/^\s*/)![0]
    const trail = picked.match(/\s*$/)![0]
    const word = stripCloze(picked).trim()
    set('german', `${stripCloze(value.slice(0, a))}${lead}{{${word}}}${trail}${stripCloze(value.slice(b))}`)
  }

  useEffect(() => {
    const el = formRef.current
    if (!el) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        void save(false)
      }
    }
    el.addEventListener('keydown', onKey)
    return () => el.removeEventListener('keydown', onKey)
  })

  const cloze = state.type === 'cloze' ? parseCloze(state.german) : null
  const photoQuery = (card?.imageQuery ?? state.english.split(/[,;(]/)[0]).trim()
  const word = state.type === 'word'

  return (
    <form
      ref={formRef}
      onSubmit={(e) => {
        e.preventDefault()
        void save(false)
      }}
      className="flex flex-col gap-5"
    >
      <div className="flex flex-wrap items-end gap-3">
        <Segmented label="Card type" options={TYPE_OPTIONS} value={state.type} onChange={(v) => set('type', v)} size="sm" />
        <div className="min-w-45 flex-1">
          {newDeckName === null ? (
            <Select
              aria-label="Deck"
              value={deckId}
              onChange={(e) => (e.target.value === '__new' ? setNewDeckName('') : set('deckId', e.target.value))}
            >
              {decks.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
              <option value="__new">New deck…</option>
            </Select>
          ) : (
            <div className="flex gap-2">
              <Input autoFocus aria-label="New deck name" placeholder="New deck name" value={newDeckName} onChange={(e) => setNewDeckName(e.target.value)} />
              {decks.length > 0 && (
                <Button variant="ghost" onClick={() => setNewDeckName(null)}>
                  Cancel
                </Button>
              )}
            </div>
          )}
          {errors.deckId && <div className="pt-1 text-chip text-red-ink">{errors.deckId}</div>}
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-[1fr_240px]">
        <div className="flex flex-col gap-4">
          <Field label={word ? 'English' : 'English sentence'} htmlFor="card-english" error={errors.english}>
            <Input
              id="card-english"
              autoFocus={!card}
              value={state.english}
              onChange={(e) => set('english', e.target.value)}
              placeholder={word ? 'dog' : 'The dog is playing in the garden.'}
            />
          </Field>

          <Field
            label={state.type === 'cloze' ? 'German sentence, hidden word in {{ }}' : word ? 'German' : 'German sentence'}
            htmlFor="card-german"
            error={errors.german}
            hint={
              state.type === 'cloze'
                ? cloze
                  ? `Shown as: ${cloze.masked} → ${cloze.answer}`
                  : 'Example: Der Hund {{spielt}} im Garten.'
                : word
                  ? 'Typing “der Hund” sets the gender for you.'
                  : undefined
            }
          >
            <div className="flex items-start gap-2">
              {word ? (
                <Input
                  id="card-german"
                  value={state.german}
                  onChange={(e) => set('german', e.target.value)}
                  onBlur={onGermanBlur}
                  placeholder="Hund"
                  className={clsx('flex-1', state.gender !== 'none' && GENDER_TEXT[state.gender])}
                  autoComplete="off"
                  lang="de"
                />
              ) : (
                <Textarea
                  id="card-german"
                  ref={germanRef}
                  rows={2}
                  value={state.german}
                  onChange={(e) => set('german', e.target.value)}
                  placeholder={state.type === 'cloze' ? 'Der Hund {{spielt}} im Garten.' : 'Der Hund spielt im Garten.'}
                  className="flex-1"
                  lang="de"
                />
              )}
              <Button
                variant="outline"
                iconOnly
                aria-label="Listen"
                onClick={() =>
                  speak(word && state.gender !== 'none' ? `${state.gender} ${state.german}` : stripCloze(state.german), voiceOptions(settings))
                }
              >
                <Volume2 size={17} strokeWidth={1.8} />
              </Button>
            </div>
            {state.type === 'cloze' && (
              <div>
                <Button size="sm" variant="soft" onClick={hideSelection} className="mt-1">
                  Hide selected word
                </Button>
              </div>
            )}
          </Field>

          {word && (
            <>
              <Field label="Gender (nouns)">
                <Segmented label="Gender" options={GENDER_OPTIONS} value={state.gender} onChange={(v) => set('gender', v)} size="sm" className="self-start" />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Plural" htmlFor="card-plural">
                  <Input id="card-plural" value={state.plural} onChange={(e) => set('plural', e.target.value)} placeholder="die Hunde" lang="de" />
                </Field>
                <Field label="Verb forms" htmlFor="card-verb">
                  <Input id="card-verb" value={state.verbForms} onChange={(e) => set('verbForms', e.target.value)} placeholder="gehen – ging – gegangen" lang="de" />
                </Field>
              </div>
              <Field label="Example sentence (German)" htmlFor="card-ex-de">
                <Input id="card-ex-de" value={state.exampleDe} onChange={(e) => set('exampleDe', e.target.value)} placeholder="Der Hund spielt im Garten." lang="de" />
              </Field>
              <Field label="Example sentence (English)" htmlFor="card-ex-en">
                <Input id="card-ex-en" value={state.exampleEn} onChange={(e) => set('exampleEn', e.target.value)} placeholder="The dog is playing in the garden." />
              </Field>
            </>
          )}

          <Field label="Tags" htmlFor="card-tags" hint="Separate with commas, e.g. Animals, A1">
            <Input id="card-tags" value={state.tags} onChange={(e) => set('tags', e.target.value)} placeholder="Animals, A1" />
          </Field>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-small font-medium text-ink-2">Image {word && <span className="font-normal text-muted">(recommended)</span>}</span>
          <ImagePicker currentImageId={card?.imageId} emoji={state.emoji} seed={seed} value={image} onChange={onImage} pasteTarget={formRef} />
          <span className="text-chip text-muted">Saved at most 600px wide to keep things small.</span>
          <div className="flex items-end gap-2 pt-2">
            <Field label="Or an emoji" htmlFor="card-emoji" className="w-24">
              <Input
                id="card-emoji"
                value={state.emoji}
                onChange={(e) => set('emoji', [...e.target.value].slice(0, 8).join(''))}
                placeholder="🐕"
                className="text-center font-emoji text-[20px]"
                autoComplete="off"
              />
            </Field>
            {photoQuery && (
              <a
                href={`https://www.google.com/search?tbm=isch&q=${encodeURIComponent(photoQuery)}`}
                target="_blank"
                rel="noreferrer"
                className="mb-2.5 inline-flex items-center gap-1 text-small text-sage-ink hover:text-ink"
              >
                Search photos <ExternalLink size={13} strokeWidth={1.8} />
              </a>
            )}
          </div>
          <span className="text-chip text-muted">An uploaded image is shown instead of the emoji. Copy a photo from the search and paste it here.</span>
        </div>
      </div>

      <div className="sticky bottom-0 z-10 -mx-6 -mb-5 flex flex-wrap items-center gap-2 border-t border-line bg-soft px-6 py-3.5 pb-[max(14px,env(safe-area-inset-bottom))]">
        {card && (
          <Button variant="ghost" className="text-red-ink hover:text-red-ink" icon={<Trash2 size={15} strokeWidth={1.8} />} onClick={() => void remove()}>
            Delete
          </Button>
        )}
        <div className="ml-auto flex flex-wrap gap-2">
          {!card && (
            <Button variant="outline" disabled={saving} onClick={() => void save(true)}>
              Save and add another
            </Button>
          )}
          <Button variant="primary" type="submit" disabled={saving}>
            {card ? 'Save changes' : 'Add card'}
          </Button>
        </div>
      </div>
    </form>
  )
}
