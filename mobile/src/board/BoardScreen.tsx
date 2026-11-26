/*
 * The board, as the web's: Backlog, To do, Doing and Done side by side, one column a screen wide
 * with the next one peeking, snapping as you swipe. Tap a task to edit it, hold it to move it to
 * another column. The web drags tasks; the phone moves them with the sheet.
 */
import type { Task, TaskStatus, Topic } from '@lernzeit/core/types'
import { AlignLeft, CalendarClock, Kanban, Plus } from 'lucide-react-native'
import { useMemo, useRef, useState } from 'react'
import { FlatList, ScrollView, StyleSheet, Text, useWindowDimensions, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Screen } from '../components/Screen'
import { useToday } from '../data/useToday'
import { FadeInUp, haptics, Pressable } from '../motion'
import { useLocalLibrary } from '../store/live'
import { useTopics } from '../timer/hooks'
import { numbers, useTheme, type TopicColorKey } from '../theme'
import { Badge, Chip, EmptyState, IconButton, OptionRow, Sheet } from '../ui'
import { updateTask, useTasks } from './data'
import { ALL_TASKS, boardColumns, dueLabel, isOverdue, PRIORITY_LABEL, STATUSES, STATUS_LABEL, type BoardFilter } from './model'
import { TaskSheet } from './TaskSheet'

export function BoardScreen() {
  const { colors, spacing } = useTheme()
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const library = useLocalLibrary()
  const tasks = useTasks()
  const topics = useTopics(true)
  const activeTopics = useMemo(() => topics.filter((t) => !t.archived), [topics])
  const today = useToday()
  const [filter, setFilter] = useState<BoardFilter>(ALL_TASKS)
  const [editing, setEditing] = useState<{ task?: Task; status?: TaskStatus } | null>(null)
  const [moving, setMoving] = useState<Task | null>(null)
  const [page, setPage] = useState(0)
  const list = useRef<FlatList<TaskStatus>>(null)
  const columns = useMemo(() => boardColumns(tasks, filter, today), [tasks, filter, today])
  const topicMap = useMemo(() => new Map(topics.map((t) => [t.id, t])), [topics])
  const columnWidth = Math.min(360, width - spacing.pageX * 2 - 36)
  const step = columnWidth + spacing.cardGap

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.round(e.nativeEvent.contentOffset.x / step)
    if (next !== page) {
      setPage(next)
      haptics.select()
    }
  }

  return (
    <Screen title="Board" scroll={false} right={<IconButton icon={Plus} label="New task" onPress={() => setEditing({ status: STATUSES[page] ?? 'todo' })} />}>
      <View style={[styles.row, { paddingHorizontal: spacing.pageX, gap: spacing.sm, paddingBottom: spacing.md, flexWrap: 'wrap' }]}>
        <Chip label="All tasks" selected={filter.scope === 'all'} onPress={() => setFilter({ ...filter, scope: 'all' })} />
        <Chip label="Due today" selected={filter.scope === 'today'} onPress={() => setFilter({ ...filter, scope: 'today' })} />
        <Chip
          label={filter.priority === 'all' ? 'Any priority' : PRIORITY_LABEL[filter.priority]}
          selected={filter.priority !== 'all'}
          onPress={() => setFilter({ ...filter, priority: filter.priority === 'all' ? 'high' : filter.priority === 'high' ? 'medium' : filter.priority === 'medium' ? 'low' : 'all' })}
        />
      </View>
      {tasks.length === 0 ? (
        <View style={{ paddingHorizontal: spacing.pageX }}>
          <FadeInUp>
            <EmptyState icon={Kanban} title="No tasks yet" body="Plan what to study next: park ideas in Backlog, then move them along to Done." />
          </FadeInUp>
        </View>
      ) : null}
      <FlatList
        ref={list}
        horizontal
        data={STATUSES}
        keyExtractor={(s) => s}
        showsHorizontalScrollIndicator={false}
        snapToInterval={step}
        decelerationRate="fast"
        onScroll={onScroll}
        scrollEventThrottle={32}
        style={styles.grow}
        contentContainerStyle={{ paddingHorizontal: spacing.pageX, gap: spacing.cardGap, paddingBottom: spacing.md }}
        renderItem={({ item: status, index }) => (
          <FadeInUp index={index} style={{ width: columnWidth }}>
            <Column
              status={status}
              tasks={columns[status]}
              topics={topicMap}
              today={today}
              onAdd={() => setEditing({ status })}
              onOpen={(task) => setEditing({ task })}
              onHold={(task) => {
                haptics.firm()
                setMoving(task)
              }}
            />
          </FadeInUp>
        )}
      />
      <View style={[styles.row, { justifyContent: 'center', gap: 6, paddingBottom: insets.bottom + spacing.sm }]} accessibilityLabel={`Column ${page + 1} of ${STATUSES.length}`}>
        {STATUSES.map((s, i) => (
          <Pressable key={s} onPress={() => list.current?.scrollToOffset({ offset: i * step, animated: true })} accessibilityRole="button" accessibilityLabel={STATUS_LABEL[s]} hitSlop={8} style={{ width: i === page ? 18 : 6, height: 6, borderRadius: 3, backgroundColor: i === page ? colors.ink : colors.lineStrong }} />
        ))}
      </View>

      <TaskSheet open={!!editing} task={editing?.task} status={editing?.status} topics={activeTopics} today={today} onClose={() => setEditing(null)} />
      <Sheet open={!!moving} onClose={() => setMoving(null)} title={moving ? `Move “${moving.title}”` : 'Move'}>
        {STATUSES.map((s) => (
          <OptionRow
            key={s}
            label={STATUS_LABEL[s]}
            detail={String(columns[s].length)}
            selected={moving?.status === s}
            onPress={() => {
              if (moving) updateTask(library, moving.id, { status: s })
              setMoving(null)
            }}
          />
        ))}
      </Sheet>
    </Screen>
  )
}

