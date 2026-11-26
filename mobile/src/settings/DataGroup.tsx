import { dateKey } from '@lernzeit/core/time'
import * as DocumentPicker from 'expo-document-picker'
import { File, Paths } from 'expo-file-system'
import * as Sharing from 'expo-sharing'
import { Compass, Download, RotateCcw, Trash2, Upload } from 'lucide-react-native'
import { useState } from 'react'
import { Alert, Text, View } from 'react-native'
import { exportBackup, resetAllData, restoreBackup } from '../data/backup'
import { createServices } from '../services'
import { useLocalLibrary } from '../store/live'
import { expoImageFiles } from '../sync/expoFiles'
import { useTheme } from '../theme'
import { Button, Field, Section, Sheet } from '../ui'
import { ActionRow } from './groups'

const confirm = (title: string, message: string, action: string) =>
  new Promise<boolean>((resolve) =>
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: action, style: 'destructive', onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) }),
  )

/** Your data: a JSON backup you can share, restore from a file, and reset everything. */
export function DataGroup() {
  const library = useLocalLibrary()
  const { colors, type, spacing, radius } = useTheme()
  const [busy, setBusy] = useState<'export' | 'restore' | 'reset'>()
  const [message, setMessage] = useState<{ text: string; error?: boolean }>()
  const [resetOpen, setResetOpen] = useState(false)
  const [typed, setTyped] = useState('')

  const run = async (kind: 'export' | 'restore' | 'reset', work: () => Promise<string | undefined>) => {
    setBusy(kind)
    setMessage(undefined)
    try {
      const text = await work()
      if (text) setMessage({ text })
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : 'That did not work.', error: true })
    }
    setBusy(undefined)
  }

  const exportIt = () =>
    run('export', async () => {
      const backup = await exportBackup(library, expoImageFiles)
      const file = new File(Paths.cache, `lernzeit-backup-${dateKey()}.json`)
      if (file.exists) file.delete()
      file.create()
      file.write(JSON.stringify(backup))
      if (!(await Sharing.isAvailableAsync())) return `Backup saved to ${file.uri}.`
      await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: 'Lernzeit backup' })
      return `Backup made: ${backup.cards.length} cards, ${backup.sessions.length} sessions, ${backup.images.length} pictures.`
    })

  const restoreIt = () =>
    run('restore', async () => {
      const picked = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'text/plain', '*/*'], copyToCacheDirectory: true })
      const asset = picked.canceled ? undefined : picked.assets[0]
      if (!asset) return undefined
      let raw: unknown
      try {
        raw = JSON.parse(await new File(asset.uri).text())
      } catch {
        throw new Error('That file is not a Lernzeit backup.')
      }
      const ok = await confirm('Restore this backup?', 'It replaces your whole library on every device, this phone included. Your cloud library is emptied first.', 'Restore')
      if (!ok) return undefined
      const { api } = createServices()
      if (!api) throw new Error('Sign in to restore a backup.')
      const done = await restoreBackup(library, api, expoImageFiles, raw)
      createServices().engine?.syncNow().catch(() => {})
      return `Restored ${done.cards} cards and ${done.sessions} sessions. Uploading to the cloud now.`
    })

  const resetIt = () =>
    run('reset', async () => {
      const { api } = createServices()
      if (!api) throw new Error('Sign in to reset your library.')
      await resetAllData(library, api)
      createServices().engine?.syncNow().catch(() => {})
      setResetOpen(false)
      setTyped('')
      return 'Your library was deleted on every device.'
    })

  return (
    <>
      <Section title="Your data" hint="A backup is one file with everything, pictures included. It also opens in the web app.">
        <ActionRow label="Export a backup" icon={Download} busy={busy === 'export'} disabled={!!busy} onPress={() => void exportIt()} />
        <ActionRow label="Restore from a backup" icon={Upload} busy={busy === 'restore'} disabled={!!busy} onPress={() => void restoreIt()} />
      </Section>
      {message ? (
        <View style={{ backgroundColor: message.error ? colors.dangerSoft : colors.accentSoft, borderRadius: radius.row, padding: spacing.lg }}>
          <Text style={[type.body, { color: message.error ? colors.dangerInk : colors.accentInk }]} accessibilityRole={message.error ? 'alert' : undefined} accessibilityLiveRegion="polite">
            {message.text}
          </Text>
        </View>
      ) : null}
      <Section title="Danger zone" hint="Deletes your library everywhere. Export a backup first.">
        <ActionRow label="Delete all data" icon={Trash2} tone="danger" disabled={!!busy} onPress={() => setResetOpen(true)} />
      </Section>
      <Sheet
        open={resetOpen}
        onClose={() => (busy ? undefined : setResetOpen(false))}
        title="Delete all data?"
        footer={
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Button label="Cancel" variant="soft" disabled={!!busy} onPress={() => setResetOpen(false)} style={{ flex: 1 }} />
            <Button label="Delete everything" variant="danger" haptic="warning" icon={<RotateCcw size={16} color={colors.dangerInk} />} busy={busy === 'reset'} disabled={typed.trim().toLowerCase() !== 'reset' || !!busy} onPress={() => void resetIt()} style={{ flex: 1 }} />
          </View>
        }
      >
        <View style={{ gap: spacing.md, paddingHorizontal: spacing.md, paddingBottom: spacing.md }}>
          <View style={{ backgroundColor: colors.dangerSoft, borderRadius: radius.row, padding: spacing.lg }}>
            <Text style={[type.body, { color: colors.dangerInk }]}>
              This deletes your whole library in the cloud and on every device you use, this phone included: topics, sessions, cards, stories, everything. It cannot be undone. Export a backup first if you might want it back.
            </Text>
          </View>
          <Field label={'Type "reset" to confirm'} value={typed} onChangeText={setTyped} autoCapitalize="none" autoCorrect={false} />
        </View>
      </Sheet>
    </>
  )
}

/** Starts the walkthrough again. */
export function TourGroup() {
  const library = useLocalLibrary()
  const [started, setStarted] = useState(false)
  return (
    <Section title="Walkthrough" hint="A few cards on Today, Cards, the Timer and the menu.">
      <ActionRow
        label={started ? 'Starting' : 'Show the walkthrough again'}
        icon={Compass}
        disabled={started}
        onPress={() => {
          setStarted(true)
          library.put('kv', { key: 'tour', value: 'pending' })
          setTimeout(() => setStarted(false), 500)
        }}
      />
    </Section>
  )
}
