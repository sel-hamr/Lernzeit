/*
 * Create or edit a task in a sheet (the web's TaskEditor): title, description, its column, topic,
 * priority and due date. An existing task can also move up or down in its column, or be deleted.
 */
import { addDays, formatDayMonthShort } from '@lernzeit/core/time'
import type { Priority, Task, TaskStatus, Topic } from '@lernzeit/core/types'
import { ArrowDown, ArrowUp, Minus, Plus, Trash2 } from 'lucide-react-native'
import { useState, type ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { haptics } from '../motion'
import { confirmDelete, notice } from '../notice'
import { useLocalLibrary } from '../store/live'
import { useTheme, type TopicColorKey } from '../theme'
import { Button, Chip, Field, IconButton, Sheet } from '../ui'
import { createTask, deleteTask, shiftTask, updateTask } from './data'
import { dueChoices, PRIORITIES, PRIORITY_LABEL, STATUSES, STATUS_LABEL } from './model'

export function TaskSheet({ open, task, status, topics, today, onClose }: { open: boolean; task?: Task; status?: TaskStatus; topics: Topic[]; today: string; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title={task ? 'Edit task' : 'New task'}>
      {open ? <Form key={task?.id ?? 'new'} task={task} status={status} topics={topics} today={today} onClose={onClose} /> : null}
    </Sheet>
  )
}

function Form({ task, status, topics, today, onClose }: { task?: Task; status?: TaskStatus; topics: Topic[]; today: string; onClose: () => void }) {
  const { colors, type, spacing, topics: topicColors } = useTheme()
  const library = useLocalLibrary()
  const [title, setTitle] = useState(task?.title ?? '')
  const [description, setDescription] = useState(task?.description ?? '')
  const [column, setColumn] = useState<TaskStatus>(task?.status ?? status ?? 'todo')
  const [topicId, setTopicId] = useState(task?.topicId ?? '')
  const [priority, setPriority] = useState<Priority>(task?.priority ?? 'medium')
  const [due, setDue] = useState(task?.dueDate ?? '')

  const save = () => {
    if (!title.trim()) return
    try {
      const input = { title, description, status: column, topicId, priority, dueDate: due }
      if (task) updateTask(library, task.id, input)
      else createTask(library, input)
      haptics.tap()
      onClose()
    } catch (err) {
      notice(err instanceof Error ? err.message : 'Could not save the task')
    }
  }
  const remove = () =>
    confirmDelete('Delete this task?', task?.title ?? '', () => {
      if (task) deleteTask(library, task.id)
      onClose()
    })

  return (
    <View style={{ gap: spacing.lg, paddingHorizontal: spacing.md, paddingBottom: spacing.md }}>
      <Field label="Title" value={title} onChangeText={setTitle} autoFocus={!task} placeholder="Read chapter 3" />
      <Field label="Description (optional)" value={description} onChangeText={setDescription} multiline />
      <Group label="Column">
        {STATUSES.map((s) => (
          <Chip key={s} label={STATUS_LABEL[s]} selected={column === s} onPress={() => setColumn(s)} />
        ))}
      </Group>
      {topics.length ? (
        <Group label="Topic">
          <Chip label="None" selected={!topicId} onPress={() => setTopicId('')} />
          {topics.map((t) => (
            <Chip key={t.id} label={t.name} color={topicColors[t.color as TopicColorKey]?.dot} selected={topicId === t.id} onPress={() => setTopicId(t.id)} />
          ))}
        </Group>
      ) : null}
      <Group label="Priority">
        {PRIORITIES.map((p) => (
          <Chip key={p} label={PRIORITY_LABEL[p]} selected={priority === p} onPress={() => setPriority(p)} />
        ))}
      </Group>
      <Group label="Due date">
        {dueChoices(today).map((c) => (
          <Chip key={c.label} label={c.label} selected={due === c.value} onPress={() => setDue(c.value)} />
        ))}
      </Group>
      {due ? (
        <View style={[styles.row, { gap: spacing.sm }]}>
          <IconButton icon={Minus} label="A day earlier" variant="raised" size={40} haptic="select" onPress={() => setDue(addDays(due, -1))} />
          <Text style={[type.bodyMedium, styles.grow, { color: colors.ink, textAlign: 'center' }]}>{formatDayMonthShort(due)}</Text>
          <IconButton icon={Plus} label="A day later" variant="raised" size={40} haptic="select" onPress={() => setDue(addDays(due, 1))} />
        </View>
      ) : null}
      {task ? (
        <View style={[styles.row, { gap: spacing.sm }]}>
          <Button label="Move up" variant="soft" size="sm" icon={<ArrowUp size={15} strokeWidth={1.9} color={colors.ink} />} onPress={() => shiftTask(library, task.id, -1)} style={styles.grow} />
          <Button label="Move down" variant="soft" size="sm" icon={<ArrowDown size={15} strokeWidth={1.9} color={colors.ink} />} onPress={() => shiftTask(library, task.id, 1)} style={styles.grow} />
        </View>
      ) : null}
      <View style={[styles.row, { gap: spacing.sm }]}>
        {task ? <Button label="Delete" variant="danger" icon={<Trash2 size={16} color={colors.dangerInk} />} onPress={remove} /> : null}
        <Button label={task ? 'Save' : 'Add task'} disabled={!title.trim()} onPress={save} style={styles.grow} />
      </View>
    </View>
  )
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  const { colors, type, spacing } = useTheme()
  return (
    <View style={{ gap: spacing.sm }}>
      <Text style={[type.small, { color: colors.muted, paddingHorizontal: 4 }]}>{label}</Text>
      <View style={styles.wrap}>{children}</View>
    </View>
  )
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
})
