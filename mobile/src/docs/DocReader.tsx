/*
 * Reading a doc, as the web's DocPage: its Markdown rendered, opening where you stopped (the
 * position syncs), a contents sheet when it has headings, pin, move, share the Markdown, edit,
 * delete, and Mark as read.
 */
import { countWords } from '@lernzeit/core/reader'
import { DOC_ROOT, DOC_STATUS_LABEL, docDateLabel, docReadingMinutes, folderPath } from '@lernzeit/core/docs'
import type { Doc } from '@lernzeit/core/types'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Check, ChevronLeft, Ellipsis, FileText, FolderInput, ListTree, Pencil, Pin, PinOff, RotateCcw, Share2, Trash2 } from 'lucide-react-native'
import { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react'
import { ScrollView, Share, StyleSheet, Text, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { FadeInUp, haptics } from '../motion'
import { confirmDelete, notice } from '../notice'
import { useLocalLibrary } from '../store/live'
import { numbers, useTheme } from '../theme'
import { Badge, Button, Card, EmptyState, IconButton, OptionRow, Sheet, Tile } from '../ui'
import { deleteDoc, markDocOpened, moveDoc, setDocPinned, setDocPosition, setDocStatus, useDoc, useDocFolders } from './data'
import { DocMarkdown } from './DocMarkdown'
import { FolderPicker } from './DocsScreen'
import { docHeadings, parseMarkdown } from './markdown'

const POSITION_SAVE_MS = 700
const MIN_CONTENTS = 3

export function DocReaderPage() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const doc = useDoc(String(id))
  const { colors, spacing } = useTheme()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  if (!doc) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.canvas, paddingTop: insets.top + spacing.xxl, paddingHorizontal: spacing.pageX }}>
        <EmptyState icon={FileText} title="This doc is not here" body="It may have been deleted." action={<Button label="All docs" onPress={() => router.back()} />} />
      </View>
    )
  }
  return <Reader key={doc.id} doc={doc} />
}

