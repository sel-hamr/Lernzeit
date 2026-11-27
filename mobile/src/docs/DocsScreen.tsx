/*
 * Docs, as the web's library: Markdown saved to read later, in folders. The top level shows what
 * you were reading and what is pinned; search, the status and a tag look through this folder and
 * its subfolders. A folder can be renamed, moved and deleted with everything inside it.
 */
import { countWords } from '@lernzeit/core/reader'
import { DOC_ROOT, DOC_STATUS_LABEL, docDateLabel, docExcerpt, docReadingMinutes, filterDocs, folderChoices, folderPath, folderSubtree, folderTrail } from '@lernzeit/core/docs'
import { count } from '@lernzeit/core/text'
import type { Doc, DocFolder, DocStatus } from '@lernzeit/core/types'
import { useRouter } from 'expo-router'
import { Ellipsis, FileText, Folder, FolderInput, FolderPlus, Pencil, Pin, Plus, Search, SearchX, Trash2, X } from 'lucide-react-native'
import { useMemo, useState } from 'react'
import { StyleSheet, Text, TextInput, View } from 'react-native'
import { Screen } from '../components/Screen'
import { FadeInUp, Pressable } from '../motion'
import { confirmDelete, notice } from '../notice'
import { useLocalLibrary } from '../store/live'
import { useTheme } from '../theme'
import { Badge, Button, Chip, ChipRow, EmptyState, Field, GroupedList, IconButton, OptionRow, Row, SectionHeader, Sheet, Tile } from '../ui'
import { countDocFolder, createDocFolder, deleteDocFolder, moveDocFolder, renameDocFolder, useDocFolders, useDocs } from './data'

const CONTINUE_TILES = 3
type StatusFilter = DocStatus | 'all'

