/*
 * A grammar rule as core parses it (parseRule / parseInline): paragraphs, "- " lists, "| a | b |"
 * tables and "### " headings, with **bold** and *italic* inline. Story notes use the inline part.
 */
import { parseInline, parseRule } from '@lernzeit/core/grammar'
import { Fragment, useMemo } from 'react'
import { ScrollView, StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native'
import { useTheme } from '../theme'

/** Text with **bold** (in the accent ink) and *italic*. */
export function Inline({ text, style }: { text: string; style?: StyleProp<TextStyle> }) {
  const { colors, fonts } = useTheme()
  return (
    <Text style={style}>
      {parseInline(text).map((part, i) => (
        <Text key={i} style={[part.bold && { fontFamily: fonts.semibold, color: colors.accentInk }, part.italic && { fontStyle: 'italic' }]}>
          {part.text}
        </Text>
      ))}
    </Text>
  )
}

export function RuleText({ text }: { text: string }) {
  const { colors, type, spacing, radius, fonts } = useTheme()
  const blocks = useMemo(() => parseRule(text), [text])
  const body = [type.body, { color: colors.ink, lineHeight: 23 }]
  return (
    <View style={{ gap: spacing.md }}>
      {blocks.map((block, i) => {
        if (block.type === 'heading') return <Inline key={i} text={block.text} style={[type.bodyMedium, { color: colors.ink, fontFamily: fonts.semibold, paddingTop: spacing.xs }]} />
        if (block.type === 'paragraph') return <Inline key={i} text={block.text} style={body} />
        if (block.type === 'list')
          return (
            <View key={i} style={{ gap: 6 }}>
              {block.items.map((item, j) => (
                <View key={j} style={[styles.row, { gap: spacing.sm }]}>
                  <View style={[styles.bullet, { backgroundColor: colors.muted }]} />
                  <Inline text={item} style={[body, styles.grow]} />
                </View>
              ))}
            </View>
          )
        return (
          <ScrollView key={i} horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ borderRadius: radius.row, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.lineStrong, overflow: 'hidden', minWidth: '100%' }}>
              {[block.header, ...block.rows].map((row, j) => (
                <Fragment key={j}>
                  {j > 0 ? <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.line }} /> : null}
                  <View style={[styles.tableRow, { backgroundColor: j === 0 ? colors.raised : 'transparent' }]}>
                    {row.map((cell, k) => (
                      <View key={k} style={[styles.cell, { borderLeftWidth: k ? StyleSheet.hairlineWidth : 0, borderColor: colors.line, paddingHorizontal: spacing.md, paddingVertical: spacing.sm }]}>
                        <Inline text={cell} style={[type.small, { color: j === 0 || k === 0 ? colors.ink2 : colors.ink, fontFamily: j === 0 || k === 0 ? fonts.medium : fonts.regular }]} />
                      </View>
                    ))}
                  </View>
                </Fragment>
              ))}
            </View>
          </ScrollView>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  bullet: { width: 5, height: 5, borderRadius: 3, marginTop: 9 },
  tableRow: { flexDirection: 'row' },
  // One width for every column, so the rows line up; a wide table scrolls sideways.
  cell: { width: 128 },
})
