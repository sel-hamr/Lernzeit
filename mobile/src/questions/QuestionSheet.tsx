/*
 * Write or edit a question in a sheet (the web's QuestionEditor): the set it belongs to, the
 * question, its English, your own answer (the one you practise), a suggested answer and useful
 * words. Deleting takes its old answers along.
 */
import { DEFAULT_SET } from '@lernzeit/core/questions'
import type { Question } from '@lernzeit/core/types'
import { Trash2 } from 'lucide-react-native'
import { useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { confirmDelete, notice } from '../notice'
import { useLocalLibrary } from '../store/live'
import { useTheme } from '../theme'
import { Button, Chip, Field, Sheet } from '../ui'
import { deleteQuestion, parseWords, saveQuestion } from './data'

export function QuestionSheet({ open, question, set, sets, onClose, onDeleted }: { open: boolean; question?: Question; set?: string; sets: string[]; onClose: () => void; onDeleted?: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title={question ? 'Edit question' : 'New question'}>
      {open ? <Form key={question?.id ?? 'new'} question={question} set={set} sets={sets} onClose={onClose} onDeleted={onDeleted} /> : null}
    </Sheet>
  )
}

function Form({ question, set, sets, onClose, onDeleted }: { question?: Question; set?: string; sets: string[]; onClose: () => void; onDeleted?: () => void }) {
  const { colors, spacing } = useTheme()
  const library = useLocalLibrary()
  const [group, setGroup] = useState(question?.set ?? set ?? sets[0] ?? DEFAULT_SET)
  const [text, setText] = useState(question?.question ?? '')
  const [english, setEnglish] = useState(question?.english ?? '')
  const [mine, setMine] = useState(question?.myAnswer ?? '')
  const [suggested, setSuggested] = useState(question?.suggested ?? '')
  const [words, setWords] = useState(question?.words?.join(', ') ?? '')

  const save = () => {
    if (!text.trim()) return
    try {
      saveQuestion(library, { set: group, question: text, english, myAnswer: mine, suggested, words: parseWords(words), level: question?.level, tags: question?.tags ?? [] }, question?.id)
      onClose()
    } catch (err) {
      notice(err instanceof Error ? err.message : 'Could not save the question')
    }
  }
  const remove = () =>
    confirmDelete('Delete this question?', 'Your old answers to it are deleted too.', () => {
      if (question) deleteQuestion(library, question.id)
      onClose()
      onDeleted?.()
    })

  return (
    <View style={{ gap: spacing.md, paddingHorizontal: spacing.md, paddingBottom: spacing.md }}>
      <Field label="Set" value={group} onChangeText={setGroup} />
      {sets.length > 1 ? (
        <View style={styles.wrap}>
          {sets.slice(0, 8).map((s) => (
            <Chip key={s} label={s} selected={group.trim() === s} onPress={() => setGroup(s)} />
          ))}
        </View>
      ) : null}
      <Field label="Question" value={text} onChangeText={setText} multiline placeholder="Was machst du am Wochenende?" />
      <Field label="English (optional)" value={english} onChangeText={setEnglish} />
      <Field label="Your answer (your real answer, the one you practise)" value={mine} onChangeText={setMine} multiline />
      <Field label="Suggested answer (optional)" value={suggested} onChangeText={setSuggested} multiline />
      <Field label="Useful words (separate them with commas)" value={words} onChangeText={setWords} autoCapitalize="none" />
      <View style={[styles.row, { gap: spacing.sm, paddingTop: spacing.xs }]}>
        {question ? <Button label="Delete" variant="danger" icon={<Trash2 size={16} color={colors.dangerInk} />} onPress={remove} /> : null}
        <Button label="Save" disabled={!text.trim()} onPress={save} haptic="tap" style={styles.grow} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
})
