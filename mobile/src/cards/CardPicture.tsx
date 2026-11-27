import { germanText, isPluralOnly } from '@lernzeit/core/german'
import { pastelIndex } from '@lernzeit/core/today'
import type { Card } from '@lernzeit/core/types'
import { Image, StyleSheet, Text, View, type StyleProp, type TextProps, type TextStyle, type ViewStyle } from 'react-native'
import { useLiveQuery } from '../store/live'
import { useTheme } from '../theme'

/**
 * For big German text: Android breaks a long compound ("Geschwindigkeitsbegrenzung") with a hyphen
 * instead of at any letter, and balances the lines.
 */
export const germanWrap = { android_hyphenationFrequency: 'full', textBreakStrategy: 'balanced' } as const satisfies TextProps

/** First letter of the word, skipping articles. */
function initial(text: string): string {
  const word = text.replace(/^(der|die|das)\s+/i, '').trim()
  return [...word][0]?.toUpperCase() ?? ''
}

/** The card's picture: its file on this phone, else its emoji, else the word's first letter on a soft pastel. */
export function CardPicture({ card, height = 120, style, emojiSize }: { card: Pick<Card, 'id' | 'imageId' | 'emoji' | 'german' | 'english'>; height?: number; style?: StyleProp<ViewStyle>; emojiSize?: number }) {
  const { pastels, colors, fonts } = useTheme()
  const file = useLiveQuery(['imageFiles'], (library) => (card.imageId ? library.imageFile(card.imageId) : undefined), [card.imageId])
  const size = emojiSize ?? Math.round(height * 0.5)
  return (
    <View style={[{ height, borderRadius: 16, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: pastels[pastelIndex(card.id)] }, style]}>
      {file ? (
        <Image source={{ uri: file.path }} accessibilityLabel={card.english} resizeMode={file.fit === 'cover' ? 'cover' : 'contain'} style={file.fit === 'cover' ? styles.fill : [styles.fill, { padding: 8 }]} />
      ) : card.emoji && !card.imageId ? (
        <Text accessibilityRole="image" accessibilityLabel={card.english} style={{ fontSize: size, lineHeight: size * 1.25 }}>
          {card.emoji}
        </Text>
      ) : (
        <Text importantForAccessibility="no" style={{ fontFamily: fonts.semibold, fontSize: size, lineHeight: size * 1.15, opacity: 0.42, color: colors.onPastel }}>
          {initial(card.german)}
        </Text>
      )}
    </View>
  )
}

/** The German of a card, a noun's article in its colour. Long words hyphenate; `numberOfLines` clamps it in a list. */
export function GermanLine({ card, style, numberOfLines }: { card: Card; style?: StyleProp<TextStyle>; numberOfLines?: number }) {
  const { colors } = useTheme()
  if (card.type === 'word' && card.gender && !isPluralOnly(card)) {
    return (
      <Text style={style} numberOfLines={numberOfLines} {...germanWrap}>
        <Text style={{ color: colors[card.gender] }}>{card.gender}</Text>
        {` ${card.german}`}
      </Text>
    )
  }
  return (
    <Text style={style} numberOfLines={numberOfLines} {...germanWrap}>
      {germanText(card)}
    </Text>
  )
}

const styles = StyleSheet.create({ fill: { width: '100%', height: '100%' } })
