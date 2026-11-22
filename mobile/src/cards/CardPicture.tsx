import { germanText, isPluralOnly } from '@lernzeit/core/german'
import { pastelIndex } from '@lernzeit/core/today'
import type { Card } from '@lernzeit/core/types'
import { Image, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native'
import { useLiveQuery } from '../store/live'
import { useTheme } from '../theme'

/** First letter of the word, skipping articles. */
function initial(text: string): string {
  const word = text.replace(/^(der|die|das)\s+/i, '').trim()
  return [...word][0]?.toUpperCase() ?? ''
}

/** The card's picture: its file on this phone, else its emoji, else the word's first letter on a soft pastel. */
export function CardPicture({ card, height = 120, style, emojiSize }: { card: Pick<Card, 'id' | 'imageId' | 'emoji' | 'german' | 'english'>; height?: number; style?: StyleProp<ViewStyle>; emojiSize?: number }) {
  const { pastels, colors } = useTheme()
  const file = useLiveQuery(['imageFiles'], (library) => (card.imageId ? library.imageFile(card.imageId) : undefined), [card.imageId])
  const size = emojiSize ?? Math.round(height * 0.5)
  return (
    <View style={[{ height, borderRadius: 10, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: pastels[pastelIndex(card.id)] }, style]}>
      {file ? (
        <Image source={{ uri: file.path }} accessibilityLabel={card.english} resizeMode={file.fit === 'cover' ? 'cover' : 'contain'} style={file.fit === 'cover' ? styles.fill : [styles.fill, { padding: 8 }]} />
      ) : card.emoji && !card.imageId ? (
        <Text accessibilityRole="image" accessibilityLabel={card.english} style={{ fontSize: size, lineHeight: size * 1.25 }}>
          {card.emoji}
        </Text>
      ) : (
        <Text importantForAccessibility="no" style={{ fontFamily: 'Geist_600SemiBold', fontSize: size, lineHeight: size * 1.15, opacity: 0.15, color: colors.onPastel }}>
          {initial(card.german)}
        </Text>
      )}
    </View>
  )
}

/** The German of a card, a noun's article in its colour. */
export function GermanLine({ card, style }: { card: Card; style?: StyleProp<TextStyle> }) {
  const { colors } = useTheme()
  if (card.type === 'word' && card.gender && !isPluralOnly(card)) {
    return (
      <Text style={style}>
        <Text style={{ color: colors[card.gender] }}>{card.gender}</Text>
        {` ${card.german}`}
      </Text>
    )
  }
  return <Text style={style}>{germanText(card)}</Text>
}

const styles = StyleSheet.create({ fill: { width: '100%', height: '100%' } })
