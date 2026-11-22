import { count } from '@lernzeit/core/text'
import { timeAgo } from '@lernzeit/core/syncIndicator'
import { LogOut, RefreshCw } from 'lucide-react-native'
import { useState, type ReactNode } from 'react'
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native'
import { failureMessage, useAccount, useAccountService } from '../src/account'
import { Screen } from '../src/components/Screen'
import { levelColor, useSyncIndicator } from '../src/components/syncIndicator'
import { useLocalLibrary } from '../src/store/live'
import { useSyncEngine } from '../src/sync/engineContext'
import { useSyncStatus } from '../src/sync/status'
import { useTheme } from '../src/theme'

/** What a stuck change is, in a word. */
const RECORD_NOUN: Record<string, string> = {
  cards: 'A card',
  decks: 'A deck',
  docs: 'A doc',
  docFolders: 'A folder',
  images: 'An image',
  stories: 'A story',
  questions: 'A question',
  grammarTopics: 'A grammar topic',
  tasks: 'A task',
  topics: 'A topic',
}

/** Settings: for now the account (the device list stays on the web). */
export default function SettingsPage() {
  return (
    <Screen title="Settings">
      <AccountGroup />
    </Screen>
  )
}

function AccountGroup() {
  const { colors, type, spacing, radius } = useTheme()
  const account = useAccount()
  const service = useAccountService()
  const engine = useSyncEngine()
  const library = useLocalLibrary()
  const status = useSyncStatus()
  const sync = useSyncIndicator()
  const [busy, setBusy] = useState<'sync' | 'signOut'>()
  const [message, setMessage] = useState<{ text: string; error: boolean }>()
  const syncing = busy === 'sync' || status.state === 'syncing'

  async function syncHere() {
    if (!engine || busy) return
    setBusy('sync')
    setMessage(undefined)
    try {
      await engine.syncNow()
      setMessage({ text: 'Synced', error: false })
    } catch (error) {
      setMessage({ text: failureMessage(error), error: true })
    }
    setBusy(undefined)
  }

  async function leave() {
    if (busy) return
    setBusy('signOut')
    setMessage(undefined)
    try {
      // Upload what waits first, so signing out loses nothing. Offline or refused: the check below decides.
      await engine?.syncNow().catch(() => {})
      if ((await service.signOut()) === 'unsynced') {
        const waiting = library.outboxSize()
        const confirmed = await new Promise<boolean>((resolve) =>
          Alert.alert(
            'Sign out anyway?',
            `${count(waiting, 'change is', 'changes are')} not uploaded yet. Sign out anyway?`,
            [
              { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
              { text: 'Sign out anyway', style: 'destructive', onPress: () => resolve(true) },
            ],
            { cancelable: true, onDismiss: () => resolve(false) },
          ),
        )
        if (confirmed) await service.signOut({ force: true })
      }
    } catch (error) {
      setMessage({ text: failureMessage(error), error: true })
    }
    setBusy(undefined)
  }

  return (
    <View style={{ gap: spacing.lg }}>
      <View style={{ gap: spacing.xs }}>
        <Text style={[type.section, { color: colors.ink }]} accessibilityRole="header">
          Account
        </Text>
        <Text style={[type.body, { color: colors.muted }]}>Your library syncs with your Lernzeit cloud. This phone keeps a copy, so it works offline too.</Text>
      </View>

      <View style={styles.rowBetween}>
        <View style={[styles.grow, { gap: 2 }]}>
          <Text style={[type.bodyMedium, { color: colors.ink }]} numberOfLines={1}>
            {account?.email}
          </Text>
          <Text style={[type.small, { color: colors.muted }]}>{status.lastSyncedAt ? `Last synced ${timeAgo(status.lastSyncedAt)}` : 'Not synced yet'}</Text>
        </View>
        <View style={[styles.chip, { backgroundColor: colors.neutralChip, borderRadius: radius.pill, gap: spacing.xs }]} accessible accessibilityLabel={`Sync: ${sync.label}`}>
          <View style={[styles.dot, { backgroundColor: levelColor(colors, sync.level) }]} />
          <Text style={[type.chip, { color: colors.neutralInk }]}>{sync.label}</Text>
        </View>
      </View>

      {status.stuck.length > 0 ? (
        <View style={[styles.stuck, { backgroundColor: colors.field, borderRadius: radius.row, padding: spacing.lg, gap: spacing.sm }]}>
          {status.stuck.map((change) => (
            <Text key={`${change.tbl}/${change.id}`} style={[type.small, { color: colors.ink2 }]}>
              {RECORD_NOUN[change.tbl] ?? 'A change'} can’t be uploaded. {change.reason}
            </Text>
          ))}
        </View>
      ) : null}

      {message ? (
        <Text style={[type.body, { color: message.error ? colors.redInk : colors.sageInk }]} accessibilityRole={message.error ? 'alert' : undefined} accessibilityLiveRegion="polite">
          {message.text}
        </Text>
      ) : null}

      <View style={[styles.buttons, { gap: spacing.sm }]}>
        <OutlineButton label="Sync now" disabled={syncing || busy === 'signOut' || !engine} busy={syncing} onPress={syncHere} icon={<RefreshCw size={15} strokeWidth={1.8} color={colors.ink} />} />
        <OutlineButton label="Sign out" disabled={busy !== undefined} busy={busy === 'signOut'} onPress={leave} icon={<LogOut size={15} strokeWidth={1.8} color={colors.ink} />} />
      </View>
    </View>
  )
}

function OutlineButton({ label, icon, disabled, busy, onPress }: { label: string; icon: ReactNode; disabled: boolean; busy: boolean; onPress: () => void | Promise<void> }) {
  const { colors, type, spacing, radius } = useTheme()
  return (
    <Pressable
      onPress={() => void onPress()}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, busy }}
      style={({ pressed }) => [
        styles.button,
        { borderColor: colors.lineStrong, borderRadius: radius.pill, gap: spacing.sm, paddingHorizontal: spacing.xl, backgroundColor: pressed ? colors.field : 'transparent', opacity: disabled && !busy ? 0.5 : 1 },
      ]}
    >
      {busy ? <ActivityIndicator size="small" color={colors.ink} /> : icon}
      <Text style={[type.bodyMedium, { color: colors.ink }]}>{label}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  rowBetween: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  grow: { flex: 1 },
  chip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, minHeight: 28 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  stuck: {},
  buttons: { flexDirection: 'row', flexWrap: 'wrap' },
  button: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
})
