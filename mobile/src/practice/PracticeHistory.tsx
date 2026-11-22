import { formatPracticeTime, percentCorrect } from '@lernzeit/core/practice'
import { formatClock, formatDayMonth } from '@lernzeit/core/time'
import type { Deck, PracticeKind, PracticeRun } from '@lernzeit/core/types'
import { Text, View } from 'react-native'
import { useDecks } from '../cards/data'
import { Screen } from '../components/Screen'
import { useLiveQuery } from '../store/live'
import { numbers, useTheme } from '../theme'

const KIND: Record<PracticeKind, string> = { due: 'Due cards', practice: 'Practice round', all: 'Whole deck', picked: 'Picked cards', card: 'One card' }

/** Every practice round, newest first: what, when, how many and how many right. */
export function PracticeHistory() {
  const { colors, type, spacing, radius } = useTheme()
  const runs = useLiveQuery(['practiceRuns'], (l) => l.list<PracticeRun>('practiceRuns').sort((a, b) => b.start - a.start), [])
  const decks = useDecks()
  const name = (id: string) => decks.find((d: Deck) => d.id === id)?.name ?? 'Deleted deck'
  return (
    <Screen title="Practice history">
      {runs.length === 0 ? <Text style={[type.body, { color: colors.muted }]}>No practice yet. Rounds you finish or leave half-way show up here.</Text> : null}
      {runs.map((r) => (
        <View key={r.id} style={{ borderWidth: 1, borderColor: colors.line, borderRadius: radius.row, padding: spacing.md, gap: 4 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={[type.bodyMedium, { color: colors.ink }]}>{KIND[r.kind]}</Text>
            <Text style={[type.small, numbers, { color: colors.muted }]}>{`${formatDayMonth(r.day)}, ${formatClock(r.start)}`}</Text>
          </View>
          <Text style={[type.body, numbers, { color: colors.ink2 }]}>{`${r.reviewed} cards · ${percentCorrect(r)} right · ${formatPracticeTime(r.activeMs)}`}</Text>
          <Text style={[type.small, { color: colors.muted }]}>{Object.keys(r.decks).map(name).join(', ')}</Text>
        </View>
      ))}
    </Screen>
  )
}