function Column({ status, tasks, topics, today, onAdd, onOpen, onHold }: { status: TaskStatus; tasks: Task[]; topics: Map<string, Topic>; today: string; onAdd: () => void; onOpen: (task: Task) => void; onHold: (task: Task) => void }) {
  const { colors, type, spacing, radius, shadow } = useTheme()
  return (
    <View style={[styles.column, { backgroundColor: colors.card, borderRadius: radius.card, padding: spacing.md, gap: spacing.md }, shadow.card]} accessibilityLabel={STATUS_LABEL[status]}>
      <View style={[styles.row, { paddingLeft: spacing.xs, gap: spacing.sm }]}>
        <Text style={[type.section, { color: colors.ink }]} accessibilityRole="header">
          {STATUS_LABEL[status]}
        </Text>
        <Text style={[type.small, numbers, styles.grow, { color: colors.muted }]}>{String(tasks.length)}</Text>
        <IconButton icon={Plus} label={`Add task to ${STATUS_LABEL[status]}`} variant="raised" size={36} onPress={onAdd} />
      </View>
      <ScrollView contentContainerStyle={{ gap: spacing.sm, paddingBottom: spacing.xs }} showsVerticalScrollIndicator={false}>
        {tasks.map((task, i) => (
          <FadeInUp key={task.id} index={Math.min(i, 6)}>
            <TaskCard task={task} topic={task.topicId ? topics.get(task.topicId) : undefined} today={today} onPress={() => onOpen(task)} onLongPress={() => onHold(task)} />
          </FadeInUp>
        ))}
        {tasks.length === 0 ? (
          <Pressable onPress={onAdd} accessibilityRole="button" accessibilityLabel={`Add task to ${STATUS_LABEL[status]}`} style={[styles.drop, { borderColor: colors.lineStrong, borderRadius: radius.row }]}>
            <Text style={[type.small, { color: colors.muted }]}>{status === 'backlog' ? 'Park ideas for later here' : 'Nothing here yet'}</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </View>
  )
}

function TaskCard({ task, topic, today, onPress, onLongPress }: { task: Task; topic?: Topic; today: string; onPress: () => void; onLongPress: () => void }) {
  const { colors, type, spacing, radius, topics } = useTheme()
  const done = task.status === 'done'
  const overdue = isOverdue(task, today)
  const due = dueLabel(task, today)
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={320}
      scaleTo={0.97}
      accessibilityRole="button"
      accessibilityLabel={`${task.title}. Hold to move.`}
      style={{ backgroundColor: colors.raised, borderRadius: radius.row, padding: spacing.md, gap: spacing.sm }}
    >
      <Text style={[type.bodyMedium, { color: done ? colors.muted : colors.ink, textDecorationLine: done ? 'line-through' : 'none' }]}>{task.title}</Text>
      {task.description ? (
        <View style={[styles.row, { gap: 6, alignItems: 'flex-start' }]}>
          <AlignLeft size={13} strokeWidth={1.8} color={colors.muted} style={{ marginTop: 2 }} />
          <Text style={[type.chip, styles.grow, { color: colors.muted }]} numberOfLines={2}>
            {task.description}
          </Text>
        </View>
      ) : null}
      <View style={[styles.row, { gap: spacing.md, flexWrap: 'wrap' }]}>
        {topic ? (
          <View style={[styles.row, { gap: 6 }]}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: topics[topic.color as TopicColorKey]?.dot ?? colors.muted }} />
            <Text style={[type.chip, { color: colors.ink2 }]}>{topic.name}</Text>
          </View>
        ) : null}
        {due ? (
          <View style={[styles.row, { gap: 4 }]}>
            <CalendarClock size={13} strokeWidth={1.8} color={overdue || (task.dueDate === today && !done) ? colors.dangerInk : colors.muted} />
            <Text style={[type.chip, numbers, { color: overdue || (task.dueDate === today && !done) ? colors.dangerInk : colors.muted }]}>{due}</Text>
          </View>
        ) : null}
        <View style={styles.grow} />
        <Badge label={PRIORITY_LABEL[task.priority]} tone={task.priority === 'high' ? 'danger' : task.priority === 'medium' ? 'accent' : 'neutral'} />
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center' },
  column: { flex: 1 },
  drop: { borderWidth: 1.5, borderStyle: 'dashed', paddingVertical: 28, alignItems: 'center' },
})
