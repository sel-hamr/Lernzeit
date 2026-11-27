import { StyleSheet, useWindowDimensions, View } from 'react-native'
import { Skeleton, SkeletonBlock } from '../motion'
import { useTheme } from '../theme'

/*
 * Stand-ins for the first sync, shaped like what arrives: the reads are local and instant, so these
 * show only while a new phone's library is still coming down (see `useFirstSync`).
 */

/** Today's deck carousel: two deck cards, the second peeking in. */
export function DeckCarouselSkeleton() {
  const { colors, spacing, radius, shadow } = useTheme()
  const { width } = useWindowDimensions()
  const card = Math.round(width * 0.85)
  return (
    <Skeleton testID="decks-loading" label="Loading your decks" style={[styles.row, { gap: spacing.md, marginHorizontal: -spacing.pageX, paddingHorizontal: spacing.pageX, paddingVertical: 6, overflow: 'hidden' }]}>
      {[0, 1].map((i) => (
        <View key={i} style={[{ width: card, height: 150, borderRadius: radius.block + 4, backgroundColor: colors.card, padding: spacing.lg, justifyContent: 'space-between' }, shadow.card]}>
          <SkeletonBlock width={44} height={44} radius={15} />
          <View style={{ gap: spacing.sm }}>
            <SkeletonBlock width="60%" height={16} radius={8} />
            <SkeletonBlock width="40%" height={12} radius={6} />
          </View>
        </View>
      ))}
    </Skeleton>
  )
}

/** The Cards list: a white group of rows with a picture and two lines each. */
export function CardListSkeleton({ rows = 6 }: { rows?: number }) {
  const { colors, spacing, radius, shadow } = useTheme()
  return (
    <Skeleton testID="cards-loading" label="Loading your cards" style={[{ backgroundColor: colors.card, borderRadius: radius.block + 4, paddingHorizontal: spacing.md, paddingVertical: spacing.xs }, shadow.card]}>
      {Array.from({ length: rows }, (_, i) => (
        <View key={i} style={[styles.row, { gap: spacing.md, paddingVertical: 10 }]}>
          <SkeletonBlock width={52} height={52} radius={14} />
          <View style={{ flex: 1, gap: spacing.sm }}>
            <SkeletonBlock width={`${70 - (i % 3) * 12}%`} height={14} radius={7} />
            <SkeletonBlock width={`${45 - (i % 2) * 10}%`} height={12} radius={6} />
          </View>
        </View>
      ))}
    </Skeleton>
  )
}

/** The Stories list: tiles with a cover and a few lines. */
export function StoryListSkeleton({ tiles = 3 }: { tiles?: number }) {
  const { colors, spacing, radius, shadow } = useTheme()
  return (
    <Skeleton testID="stories-loading" label="Loading your stories" style={{ gap: spacing.cardGap }}>
      {Array.from({ length: tiles }, (_, i) => (
        <View key={i} style={[styles.row, { alignItems: 'stretch', backgroundColor: colors.card, borderRadius: radius.block, padding: spacing.md, gap: spacing.md }, shadow.card]}>
          <SkeletonBlock width={76} height={90} radius={20} />
          <View style={{ flex: 1, gap: spacing.sm, paddingVertical: spacing.xs }}>
            <SkeletonBlock width="70%" height={16} radius={8} />
            <SkeletonBlock width="95%" height={12} radius={6} />
            <SkeletonBlock width="80%" height={12} radius={6} />
            <View style={{ flex: 1 }} />
            <SkeletonBlock width="100%" height={5} radius={3} />
          </View>
        </View>
      ))}
    </Skeleton>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
})
