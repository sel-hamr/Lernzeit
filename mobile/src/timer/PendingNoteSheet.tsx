import { formatMinutesShort } from '@lernzeit/core/time'
import { useState } from 'react'
import { Text, View } from 'react-native'
import { useLocalLibrary } from '../store/live'
import { useTheme } from '../theme'
import { Button, Field, Sheet } from '../ui'
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
    <Sheet open={open} onClose={() => resolvePendingNote(library, null)} title="What did you learn?">
      <View style={{ gap: spacing.md, paddingHorizontal: spacing.md, paddingBottom: spacing.md }}>
        <Text style={[type.body, { color: colors.muted }]}>{`${formatMinutesShort(pending?.minutes ?? 0)} of ${topic} saved.`}</Text>
        <Field multiline maxLength={200} value={text} onChangeText={setText} placeholder="One line about this session" autoFocus />
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <Button label="Save note" onPress={() => resolvePendingNote(library, text)} />
          <Button label="Skip" variant="outline" onPress={() => resolvePendingNote(library, null)} />
        </View>
      </View>
    </Sheet>
  )
}
