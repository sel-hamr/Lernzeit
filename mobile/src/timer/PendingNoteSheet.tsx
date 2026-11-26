import { formatMinutesShort } from '@lernzeit/core/time'
import { Check } from 'lucide-react-native'
import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useLocalLibrary } from '../store/live'
import { useTheme } from '../theme'
import { Button, Field, Sheet, Tile } from '../ui'
import { usePendingNote, useTopics } from './hooks'
import { resolvePendingNote } from './timerStore'

/** "What did you learn?" after a session was saved with no note; Skip keeps it without one. */
export function PendingNoteSheet() {
  const library = useLocalLibrary()
  const pending = usePendingNote()
  const topics = useTopics(true)
  const { colors, type, spacing } = useTheme()
  const [text, setText] = useState('')
  const [forRun, setForRun] = useState<number>()
  if (pending && pending.savedAt !== forRun) {
    setForRun(pending.savedAt)
    setText(pending.note)
  }
  // A session that already has a note needs no question.
  const open = !!pending && !pending.note
  const topic = topics.find((t) => t.id === pending?.topicId)?.name ?? 'Study'
  return (
    <Sheet
      open={open}
      onClose={() => resolvePendingNote(library, null)}
      title="What did you learn?"
      closeLabel="Skip the note"
      footer={
        <View style={[styles.row, { gap: spacing.sm }]}>
          <Button label="Skip" variant="soft" haptic="tap" onPress={() => resolvePendingNote(library, null)} style={styles.grow} />
          <Button label="Save note" haptic="success" onPress={() => resolvePendingNote(library, text)} style={styles.grow} />
        </View>
      }
    >
      <View style={{ gap: spacing.md, paddingHorizontal: spacing.md, paddingBottom: spacing.sm }}>
        <View style={[styles.row, { gap: spacing.md }]}>
          <Tile bg={colors.accent} size={36}>
            <Check size={18} strokeWidth={2.4} color={colors.onAccent} />
          </Tile>
          <Text style={[type.bodyMedium, { color: colors.ink2, flex: 1 }]}>{`${formatMinutesShort(pending?.minutes ?? 0)} of ${topic} saved.`}</Text>
        </View>
        <Field multiline maxLength={200} value={text} onChangeText={setText} placeholder="One line about this session" autoFocus accessibilityLabel="Note" />
      </View>
    </Sheet>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  grow: { flex: 1 },
})
