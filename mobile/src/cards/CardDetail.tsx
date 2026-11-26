import { germanText } from '@lernzeit/core/german'
import type { Card } from '@lernzeit/core/types'
import * as Speech from 'expo-speech'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Pencil, Play, SearchX, Volume2 } from 'lucide-react-native'
import { StyleSheet, Text, View } from 'react-native'
import { Screen } from '../components/Screen'
import { useSettings } from '../data/settings'
import { FadeInUp } from '../motion'
import { useLiveQuery } from '../store/live'
import { useTheme } from '../theme'
import { Badge, Button, EmptyState, IconButton } from '../ui'
import { CardPicture, GermanLine } from './CardPicture'
import { useDecks } from './data'

/** One card: picture, German with its article, English, forms and examples. */
export function CardDetail() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const card = useLiveQuery(['cards'], (l) => l.get<Card>('cards', String(id)), [id])
  const decks = useDecks()
  const settings = useSettings()
  const router = useRouter()
  const { colors, type, spacing, radius, shadow, fonts } = useTheme()
  if (!card) {
    return (
      <Screen title="Card">
        <EmptyState icon={SearchX} title="This card is gone" body="It was deleted, here or on another device." />
      </Screen>
    )
  }
  const speak = (text: string) => Speech.speak(text, { language: 'de-DE', rate: settings.speechRate, voice: settings.voiceURI })
  const lines = (
    [
      ['Plural', card.plural],
      ['Verb forms', card.verbForms],
      ['Present', card.conjugation?.present],
      ['Past', card.conjugation?.past],
      ['Perfect', card.conjugation?.perfect],
      ['Example', card.exampleDe],
      ['Example, English', card.exampleEn],
      ['Tags', card.tags.join(', ')],
    ] as [string, string | undefined][]
  ).filter((l): l is [string, string] => !!l[1])
  const deckName = decks.find((d) => d.id === card.deckId)?.name
  return (
    <Screen
      title="Card"
      right={<IconButton icon={Pencil} label="Edit" iconSize={18} onPress={() => router.push({ pathname: '/card/edit', params: { id: card.id } })} />}
      footer={
        <View style={[styles.row, { gap: spacing.sm }]}>
          <Button label="Listen" variant="soft" icon={<Volume2 size={17} color={colors.ink} />} onPress={() => speak(germanText(card))} style={styles.grow} />
          <Button label="Practise" icon={<Play size={14} color={colors.onPrimary} fill={colors.onPrimary} />} onPress={() => router.push({ pathname: '/practice', params: { card: card.id } })} style={styles.grow} />
        </View>
      }
    >
      <FadeInUp index={0} style={[{ backgroundColor: colors.card, borderRadius: radius.card, padding: spacing.md, gap: spacing.lg }, shadow.card]}>
        <CardPicture card={card} height={220} style={{ borderRadius: radius.block }} />
        <View style={{ gap: spacing.xs, paddingHorizontal: spacing.sm, paddingBottom: spacing.sm }}>
          {deckName ? <Badge label={deckName} tone="accent" /> : null}
          <GermanLine card={card} style={[type.title, { color: colors.ink, paddingTop: spacing.xs }]} />
          <Text style={[type.section, { color: colors.muted, fontFamily: fonts.medium }]}>{card.english}</Text>
        </View>
      </FadeInUp>
      {lines.length ? (
        <FadeInUp index={1} style={[{ backgroundColor: colors.card, borderRadius: radius.card, paddingHorizontal: spacing.xl, paddingVertical: spacing.xs }, shadow.card]}>
          {lines.map(([label, value], i) => (
            <View key={label} style={{ paddingVertical: spacing.md, gap: 2, borderTopWidth: i ? StyleSheet.hairlineWidth : 0, borderTopColor: colors.line }}>
              <Text style={[type.chip, { color: colors.muted }]}>{label}</Text>
              <Text style={[type.body, { color: colors.ink }]}>{value}</Text>
            </View>
          ))}
        </FadeInUp>
      ) : null}
    </Screen>
  )
}

const styles = StyleSheet.create({ grow: { flex: 1 }, row: { flexDirection: 'row', alignItems: 'center' } })
