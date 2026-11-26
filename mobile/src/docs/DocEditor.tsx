/*
 * Write or edit a doc (the web's DocEditor): the title (filled in from the first # heading when
 * left blank), its folder, the Markdown with a preview, and tags. Pasting pictures is the web's;
 * a picture already in a doc stays and shows here.
 */
import { DOC_ROOT, folderPath, parseTags } from '@lernzeit/core/docs'
import type { Doc } from '@lernzeit/core/types'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Trash2 } from 'lucide-react-native'
import { useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { Screen } from '../components/Screen'
import { FadeInUp } from '../motion'
import { confirmDelete, notice } from '../notice'
import { useLocalLibrary } from '../store/live'
import { useTheme } from '../theme'
import { Button, Card, Chip, EmptyState, Field, SelectRow } from '../ui'
import { deleteDoc, saveDoc, useDoc, useDocFolders } from './data'
import { DocMarkdown } from './DocMarkdown'

export function DocEditorPage() {
  const { id, folder } = useLocalSearchParams<{ id?: string; folder?: string }>()
  const doc = useDoc(String(id ?? ''))
  return <DocEditor key={doc?.id ?? 'new'} doc={doc} folder={folder} />
}

function DocEditor({ doc, folder }: { doc?: Doc; folder?: string }) {
  const { colors, spacing } = useTheme()
  const router = useRouter()
  const library = useLocalLibrary()
  const folders = useDocFolders()
  const [title, setTitle] = useState(doc?.title ?? '')
  const [body, setBody] = useState(doc?.body ?? '')
  const [folderId, setFolderId] = useState(doc?.folderId ?? (folder && folders.some((f) => f.id === folder) ? folder : DOC_ROOT))
  const [tags, setTags] = useState(doc?.tags.join(', ') ?? '')
  const [preview, setPreview] = useState(false)

  const save = () => {
    if (!body.trim()) return
    try {
      const saved = saveDoc(library, { title, body, folderId, tags: parseTags(tags) }, doc?.id)
      if (doc) router.back()
      else router.replace(`/doc/${saved.id}`)
    } catch (err) {
      notice(err instanceof Error ? err.message : 'Could not save the doc')
    }
  }
  const remove = () =>
    confirmDelete(`Delete "${doc?.title}"?`, 'This cannot be undone.', () => {
      if (doc) deleteDoc(library, doc.id)
      router.dismissTo('/more/docs')
    })

  return (
    <Screen
      title={doc ? 'Edit doc' : 'New doc'}
      footer={
        <View style={[styles.row, { gap: spacing.sm }]}>
          {doc ? <Button label="Delete" variant="danger" icon={<Trash2 size={16} color={colors.dangerInk} />} onPress={remove} /> : null}
          <Button label="Save doc" size="lg" disabled={!body.trim()} onPress={save} haptic="tap" style={styles.grow} />
        </View>
      }
    >
      <FadeInUp index={0}>
        <Card style={{ gap: spacing.md }}>
          <Field label="Title (filled in from the first # heading)" value={title} onChangeText={setTitle} />
          <SelectRow label="Folder" value={folderId} options={[{ value: DOC_ROOT, label: 'Docs (top level)' }, ...folders.map((f) => ({ value: f.id, label: folderPath(folders, f.id) }))]} onChange={setFolderId} />
          <Field label="Tags (separate them with commas)" value={tags} onChangeText={setTags} autoCapitalize="none" />
        </Card>
      </FadeInUp>
      <FadeInUp index={1} style={[styles.row, { gap: spacing.sm }]}>
        <Chip label="Write" selected={!preview} onPress={() => setPreview(false)} />
        <Chip label="Preview" selected={preview} onPress={() => setPreview(true)} />
      </FadeInUp>
      <FadeInUp index={2}>
        <Card>
          {preview ? (
            body.trim() ? (
              <DocMarkdown body={body} />
            ) : (
              <EmptyState card={false} title="Nothing to preview yet" />
            )
          ) : (
            <Field label="Markdown" value={body} onChangeText={setBody} multiline autoCapitalize="sentences" placeholder={'# Title\n\nYour text…'} style={styles.long} />
          )}
        </Card>
      </FadeInUp>
    </Screen>
  )
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center' },
  long: { minHeight: 320, fontFamily: 'monospace', fontSize: 14 },
})
