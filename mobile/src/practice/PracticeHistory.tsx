import { formatPracticeTime, percentCorrect } from '@lernzeit/core/practice'
import { count } from '@lernzeit/core/text'
import { formatClock, formatLongDate } from '@lernzeit/core/time'
import type { Deck, PracticeKind, PracticeRun } from '@lernzeit/core/types'
import { History, Layers } from 'lucide-react-native'
import { StyleSheet, Text, View } from 'react-native'
import { useDecks } from '../cards/data'
import { Screen } from '../components/Screen'
import { FadeInUp, RollingNumber } from '../motion'
import { useLiveQuery } from '../store/live'
import { numbers, useTheme } from '../theme'
import { EmptyState, GroupedList, Row, Tile } from '../ui'

const KIND: Record<PracticeKind, string> = { due: 'Due cards', practice: 'Practice round', all: 'Whole deck', picked: 'Picked cards', card: 'One card' }

/** Every practice round, newest first and by day: what, when, how many and how many right. */
export function PracticeHistory() {
  const { colors, type, spacing, radius, shadow, fonts } = useTheme()
  const runs = useLiveQuery(['practiceRuns'], (l) => l.list<PracticeRun>('practiceRuns').sort((a, b) => b.start - a.start), [])
  const decks = useDecks()
  const name = (id: string) => decks.find((d: Deck) => d.id === id)?.name ?? 'Deleted deck'
  const days: { day: string; runs: PracticeRun[] }[] = []
  for (const r of runs) {
    const last = days[days.length - 1]
    if (last?.day === r.day) last.runs.push(r)
    else days.push({ day: r.day, runs: [r] })
  }
  const reviewed = runs.reduce((n, r) => n + r.reviewed, 0)
  const activeMs = runs.reduce((n, r) => n + r.activeMs, 0)
  return (
    <Screen title="Practice history">
      {runs.length === 0 ? (
        <FadeInUp>
          <EmptyState icon={History} title="No practice yet" body="Rounds you finish or leave half-way show up here." />
        </FadeInUp>
      ) : (
        <>
          <FadeInUp index={0}>
            <View style={[styles.tiles, { gap: spacing.cardGap }]}>
              <View style={[styles.tile, { backgroundColor: colors.accent, borderRadius: radius.card, padding: spacing.xl, gap: 2 }]}>
                <RollingNumber value={String(reviewed)} fit style={[type.hero, { color: colors.onAccent }]} />
                <Text style={[type.small, { color: colors.onAccent }]}>{`${reviewed === 1 ? 'card' : 'cards'} in ${count(runs.length, 'round')}`}</Text>
              </View>
              <View style={[styles.tile, { backgroundColor: colors.card, borderRadius: radius.card, padding: spacing.xl, gap: 2 }, shadow.card]}>
                <RollingNumber value={formatPracticeTime(activeMs)} fit style={[type.hero, { color: colors.ink }]} />
                <Text style={[type.small, { color: colors.muted }]}>Practised in all</Text>
              </View>
            </View>
          </FadeInUp>
          {days.map((group, i) => (
            <FadeInUp key={group.day} index={i + 1} style={{ gap: spacing.sm }}>
              <Text style={[type.small, { color: colors.ink2, fontFamily: fonts.semibold, paddingHorizontal: 4 }]}>{formatLongDate(group.day)}</Text>
              <GroupedList>
                {group.runs.map((r) => (
                  <Row
                    key={r.id}
                    title={KIND[r.kind]}
                    subtitle={Object.keys(r.decks).map(name).join(', ')}
                    left={
                      <Tile bg={colors.raised}>
                        <Layers size={18} strokeWidth={1.8} color={colors.ink} />
                      </Tile>
                    }
                    right={
                      <View style={{ alignItems: 'flex-end', gap: 2 }}>
                        <Text style={[type.bodyMedium, numbers, { color: colors.ink }]}>{[count(r.reviewed, 'card'), percentCorrect(r)].filter(Boolean).join(' · ')}</Text>
                        <Text style={[type.chip, numbers, { color: colors.muted }]}>{`${formatClock(r.start)} · ${formatPracticeTime(r.activeMs)}`}</Text>
                      </View>
                    }
                    accessibilityLabel={`${KIND[r.kind]} at ${formatClock(r.start)}: ${count(r.reviewed, 'card')}, ${percentCorrect(r)} right, ${formatPracticeTime(r.activeMs)}`}
                  />
                ))}
              </GroupedList>
            </FadeInUp>
          ))}
        </>
      )}
    </Screen>
  )
}

const styles = StyleSheet.create({
  tiles: { flexDirection: 'row' },
  tile: { flex: 1 },
})