function Reader({ doc }: { doc: Doc }) {
  const { colors, type, spacing } = useTheme()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const library = useLocalLibrary()
  const folders = useDocFolders()
  const [menu, setMenu] = useState(false)
  const [contents, setContents] = useState(false)
  const [moving, setMoving] = useState(false)
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null)
  const headingY = useRef(new Map<number, number>())
  const bodyY = useRef(0)
  const restored = useRef(false)
  const viewport = useRef(600)
  const [start] = useState(doc.position ?? 0)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const headings = useMemo(() => docHeadings(parseMarkdown(doc.body)), [doc.body])
  const words = useMemo(() => countWords(doc.body), [doc.body])
  const isRead = doc.status === 'read'
  const path = folderPath(folders, doc.folderId)

  useEffect(() => markDocOpened(library, doc.id), [library, doc.id])
  useEffect(() => () => clearTimeout(timer.current), [])

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent
    const height = contentSize.height - layoutMeasurement.height
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      if (height > 0) setDocPosition(library, doc.id, contentOffset.y / height)
    }, POSITION_SAVE_MS)
  }

  const share = () => void Share.share({ message: doc.body, title: doc.title }).catch(() => {})
  const remove = () =>
    confirmDelete(`Delete "${doc.title}"?`, 'This cannot be undone.', () => {
      deleteDoc(library, doc.id)
      router.back()
      notice('Doc deleted')
    })
  const toggleRead = () => {
    setDocStatus(library, doc.id, isRead ? 'toRead' : 'read')
    if (!isRead) haptics.success()
  }

  const actions = [
    { label: 'Edit', icon: Pencil, run: () => router.push({ pathname: '/doc/edit', params: { id: doc.id } }) },
    ...(headings.length >= MIN_CONTENTS ? [{ label: 'Contents', icon: ListTree, run: () => setContents(true) }] : []),
    { label: 'Move', icon: FolderInput, run: () => setMoving(true) },
    { label: 'Share the Markdown', icon: Share2, run: share },
    { label: 'Delete', icon: Trash2, run: remove },
  ]

  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas, paddingTop: insets.top }}>
      <View style={[styles.header, { paddingHorizontal: spacing.pageX - 4, gap: spacing.sm }]}>
        <IconButton icon={ChevronLeft} label="Back" iconSize={22} onPress={() => (router.canGoBack() ? router.back() : router.replace('/more/docs'))} />
        <Text style={[type.small, styles.grow, { color: colors.muted }]} numberOfLines={1}>
          {path || 'Docs'}
        </Text>
        <IconButton icon={doc.pinned ? PinOff : Pin} label={doc.pinned ? 'Unpin' : 'Pin'} selected={doc.pinned} variant={doc.pinned ? 'accent' : 'card'} haptic="select" onPress={() => setDocPinned(library, doc.id, !doc.pinned)} />
        <IconButton icon={Ellipsis} label="Doc options" onPress={() => setMenu(true)} />
      </View>
      <ScrollView
        ref={scroll}
        onScroll={onScroll}
        onLayout={(e) => (viewport.current = e.nativeEvent.layout.height)}
        scrollEventThrottle={200}
        onContentSizeChange={(_, h) => {
          if (restored.current || !start) return
          restored.current = true
          // Back to where you stopped, once the text has its height.
          requestAnimationFrame(() => scroll.current?.scrollTo({ y: Math.max(0, start * (h - viewport.current)), animated: false }))
        }}
        contentContainerStyle={{ paddingHorizontal: spacing.pageX, paddingTop: spacing.sm, paddingBottom: spacing.xl, gap: spacing.cardGap }}
      >
        <FadeInUp index={0} style={{ gap: spacing.sm, paddingHorizontal: 4 }}>
          <Text style={[type.title, { color: colors.ink }]} accessibilityRole="header">
            {doc.title}
          </Text>
          <View style={[styles.row, { gap: spacing.xs, flexWrap: 'wrap' }]}>
            <Badge label={DOC_STATUS_LABEL[doc.status]} tone={isRead ? 'neutral' : 'accent'} />
            {doc.tags.map((t) => (
              <Badge key={t} label={`#${t}`} tone="neutral" />
            ))}
            <Text style={[type.small, numbers, { color: colors.muted, marginLeft: spacing.xs }]}>{`${docReadingMinutes(words)} min · updated ${docDateLabel(doc.updatedAt).toLowerCase()}`}</Text>
          </View>
        </FadeInUp>
        <View onLayout={(e) => (bodyY.current = e.nativeEvent.layout.y + spacing.xxl)}>
          <FadeInUp index={1}>
            <Card style={{ paddingVertical: spacing.xxl }}>
              <DocMarkdown body={doc.body} hideTitle onHeading={(i, y) => headingY.current.set(i, y)} />
            </Card>
          </FadeInUp>
        </View>
      </ScrollView>
      <View style={[styles.row, { paddingHorizontal: spacing.pageX, paddingTop: spacing.sm, paddingBottom: insets.bottom + spacing.md, gap: spacing.sm }]}>
        <Button label={isRead ? 'Mark to read' : 'Mark as read'} variant={isRead ? 'soft' : 'primary'} size="lg" icon={isRead ? <RotateCcw size={16} strokeWidth={1.9} color={colors.ink} /> : <Check size={17} strokeWidth={2.2} color={colors.onPrimary} />} onPress={toggleRead} style={styles.grow} />
        <Button label="Edit" variant="soft" size="lg" icon={<Pencil size={16} strokeWidth={1.9} color={colors.ink} />} onPress={() => router.push({ pathname: '/doc/edit', params: { id: doc.id } })} />
      </View>

      <Sheet open={menu} onClose={() => setMenu(false)} title={doc.title}>
        {actions.map(({ label, icon: Icon, run }) => (
          <OptionRow
            key={label}
            label={label}
            icon={
              <Tile bg={label === 'Delete' ? colors.dangerSoft : colors.raised}>
                <Icon size={19} strokeWidth={1.8} color={label === 'Delete' ? colors.dangerInk : colors.ink} />
              </Tile>
            }
            onPress={() => {
              setMenu(false)
              run()
            }}
          />
        ))}
      </Sheet>
      <Sheet open={contents} onClose={() => setContents(false)} title="Contents">
        {headings.map((h) => (
          <OptionRow
            key={h.index}
            label={`${'   '.repeat(Math.max(0, h.level - Math.min(...headings.map((x) => x.level))))}${h.text}`}
            onPress={() => {
              setContents(false)
              const y = headingY.current.get(h.index)
              if (y !== undefined) scroll.current?.scrollTo({ y: Math.max(0, y + bodyY.current - spacing.md), animated: true })
            }}
          />
        ))}
      </Sheet>
      <FolderPicker
        open={moving}
        title="Move to"
        folders={folders}
        current={doc.folderId ?? DOC_ROOT}
        onClose={() => setMoving(false)}
        onPick={(id) => {
          moveDoc(library, doc.id, id)
          setMoving(false)
          notice('Doc moved')
        }}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center' },
  header: { height: 64, flexDirection: 'row', alignItems: 'center' },
})
