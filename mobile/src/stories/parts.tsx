/*
 * Small pieces the story list and reader share: the cover tile, the coverage bar and its legend,
 * the coverage card and the mark a word takes for how well you know it.
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
          <Text style={{ fontFamily: fonts.semibold, fontSize: 12, lineHeight: 16, color: colors.onPastel }}>{story.level}</Text>
        </View>
      ) : null}
    </View>
  )
}

export function statusColor(status: WordStatus, theme: Theme): string {
  const { colors, topics } = theme
  return { known: colors.heat[4], learning: colors.accent, new: topics.sand.bar, unknown: colors.lineStrong }[status]
}

/**
 * One bar in rounded segments with small gaps: known, learning, new, not in your decks. A part
 * with any words keeps at least a dot's width, so 2 % still shows.
 */
export function CoverageBar({ coverage, height = 8 }: { coverage: Coverage; height?: number }) {
  const theme = useTheme()
  const label = COVERAGE_PARTS.map((p) => `${p.label} ${percent(coverage[p.status], coverage.words)}%`).join(', ')
  const parts = COVERAGE_PARTS.filter((p) => coverage[p.status] > 0)
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={label} style={[styles.bar, { height, gap: height >= 8 ? 3 : 2 }]}>
      {parts.length === 0 ? <View style={{ flex: 1, borderRadius: height / 2, backgroundColor: theme.colors.track }} /> : null}
      {parts.map((p) => (
        <View key={p.status} style={{ flex: coverage[p.status], minWidth: height, borderRadius: height / 2, backgroundColor: p.status === 'unknown' ? theme.colors.track : statusColor(p.status, theme) }} />
      ))}
    </View>
  )
}

/** The legend as a 2 x 2 grid: a dot, the part's name and its share in tabular figures. */
export function CoverageLegend({ coverage }: { coverage: Coverage }) {
  const theme = useTheme()
  const { colors, type, spacing } = theme
  return (
    <View style={[styles.legend, { rowGap: spacing.sm, columnGap: spacing.xl }]}>
      {COVERAGE_PARTS.map((p) => (
        <View key={p.status} style={[styles.row, styles.cell, { gap: spacing.sm }]}>
          <View style={[styles.dot, { backgroundColor: p.status === 'unknown' ? colors.track : statusColor(p.status, theme), borderColor: colors.lineStrong, borderWidth: p.status === 'unknown' ? 1 : 0 }]} />
          <Text style={[type.small, { color: colors.muted, flex: 1 }]} numberOfLines={1}>
            {p.status === 'unknown' ? 'Not in decks' : p.label}
          </Text>
          <Text style={[type.small, numbers, { color: colors.ink }]}>{`${percent(coverage[p.status], coverage.words)}%`}</Text>
        </View>
      ))}
    </View>
  )
}

/** The reader's summary of a story's words: the share you know, the segmented bar, the legend and the advice. */
export function CoverageCard({ coverage, level }: { coverage: Coverage; level: { label: string; tone: 'lime' | 'accent' | 'neutral' | 'danger' } | null }) {
  const theme = useTheme()
  const { colors, type, spacing, radius, fonts } = theme
  const familiar = percent(coverage.known + coverage.learning, coverage.words)
  const inDecks = percent(coverage.words - coverage.unknown, coverage.words)
  const tone = level ? { lime: { bg: colors.accent, fg: colors.onAccent }, accent: { bg: colors.accentSoft, fg: colors.accentInk }, neutral: { bg: colors.chip, fg: colors.ink2 }, danger: { bg: colors.dangerSoft, fg: colors.dangerInk } }[level.tone] : null
  return (
    <View testID="story-coverage" style={{ backgroundColor: colors.raised, borderRadius: radius.block + 4, padding: spacing.xl, gap: spacing.lg }}>
      <View style={{ gap: 2 }}>
        <Text style={[type.small, { color: colors.muted }]}>Your words</Text>
        <View style={[styles.row, { alignItems: 'baseline', gap: spacing.sm }]}>
          <Text style={[type.hero, { color: colors.ink }]}>{`${familiar}%`}</Text>
          <Text style={[type.small, { color: colors.muted, flex: 1 }]} numberOfLines={2}>
            {`known or learning · ${inDecks}% in your decks`}
          </Text>
        </View>
      </View>
      <CoverageBar coverage={coverage} height={10} />
      <CoverageLegend coverage={coverage} />
      {level && tone ? (
        <View style={[styles.advice, { backgroundColor: tone.bg, borderRadius: radius.pill }]}>
          <Text style={{ fontFamily: fonts.semibold, fontSize: 14, lineHeight: 19, color: tone.fg }}>{level.label}</Text>
        </View>
      ) : null}
    </View>
  )
}

/** The mark under a word for its status: a lime line while learning, sand when new, dots when not in a deck, nothing when known. */
export function markFor(status: WordStatus, theme: Theme): { color: string; dotted?: boolean } | null {
  const { colors, topics, scheme } = theme
  if (status === 'learning') return { color: scheme === 'dark' ? colors.accent : colors.heat[3] }
  if (status === 'new') return { color: topics.sand.dot }
  if (status === 'unknown') return { color: colors.muted, dotted: true }
  return null
}

/** The underline itself, laid under a word's box. */
export function WordMark({ status }: { status: WordStatus }) {
  const theme = useTheme()
  const mark = markFor(status, theme)
  if (!mark) return null
  return mark.dotted ? (
    <View pointerEvents="none" style={[styles.mark, { height: 2, borderWidth: 1, borderStyle: 'dotted', borderColor: mark.color, opacity: 0.8 }]} />
  ) : (
    <View pointerEvents="none" style={[styles.mark, { height: 2, backgroundColor: mark.color }]} />
  )
}

const styles = StyleSheet.create({
  cover: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  level: { position: 'absolute', left: 6, bottom: 6, borderRadius: 999, paddingHorizontal: 6, paddingVertical: 1 },
  bar: { flexDirection: 'row', overflow: 'hidden' },
  legend: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: '46%', flexGrow: 1 },
  advice: { height: 40, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  mark: { position: 'absolute', left: 0, right: 0, bottom: 1, borderRadius: 1 },
  row: { flexDirection: 'row', alignItems: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4 },
})
