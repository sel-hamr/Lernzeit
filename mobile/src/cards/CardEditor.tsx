import type { Card, CardType, Conjugation, Gender } from '@lernzeit/core/types'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Camera, Images, Trash2 } from 'lucide-react-native'
import { useState } from 'react'
import { Alert, Image, Text, View } from 'react-native'
import { Screen } from '../components/Screen'
import { useLiveQuery, useLocalLibrary } from '../store/live'
import type { ImageFile } from '../store/library'
import { useTheme } from '../theme'
import { Button, Chip, Field, SelectRow } from '../ui'
import { deleteCard, saveCard, useDecks, type ImageChange } from './data'
import { pickCardImage } from './images'

const TYPES: { value: CardType; label: string }[] = [
  { value: 'word', label: 'Word' },
  { value: 'sentence', label: 'Sentence' },
  { value: 'cloze', label: 'Cloze' },
]
const GENDERS: (Gender | '')[] = ['', 'der', 'die', 'das']

/** The card editor, for a new card (`deckId` given) or an existing one (`id`). */
export function CardEditor() {
  const { id, deckId: deckParam } = useLocalSearchParams<{ id?: string; deckId?: string }>()
  const library = useLocalLibrary()
  const router = useRouter()
  const { colors, type, spacing } = useTheme()
  const decks = useDecks()
  const existing = useLiveQuery(['cards'], (l) => (id ? l.get<Card>('cards', String(id)) : undefined), [id])
  const [form, setForm] = useState(() => ({
    deckId: existing?.deckId ?? (deckParam && decks.some((d) => d.id === deckParam) ? String(deckParam) : decks[0]?.id ?? ''),
    type: (existing?.type ?? 'word') as CardType,
    english: existing?.english ?? '',
    german: existing?.german ?? '',
    gender: (existing?.gender ?? '') as Gender | '',
    plural: existing?.plural ?? '',
    verbForms: existing?.verbForms ?? '',
    present: existing?.conjugation?.present ?? '',
    past: existing?.conjugation?.past ?? '',
    perfect: existing?.conjugation?.perfect ?? '',
    exampleDe: existing?.exampleDe ?? '',
    exampleEn: existing?.exampleEn ?? '',
    emoji: existing?.emoji ?? '',
    tags: (existing?.tags ?? []).join(', '),
  }))
  const [image, setImage] = useState<ImageChange>({ kind: 'keep' })
  const [error, setError] = useState<string>()
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [key]: value }))
  const currentFile = useLiveQuery(['imageFiles'], (l) => (existing?.imageId ? l.imageFile(existing.imageId) : undefined), [existing?.imageId])
  const shown: ImageFile | undefined = image.kind === 'set' ? image.file : image.kind === 'keep' ? currentFile : undefined

  const pick = async (source: 'camera' | 'gallery') => {
    try {
      const file = await pickCardImage(source)
      if (file) setImage({ kind: 'set', file })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not get the picture.')
    }
  }

  const save = () => {
    if (!form.deckId) return setError('Add a deck first.')
    if (!form.english.trim() || !form.german.trim()) return setError('English and German are both needed.')
    if (form.type === 'cloze' && !/\{\{.+?\}\}/.test(form.german)) return setError('Mark the gap with {{ }}, like: Der Hund {{spielt}} im Garten.')
    const conjugation: Conjugation = { present: form.present, past: form.past, perfect: form.perfect }
    saveCard(
      library,
      {
        deckId: form.deckId,
        type: form.type,
        english: form.english,
        german: form.german,
        gender: form.type === 'word' && form.gender ? form.gender : undefined,
        plural: form.plural,
        verbForms: form.verbForms,
        conjugation,
        exampleDe: form.exampleDe,
        exampleEn: form.exampleEn,
        emoji: form.emoji,
        tags: form.tags.split(',').map((t) => t.trim()),
      },
      image,
      existing?.id,
    )
    router.back()
  }

  const remove = () =>
    Alert.alert('Delete this card?', 'Its progress is deleted with it, on every device.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          if (existing) deleteCard(library, existing.id)
          router.dismissTo('/flashcards')
        },
      },
    ])

  return (
    <Screen title={existing ? 'Edit card' : 'New card'}>
      <View style={{ gap: spacing.md }}>
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          {TYPES.map((t) => (
            <Chip key={t.value} label={t.label} selected={form.type === t.value} onPress={() => set('type', t.value)} />
          ))}
        </View>
        <SelectRow label="Deck" value={form.deckId} display={decks.find((d) => d.id === form.deckId)?.name ?? 'No deck'} options={decks.map((d) => ({ value: d.id, label: d.name }))} onChange={(v) => set('deckId', v)} />
        <Field label="English" value={form.english} onChangeText={(v) => set('english', v)} autoCapitalize="none" />
        <Field
          label={form.type === 'cloze' ? 'German sentence, gap in {{ }}' : form.type === 'word' ? 'German (without article)' : 'German'}
          value={form.german}
          onChangeText={(v) => set('german', v)}
          autoCapitalize="none"
          multiline={form.type !== 'word'}
        />
        {form.type === 'word' ? (
          <>
            <Text style={[type.small, { color: colors.muted }]}>Article</Text>
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              {GENDERS.map((g) => (
                <Chip key={g || 'none'} label={g || 'None'} selected={form.gender === g} onPress={() => set('gender', g)} />
              ))}
            </View>
            <Field label="Plural" value={form.plural} onChangeText={(v) => set('plural', v)} autoCapitalize="none" />
            <Field label="Verb forms (ich, du, er, wir, ihr, sie)" value={form.verbForms} onChangeText={(v) => set('verbForms', v)} autoCapitalize="none" />
            <Text style={[type.small, { color: colors.muted }]}>Conjugation, six forms per line: fahre, fährst, fährt, fahren, fahrt, fahren</Text>
            <Field label="Present" value={form.present} onChangeText={(v) => set('present', v)} autoCapitalize="none" />
            <Field label="Past" value={form.past} onChangeText={(v) => set('past', v)} autoCapitalize="none" />
            <Field label="Perfect" value={form.perfect} onChangeText={(v) => set('perfect', v)} autoCapitalize="none" />
          </>
        ) : null}
        <Field label="Example (German)" value={form.exampleDe} onChangeText={(v) => set('exampleDe', v)} multiline />
        <Field label="Example (English)" value={form.exampleEn} onChangeText={(v) => set('exampleEn', v)} multiline />
        <Field label="Emoji (used when there is no picture)" value={form.emoji} onChangeText={(v) => set('emoji', v)} />
        <Field label="Tags, separated by commas" value={form.tags} onChangeText={(v) => set('tags', v)} autoCapitalize="none" />

        <Text style={[type.small, { color: colors.muted }]}>Picture</Text>
        {shown ? <Image source={{ uri: shown.path }} accessibilityLabel="Card picture" resizeMode="cover" style={{ width: '100%', height: 160, borderRadius: 10 }} /> : null}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          <Button label="Camera" variant="outline" icon={<Camera size={16} color={colors.ink} />} onPress={() => void pick('camera')} />
          <Button label="Gallery" variant="outline" icon={<Images size={16} color={colors.ink} />} onPress={() => void pick('gallery')} />
          {shown ? <Button label="Remove" variant="outline" onPress={() => setImage({ kind: 'remove' })} /> : null}
        </View>

        {error ? (
          <Text style={[type.body, { color: colors.redInk }]} accessibilityRole="alert">
            {error}
          </Text>
        ) : null}
        <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
          <Button label="Save card" onPress={save} />
          {existing ? <Button label="Delete" variant="danger" icon={<Trash2 size={16} color={colors.redInk} />} onPress={remove} /> : null}
        </View>
      </View>
    </Screen>
  )
}
