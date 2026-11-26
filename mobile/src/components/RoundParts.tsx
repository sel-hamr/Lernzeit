/*
 * The pieces practice rounds share (flashcards, grammar, questions): the top row with End and the
 * segmented progress, a typed answer shown letter by letter, and the end screen where a ring fills
 * and a check draws itself.
 */
import type { DiffPart } from '@lernzeit/core/answer'
import { X, type LucideIcon } from 'lucide-react-native'
import { useEffect, type ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { AnimatedBar, AnimatedCheck, AnimatedRing, FadeInUp, haptics } from '../motion'
import { numbers, useTheme } from '../theme'
import { Button, EmptyState, IconButton } from '../ui'

/** The round's progress: one segment per question for short rounds, a bar for long ones. */
export function Segments({ done, total, pct }: { done: number; total: number; pct: number }) {
  const { colors } = useTheme()
  if (total > 24 || total === 0) return <AnimatedBar value={pct} height={6} color={colors.ink} track={colors.lineStrong} style={styles.grow} label="Round progress" />
  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel="Round progress" accessibilityValue={{ min: 0, max: 100, now: Math.round(pct * 100) }} style={[styles.grow, styles.row, { gap: 3, height: 6 }]}>
      {Array.from({ length: total }, (_, i) => (
        <View key={i} style={[styles.grow, { height: 6, borderRadius: 3, backgroundColor: i < done ? colors.ink : colors.lineStrong }]} />
      ))}
    </View>
  )
}

/** End, the progress, and something on the right (a ⋯ button); the title and position under it. */
export function RoundTop({ title, done, total, onEnd, right }: { title: string; done: number; total: number; onEnd: () => void; right?: ReactNode }) {
  const { colors, type, spacing } = useTheme()
  const insets = useSafeAreaInsets()
  return (
    <View style={{ paddingTop: insets.top }}>
      <View style={[styles.top, { paddingHorizontal: spacing.pageX, gap: spacing.md }]}>
        <IconButton icon={X} label="End" onPress={onEnd} />
        <Segments done={done} total={total} pct={total ? done / total : 0} />
        {right}
      </View>
      <Text style={[type.small, numbers, styles.center, { color: colors.muted, paddingTop: spacing.xs, paddingHorizontal: spacing.pageX }]} numberOfLines={1}>
        {total && done < total ? `${title} · ${done + 1} of ${total}` : title}
      </Text>
    </View>
  )
}

/** A typed answer against the right one: right letters in ink, wrong in red, missing underlined. */
export function DiffText({ parts, prefix }: { parts: DiffPart[]; prefix?: string }) {
  const { colors, type } = useTheme()
  return (
    <Text style={[type.body, { color: colors.muted, textAlign: 'center' }]}>
      {prefix}
      {parts.map((p, i) => (
        <Text key={i} style={{ color: p.kind === 'ok' ? colors.ink : p.kind === 'missing' ? colors.muted : colors.dangerInk, textDecorationLine: p.kind === 'extra' ? 'line-through' : p.kind === 'missing' ? 'underline' : 'none' }}>
          {p.text}
        </Text>
      ))}
    </Text>
  )
}

/** A round with nothing in it. */
export function RoundEmpty({ icon, title, body, actionLabel, onAction }: { icon: LucideIcon; title: string; body: string; actionLabel: string; onAction: () => void }) {
  const { spacing } = useTheme()
  return (
    <View style={[styles.grow, { padding: spacing.pageX, justifyContent: 'center' }]}>
      <FadeInUp>
        <EmptyState icon={icon} title={title} body={body} action={<Button label={actionLabel} onPress={onAction} />} />
      </FadeInUp>
    </View>
  )
}

/** The end of a round: the ring and check, a title, a line, what else to show, then the buttons. */
export function RoundDone({ title, body, children, again, leaveLabel, onAgain, onLeave }: { title: string; body: string; children?: ReactNode; again?: string; leaveLabel: string; onAgain?: () => void; onLeave: () => void }) {
  const { colors, type, spacing } = useTheme()
  const insets = useSafeAreaInsets()
  useEffect(() => {
    haptics.success()
  }, [])
  return (
    <View style={[styles.grow, { paddingHorizontal: spacing.pageX, paddingBottom: Math.max(insets.bottom, spacing.md) + spacing.xs }]}>
      <View style={[styles.grow, { alignItems: 'center', justifyContent: 'center', gap: spacing.lg }]}>
        <FadeInUp index={0}>
          <AnimatedRing value={1} size={148} stroke={10} label="Round complete">
            <View style={[styles.check, { backgroundColor: colors.accent }]}>
              <AnimatedCheck size={64} color={colors.onAccent} delay={380} />
            </View>
          </AnimatedRing>
        </FadeInUp>
        <FadeInUp index={1} style={{ alignItems: 'center', gap: spacing.xs }}>
          <Text style={[type.title, { color: colors.ink }]} accessibilityRole="header">
            {title}
          </Text>
          <Text style={[type.body, numbers, { color: colors.muted, textAlign: 'center' }]}>{body}</Text>
        </FadeInUp>
        {children ? (
          <FadeInUp index={2} style={{ alignSelf: 'stretch' }}>
            {children}
          </FadeInUp>
        ) : null}
      </View>
      <FadeInUp index={3} style={[styles.row, { gap: spacing.sm }]}>
        <Button label={leaveLabel} variant={onAgain ? 'soft' : 'primary'} onPress={onLeave} style={styles.grow} />
        {onAgain ? <Button label={again ?? 'Practise again'} onPress={onAgain} haptic="tap" style={styles.grow} /> : null}
      </FadeInUp>
    </View>
  )
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center' },
  center: { textAlign: 'center' },
  top: { height: 60, flexDirection: 'row', alignItems: 'center' },
  check: { width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center' },
})
