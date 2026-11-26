/*
 * Small pieces the story list and reader share: the cover tile, the coverage bar and its legend,
 * and the colours a word takes for how well you know it.
 */
import { pastelIndex } from '@lernzeit/core/today'
import type { Coverage, WordStatus } from '@lernzeit/core/reader'
import type { Story } from '@lernzeit/core/types'
import { StyleSheet, Text, View } from 'react-native'
import { numbers, useTheme, type Theme } from '../theme'
import { COVERAGE_PARTS, percent } from './model'

/** A story's cover: its first letter on a soft pastel, with the level in the corner. */
export function StoryCover({ story, initial, size = 76 }: { story: Pick<Story, 'id' | 'level'>; initial: string; size?: number }) {
  const { pastels, colors, fonts } = useTheme()
  return (
    <View style={[styles.cover, { width: size, height: size * 1.18, borderRadius: size * 0.26, backgroundColor: pastels[pastelIndex(story.id)] }]}>
      <Text style={{ fontFamily: fonts.semibold, fontSize: size * 0.5, lineHeight: size * 0.6, letterSpacing: -1, color: colors.onPastel }}>{initial}</Text>
      {story.level ? (
        <View style={[styles.level, { backgroundColor: 'rgba(255,255,255,0.72)' }]}>
          <Text style={{ fontFamily: fonts.semibold, fontSize: 11, lineHeight: 14, color: colors.onPastel }}>{story.level}</Text>
        </View>
      ) : null}
    </View>
  )
}

export function statusColor(status: WordStatus, theme: Theme): string {
  const { colors, topics } = theme
  return { known: colors.heat[4], learning: colors.accent, new: topics.sand.bar, unknown: colors.track }[status]
}

/** One stacked bar: known, learning, new, not in your decks. */
export function CoverageBar({ coverage, height = 8 }: { coverage: Coverage; height?: number }) {
  const theme = useTheme()
  const label = COVERAGE_PARTS.map((p) => `${p.label} ${percent(coverage[p.status], coverage.words)}%`).join(', ')
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={label} style={[styles.bar, { height, borderRadius: height / 2, backgroundColor: theme.colors.track }]}>
      {COVERAGE_PARTS.map((p) => (coverage[p.status] ? <View key={p.status} style={{ flex: coverage[p.status], backgroundColor: statusColor(p.status, theme) }} /> : null))}
    </View>
  )
}

export function CoverageLegend({ coverage }: { coverage: Coverage }) {
  const theme = useTheme()
  const { colors, type, spacing } = theme
  return (
    <View style={[styles.legend, { columnGap: spacing.lg, rowGap: spacing.xs }]}>
      {COVERAGE_PARTS.map((p) => (
        <View key={p.status} style={[styles.row, { gap: 6 }]}>
          <View style={[styles.dot, { backgroundColor: statusColor(p.status, theme), borderColor: colors.lineStrong, borderWidth: p.status === 'unknown' ? 1 : 0 }]} />
          <Text style={[type.chip, { color: colors.muted }]}>{p.label}</Text>
          <Text style={[type.chip, numbers, { color: colors.ink }]}>{`${percent(coverage[p.status], coverage.words)}%`}</Text>
        </View>
      ))}
    </View>
  )
}

/** How a word looks in the text for its status: a soft fill and an underline. */
export function wordLook(status: WordStatus, theme: Theme): { backgroundColor?: string; textDecorationLine?: 'underline'; textDecorationColor?: string } {
  const { colors, topics } = theme
  if (status === 'new') return { backgroundColor: topics.sand.soft, textDecorationLine: 'underline', textDecorationColor: topics.sand.dot }
  if (status === 'learning') return { backgroundColor: colors.accentSoft, textDecorationLine: 'underline', textDecorationColor: colors.heat[3] }
  if (status === 'known') return { textDecorationLine: 'underline', textDecorationColor: colors.heat[4] }
  return {}
}

const styles = StyleSheet.create({
  cover: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  level: { position: 'absolute', left: 6, bottom: 6, borderRadius: 999, paddingHorizontal: 6, paddingVertical: 1 },
  bar: { flexDirection: 'row', overflow: 'hidden' },
  legend: { flexDirection: 'row', flexWrap: 'wrap' },
  row: { flexDirection: 'row', alignItems: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4 },
})
