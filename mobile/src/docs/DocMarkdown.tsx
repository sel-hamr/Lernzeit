/*
 * A doc's Markdown in native text styles (see markdown.ts): headings on the type scale, lists
 * with their markers, quotes with a lime edge, code on a raised block that scrolls sideways,
 * tables that scroll sideways, and pictures from this phone (image:<id>) or the web.
 */
import { docImageId } from '@lernzeit/core/docs'
import { Fragment, memo, useMemo, useState } from 'react'
import { Image, Linking, ScrollView, StyleSheet, Text, View, type LayoutChangeEvent, type StyleProp, type TextStyle } from 'react-native'
import { useLiveQuery } from '../store/live'
import { useTheme } from '../theme'
import { parseMarkdown, type MdBlock, type Span } from './markdown'

const HEADING_SIZE = [26, 22, 19, 17, 16, 15]

export const DocMarkdown = memo(function DocMarkdown({ body, hideTitle, onHeading }: { body: string; hideTitle?: boolean; onHeading?: (index: number, y: number) => void }) {
  const { spacing } = useTheme()
  const parsed = useMemo(() => parseMarkdown(body), [body])
  // The doc's own title is already the page's header.
  const blocks = hideTitle && parsed[0]?.type === 'heading' && parsed[0].level === 1 ? parsed.slice(1) : parsed
  const offset = parsed.length - blocks.length
  return (
    <View style={{ gap: spacing.md }}>
      {blocks.map((block, i) => (
        <Block key={i} block={block} onLayout={block.type === 'heading' && onHeading ? (e) => onHeading(i + offset, e.nativeEvent.layout.y) : undefined} />
      ))}
    </View>
  )
})

function Block({ block, onLayout }: { block: MdBlock; onLayout?: (e: LayoutChangeEvent) => void }) {
  const { colors, type, spacing, radius, fonts } = useTheme()
  const body = [type.body, { color: colors.ink, lineHeight: 24 }]
  switch (block.type) {
    case 'heading': {
      const size = HEADING_SIZE[block.level - 1]
      return (
        <View onLayout={onLayout} style={{ paddingTop: block.level <= 2 ? spacing.md : spacing.xs }}>
          <Spans spans={block.spans} style={{ fontFamily: fonts.semibold, fontSize: size, lineHeight: Math.round(size * 1.28), letterSpacing: block.level === 1 ? -0.5 : -0.2, color: colors.ink }} />
          {block.level <= 2 ? <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.line, marginTop: spacing.sm }} /> : null}
        </View>
      )
    }
    case 'paragraph':
      return <Spans spans={block.spans} style={body} />
    case 'list':
      return (
        <View style={{ gap: 6 }}>
          {block.items.map((item, j) => (
            <View key={j} style={[styles.row, { paddingLeft: item.depth * 18, gap: spacing.sm }]}>
              {item.checked !== undefined ? (
                <View style={[styles.box, { borderColor: colors.lineStrong, backgroundColor: item.checked ? colors.accent : 'transparent' }]}>{item.checked ? <Text style={{ fontSize: 11, lineHeight: 13, color: colors.onAccent }}>✓</Text> : null}</View>
              ) : (
                <Text style={[type.body, { color: colors.muted, minWidth: block.ordered ? 20 : 10, lineHeight: 24 }]}>{item.marker}</Text>
              )}
              <Spans spans={item.spans} style={[body, styles.grow, item.checked && { color: colors.muted, textDecorationLine: 'line-through' }]} />
            </View>
          ))}
        </View>
      )
    case 'quote':
      return (
        <View style={{ borderLeftWidth: 3, borderLeftColor: colors.accent, paddingLeft: spacing.md, gap: spacing.sm }}>
          {block.blocks.map((b, j) => (
            <Block key={j} block={b} />
          ))}
        </View>
      )
    case 'code':
      return (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ backgroundColor: colors.raised, borderRadius: radius.row }} contentContainerStyle={{ padding: spacing.md }}>
          <Text selectable style={{ fontFamily: 'monospace', fontSize: 13, lineHeight: 19, color: colors.ink }}>
            {block.text}
          </Text>
        </ScrollView>
      )
    case 'rule':
      return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.lineStrong, marginVertical: spacing.sm }} />
    case 'table':
      return (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ borderRadius: radius.row, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.lineStrong, overflow: 'hidden' }}>
            {[block.header, ...block.rows].map((row, j) => (
              <Fragment key={j}>
                {j > 0 ? <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.line }} /> : null}
                <View style={[styles.tableRow, { backgroundColor: j === 0 ? colors.raised : 'transparent' }]}>
                  {block.header.map((_, k) => (
                    <View key={k} style={[styles.cell, { borderLeftWidth: k ? StyleSheet.hairlineWidth : 0, borderColor: colors.line, padding: spacing.sm }]}>
                      <Spans spans={row[k] ?? []} style={[type.small, { color: colors.ink, fontFamily: j === 0 ? fonts.semibold : fonts.regular }]} />
                    </View>
                  ))}
                </View>
              </Fragment>
            ))}
          </View>
        </ScrollView>
      )
    case 'image':
      return <DocImage src={block.src} alt={block.alt} />
  }
}

function DocImage({ src, alt }: { src: string; alt: string }) {
  const { colors, type, radius } = useTheme()
  const stored = docImageId(src)
  const file = useLiveQuery(['imageFiles'], (l) => (stored ? l.imageFile(stored) : undefined), [stored])
  const [ratio, setRatio] = useState(file ? file.width / Math.max(1, file.height) : 1.6)
  const uri = stored ? file?.path : /^https?:/i.test(src) ? src : undefined
  if (!uri) return <Text style={[type.small, { color: colors.muted }]}>{alt || 'Image'}</Text>
  return (
    <Image
      source={{ uri }}
      accessibilityLabel={alt || 'Image'}
      resizeMode="contain"
      onLoad={(e) => {
        const { width, height } = e.nativeEvent.source
        if (width && height) setRatio(width / height)
      }}
      style={{ width: '100%', aspectRatio: ratio, borderRadius: radius.row, backgroundColor: colors.raised }}
    />
  )
}

/** Styled inline text; links open in the browser. */
function Spans({ spans, style }: { spans: Span[]; style?: StyleProp<TextStyle> }) {
  const { colors, fonts } = useTheme()
  return (
    <Text style={style} selectable>
      {spans.map((s, i) => (
        <Text
          key={i}
          onPress={s.href ? () => void Linking.openURL(s.href!) : undefined}
          accessibilityRole={s.href ? 'link' : undefined}
          style={[
            s.bold && { fontFamily: fonts.semibold },
            s.italic && { fontStyle: 'italic' },
            s.strike && { textDecorationLine: 'line-through' },
            s.code && { fontFamily: 'monospace', fontSize: 13, backgroundColor: colors.raised, color: colors.ink },
            s.href && { color: colors.blueInk, textDecorationLine: 'underline' },
          ]}
        >
          {s.text}
        </Text>
      ))}
    </Text>
  )
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  box: { width: 16, height: 16, borderRadius: 4, borderWidth: 1.5, marginTop: 4, alignItems: 'center', justifyContent: 'center' },
  tableRow: { flexDirection: 'row' },
  cell: { width: 140 },
})
