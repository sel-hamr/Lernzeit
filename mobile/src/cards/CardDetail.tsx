import { germanText } from '@lernzeit/core/german'
import type { Card } from '@lernzeit/core/types'
import * as Speech from 'expo-speech'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Pencil, Play, Volume2 } from 'lucide-react-native'
import { Text, View } from 'react-native'
import { Screen } from '../components/Screen'
import { useSettings } from '../data/settings'
import { useLiveQuery } from '../store/live'
import { useTheme } from '../theme'
import { Button } from '../ui'
import { CardPicture, GermanLine } from './CardPicture'
import { useDecks } from './data'

/** One card: picture, German with its article, English, forms and examples. */
export function CardDetail() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const card = useLiveQuery(['cards'], (l) => l.get<Card>('cards', String(id)), [id])
  const decks = useDecks()
  const settings = useSettings()
  const router = useRouter()
  const { colors, type, spacing } = useTheme()
  if (!card) {
    return (
      <Screen title="Card">
        <Text style={[type.body, { color: colors.muted }]}>This card is gone.</Text>
      </Screen>
    )
  }
  const speak = (text: string) => Speech.speak(text, { language: 'de-DE', rate: settings.speechRate, voice: settings.voiceURI })
  const line = (label: string, value?: string) =>
    value ? (
      <View style={{ gap: 2 }}>
        <Text style={[type.chip, { color: colors.muted }]}>{label}</Text>
        <Text style={[type.body, { color: colors.ink }]}>{value}</Text>
      </View>
    ) : null
  return (
    <Screen title="Card">
      <View style={{ gap: spacing.lg }}>
        <CardPicture card={card} height={200} />
        <View style={{ gap: spacing.xs }}>
          <GermanLine card={card} style={[type.title, { color: colors.ink }]} />
          <Text style={[type.section, { color: colors.muted }]}>{card.english}</Text>
          <Text style={[type.small, { color: colors.muted }]}>{decks.find((d) => d.id === card.deckId)?.name}</Text>
        </View>
        {line('Plural', card.plural)}
        {line('Verb forms', card.verbForms)}
        {line('Present', card.conjugation?.present)}
        {line('Past', card.conjugation?.past)}
        {line('Perfect', card.conjugation?.perfect)}
        {line('Example', card.exampleDe)}
        {line('Example, English', card.exampleEn)}
        {line('Tags', card.tags.join(', '))}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          <Button label="Listen" variant="outline" icon={<Volume2 size={16} color={colors.ink} />} onPress={() => speak(germanText(card))} />
          <Button label="Practise" variant="outline" icon={<Play size={14} color={colors.ink} />} onPress={() => router.push({ pathname: '/practice', params: { card: card.id } })} />
          <Button label="Edit" icon={<Pencil size={15} color={colors.onDark} />} onPress={() => router.push({ pathname: '/card/edit', params: { id: card.id } })} />
        </View>
      </View>
    </Screen>
  )
}