export function DocsScreen({ folderId }: { folderId?: string }) {
  const { colors, type, spacing, radius } = useTheme()
  const router = useRouter()
  const library = useLocalLibrary()
  const docs = useDocs()
  const folders = useDocFolders()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [tag, setTag] = useState<string>()
  const [menu, setMenu] = useState(false)
  const [naming, setNaming] = useState<'new' | 'rename' | null>(null)
  const [moving, setMoving] = useState(false)
  const currentId = folderId ?? DOC_ROOT
  const folder = folders.find((f) => f.id === folderId)

  const scope = useMemo(() => {
    if (!folderId) return docs
    const ids = folderSubtree(folders, folderId)
    return docs.filter((d) => ids.has(d.folderId))
  }, [docs, folders, folderId])
  const tags = useMemo(() => [...new Set(scope.flatMap((d) => d.tags))].sort((a, b) => a.localeCompare(b)), [scope])

  if (folderId && !folder) {
    return (
      <Screen title="Docs">
        <EmptyState icon={Folder} title="This folder is gone" body="It may have been deleted." action={<Button label="All docs" onPress={() => router.back()} />} />
      </Screen>
    )
  }

  const activeTag = tag && tags.includes(tag) ? tag : undefined
  const filtering = !!query.trim() || status !== 'all' || !!activeTag
  const results = filtering ? filterDocs(scope, { query, status: status === 'all' ? undefined : status, tag: activeTag }) : []
  const subfolders = folders.filter((f) => f.parentId === currentId)
  const here = docs.filter((d) => d.folderId === currentId).sort((a, b) => Number(b.pinned) - Number(a.pinned) || a.title.localeCompare(b.title))
  const pinned = docs.filter((d) => d.pinned)
  const opened = docs.filter((d) => d.openedAt && !d.pinned).sort((a, b) => (b.openedAt ?? 0) - (a.openedAt ?? 0))
  const tiles = folderId ? [] : [...pinned, ...opened].slice(0, Math.max(CONTINUE_TILES, pinned.length))
  const itemsIn = (id: string) => folders.filter((f) => f.parentId === id).length + docs.filter((d) => d.folderId === id).length
  const parent = folder && folderTrail(folders, folder.parentId).at(-1)
  const openDoc = (d: Doc) => router.push(`/doc/${d.id}`)
  const newDoc = () => router.push({ pathname: '/doc/edit', params: { folder: currentId } })

  const removeFolder = () => {
    if (!folder) return
    const inside = countDocFolder(library, folder.id)
    const parts = [count(inside.docs, 'doc'), ...(inside.folders > 1 ? [count(inside.folders - 1, 'subfolder')] : [])]
    confirmDelete(`Delete "${folder.name}"?`, `This also deletes the ${parts.join(' and ')} inside it. This cannot be undone.`, () => {
      deleteDocFolder(library, folder.id)
      if (parent) router.replace(`/docs/${parent.id}`)
      else router.back()
      notice('Folder deleted')
    })
  }

  const right = (
    <View style={[styles.row, { gap: spacing.sm }]}>
      <IconButton icon={Plus} label="New doc" onPress={newDoc} />
      <IconButton icon={Ellipsis} label="More" onPress={() => setMenu(true)} />
    </View>
  )

  return (
    <Screen title={folder?.name ?? 'Docs'} right={right}>
      <FadeInUp index={0} style={{ gap: spacing.md }}>
        <View style={[styles.row, styles.search, { backgroundColor: colors.card, borderRadius: radius.row, paddingHorizontal: spacing.lg, gap: spacing.sm }]}>
          <Search size={18} strokeWidth={1.8} color={colors.muted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={folder ? `Search ${folder.name}` : 'Search docs'}
            placeholderTextColor={colors.muted}
            accessibilityLabel="Search docs"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            selectionColor={colors.ink}
            cursorColor={colors.ink}
            style={[type.body, styles.grow, { color: colors.ink, paddingVertical: 0 }]}
          />
          {query ? (
            <Pressable onPress={() => setQuery('')} scaleTo={0.85} accessibilityRole="button" accessibilityLabel="Clear the search" hitSlop={12}>
              <X size={18} strokeWidth={1.8} color={colors.muted} />
            </Pressable>
          ) : null}
        </View>
        <ChipRow>
          {(['all', 'toRead', 'read'] as const).map((s) => (
            <Chip key={s} label={s === 'all' ? 'All' : DOC_STATUS_LABEL[s]} selected={status === s} onPress={() => setStatus(s)} />
          ))}
          {tags.slice(0, 8).map((t) => (
            <Chip key={t} label={`#${t}`} selected={activeTag === t} onPress={() => setTag(activeTag === t ? undefined : t)} />
          ))}
        </ChipRow>
      </FadeInUp>

      {filtering ? (
        results.length ? (
          <FadeInUp index={1}>
            <GroupedList>
              {results.map((d) => (
                <DocRow key={d.id} doc={d} path={folderPath(folders, d.folderId)} onPress={() => openDoc(d)} />
              ))}
            </GroupedList>
          </FadeInUp>
        ) : (
          <EmptyState icon={SearchX} title="No docs match" body="Try another word, status or tag." />
        )
      ) : !subfolders.length && !here.length ? (
        <FadeInUp index={1}>
          <EmptyState
            icon={FileText}
            title={folder ? 'This folder is empty' : 'No docs yet'}
            body="Save Markdown here and read it like a README: notes, articles, lists. Claude can save docs for you too."
            action={<Button label="New doc" icon={<Plus size={16} strokeWidth={2} color={colors.onPrimary} />} onPress={newDoc} />}
          />
        </FadeInUp>
      ) : (
        <>
          {tiles.length ? (
            <FadeInUp index={1} style={{ gap: spacing.sm }}>
              <SectionHeader title="Continue reading" />
              <GroupedList animate>
                {tiles.map((d) => (
                  <DocRow key={d.id} doc={d} path={folderPath(folders, d.folderId)} onPress={() => openDoc(d)} />
                ))}
              </GroupedList>
            </FadeInUp>
          ) : null}
          {subfolders.length ? (
            <FadeInUp index={2} style={{ gap: spacing.sm }}>
              <SectionHeader title="Folders" detail={String(subfolders.length)} />
              <GroupedList animate>
                {subfolders.map((f) => (
                  <Row
                    key={f.id}
                    chevron
                    onPress={() => router.push(`/docs/${f.id}`)}
                    left={
                      <Tile bg={colors.accentSoft}>
                        <Folder size={19} strokeWidth={1.8} color={colors.accentInk} />
                      </Tile>
                    }
                    title={f.name}
                    subtitle={count(itemsIn(f.id), 'item')}
                  />
                ))}
              </GroupedList>
            </FadeInUp>
          ) : null}
          {here.length ? (
            <FadeInUp index={3} style={{ gap: spacing.sm }}>
              <SectionHeader title={folder ? 'Docs' : 'All at the top'} detail={String(here.length)} />
              <GroupedList animate>
                {here.map((d) => (
                  <DocRow key={d.id} doc={d} onPress={() => openDoc(d)} />
                ))}
              </GroupedList>
            </FadeInUp>
          ) : null}
        </>
      )}

      <Sheet open={menu} onClose={() => setMenu(false)} title={folder?.name ?? 'Docs'}>
        {[
          { label: 'New folder', icon: FolderPlus, run: () => setNaming('new') },
          ...(folder
            ? [
                { label: 'Rename folder', icon: Pencil, run: () => setNaming('rename') },
                { label: 'Move folder', icon: FolderInput, run: () => setMoving(true) },
                { label: 'Delete folder', icon: Trash2, run: removeFolder },
              ]
            : []),
        ].map(({ label, icon: Icon, run }) => (
          <OptionRow
            key={label}
            label={label}
            icon={
              <Tile bg={colors.raised}>
                <Icon size={19} strokeWidth={1.8} color={colors.ink} />
              </Tile>
            }
            onPress={() => {
              setMenu(false)
              run()
            }}
          />
        ))}
      </Sheet>
      <NameSheet
        open={!!naming}
        title={naming === 'rename' ? 'Rename folder' : 'New folder'}
        initial={naming === 'rename' ? (folder?.name ?? '') : ''}
        onClose={() => setNaming(null)}
        onSave={(name) => {
          try {
            if (naming === 'rename' && folder) renameDocFolder(library, folder.id, name)
            else {
              const made = createDocFolder(library, name, currentId)
              router.push(`/docs/${made.id}`)
            }
            setNaming(null)
          } catch (err) {
            notice(err instanceof Error ? err.message : 'Could not save the folder')
          }
        }}
      />
      {folder ? (
        <FolderPicker
          open={moving}
          title="Move folder to"
          folders={folders}
          without={folder.id}
          current={folder.parentId}
          onClose={() => setMoving(false)}
          onPick={(id) => {
            try {
              moveDocFolder(library, folder.id, id)
              setMoving(false)
            } catch (err) {
              notice(err instanceof Error ? err.message : 'Could not move the folder')
            }
          }}
        />
      ) : null}
    </Screen>
  )
}

export function DocRow({ doc, path, onPress }: { doc: Doc; path?: string; onPress: () => void }) {
  const { colors, type, spacing } = useTheme()
  return (
    <Pressable onPress={onPress} scaleTo={0.98} accessibilityRole="button" accessibilityLabel={`${doc.title}, ${DOC_STATUS_LABEL[doc.status]}`} style={{ paddingVertical: spacing.md, gap: 4 }}>
      <View style={[styles.row, { gap: spacing.sm }]}>
        <Text style={[type.bodyMedium, styles.grow, { color: colors.ink }]} numberOfLines={1}>
          {doc.title}
        </Text>
        {doc.pinned ? <Pin size={14} strokeWidth={1.8} color={colors.muted} /> : null}
        <Badge label={DOC_STATUS_LABEL[doc.status]} tone={doc.status === 'read' ? 'neutral' : 'accent'} />
      </View>
      <Text style={[type.small, { color: colors.muted }]} numberOfLines={2}>
        {docExcerpt(doc.body)}
      </Text>
      <Text style={[type.chip, { color: colors.muted }]} numberOfLines={1}>
        {[path || docDateLabel(doc.updatedAt), `${docReadingMinutes(countWords(doc.body))} min`, ...doc.tags.slice(0, 2).map((t) => `#${t}`)].join(' · ')}
      </Text>
    </Pressable>
  )
}

export function NameSheet({ open, title, initial, onClose, onSave }: { open: boolean; title: string; initial: string; onClose: () => void; onSave: (name: string) => void }) {
  const { spacing } = useTheme()
  const [name, setName] = useState(initial)
  const [seen, setSeen] = useState(open)
  // A fresh name each time it opens.
  if (open !== seen) {
    setSeen(open)
    if (open) setName(initial)
  }
  return (
    <Sheet open={open} onClose={onClose} title={title} footer={<Button label="Save" disabled={!name.trim()} onPress={() => onSave(name)} haptic="tap" />}>
      <View style={{ paddingHorizontal: spacing.md }}>
        <Field label="Name" value={name} onChangeText={setName} autoFocus onSubmitEditing={() => name.trim() && onSave(name)} />
      </View>
    </Sheet>
  )
}

/** Picks a folder (or the top level) from every folder's path. */
export function FolderPicker({ open, title, folders, without, current, onClose, onPick }: { open: boolean; title: string; folders: DocFolder[]; without?: string; current: string; onClose: () => void; onPick: (id: string) => void }) {
  const choices = [{ id: DOC_ROOT, path: 'Docs (top level)' }, ...folderChoices(folders, without)]
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      {choices.map((c) => (
        <OptionRow key={c.id} label={c.path} selected={c.id === current} onPress={() => onPick(c.id)} />
      ))}
    </Sheet>
  )
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center' },
  search: { height: 48 },
})
