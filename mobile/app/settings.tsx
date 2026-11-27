import { count } from '@lernzeit/core/text'
import { timeAgo } from '@lernzeit/core/syncIndicator'
import { Cloud, CloudOff, LogOut, RefreshCw } from 'lucide-react-native'
import { useState } from 'react'
import { Alert, StyleSheet, Text, View } from 'react-native'
import { failureMessage, useAccount, useAccountService } from '../src/account'
import { Screen } from '../src/components/Screen'
import { levelColor, useSyncIndicator } from '../src/components/syncIndicator'
import { FadeInUp } from '../src/motion'
import { appVersionLabel } from '../src/settings/version'
import { DataGroup, TourGroup } from '../src/settings/DataGroup'
import { AppearanceGroup, AudioGroup, DecksGroup, FeaturesGroup, RemindersGroup, TimerGroup, TopicsGroup } from '../src/settings/groups'
import { useLocalLibrary } from '../src/store/live'
import { useSyncEngine } from '../src/sync/engineContext'
import { useSyncStatus } from '../src/sync/status'
import { useTheme } from '../src/theme'
import { Button, Row, Section, Tile } from '../src/ui'

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

/** Settings: the account and sync, topics and goals, decks, timer, audio, features, theme, reminders, the walkthrough and your data. */
export default function SettingsPage() {
  const groups = [AccountGroup, TopicsGroup, DecksGroup, TimerGroup, AudioGroup, FeaturesGroup, AppearanceGroup, RemindersGroup, TourGroup, DataGroup]
  return (
    <Screen title="Settings">
      {groups.map((Group, i) => (
        <FadeInUp key={i} index={i} style={{ gap: 16 }}>
          <Group />
        </FadeInUp>
      ))}
      <VersionLine />
    </Screen>
  )
}

/** Which build this is, for bug reports. */
function VersionLine() {
  const { colors, type } = useTheme()
  return (
    <Text testID="app-version" style={[type.chip, { color: colors.muted, textAlign: 'center' }]} selectable>
      {appVersionLabel()}
    </Text>
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
            `${count(waiting, 'change is', 'changes are')} not uploaded yet.`,
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
    <>
      <Section title="Account" hint="Your library syncs with your Lernzeit cloud. This phone keeps a copy, so it works offline too.">
        <Row
          title={account?.email ?? ''}
          subtitle="Signed in"
          left={
            <Tile bg={colors.accent} size={40}>
              <Text style={[type.section, { color: colors.onAccent }]}>{(account?.email ?? '?').slice(0, 1).toUpperCase()}</Text>
            </Tile>
          }
        />
        <View style={{ paddingVertical: spacing.md }}>
          <Button label="Sign out" variant="soft" disabled={busy !== undefined} busy={busy === 'signOut'} onPress={() => void leave()} icon={<LogOut size={16} strokeWidth={1.8} color={colors.ink} />} />
        </View>
      </Section>

      <Section title="Sync">
        <Row
          title="Lernzeit cloud"
          subtitle={status.lastSyncedAt ? `Last synced ${timeAgo(status.lastSyncedAt)}` : 'Not synced yet'}
          left={
            <Tile bg={sync.level === 'error' ? colors.dangerSoft : sync.level === 'ok' ? colors.accentSoft : colors.raised} size={40}>
              {status.state === 'offline' || sync.level === 'error' ? (
                <CloudOff size={18} strokeWidth={1.8} color={sync.level === 'error' ? colors.dangerInk : colors.ink} />
              ) : (
                <Cloud size={18} strokeWidth={1.8} color={sync.level === 'ok' ? colors.accentInk : colors.ink} />
              )}
            </Tile>
          }
          right={
            <View style={[styles.chip, { backgroundColor: colors.chip, borderRadius: radius.pill, gap: spacing.xs }]} accessible accessibilityLabel={`Sync: ${sync.label}`}>
              <View style={[styles.dot, { backgroundColor: levelColor(colors, sync.level) }]} />
              <Text style={[type.chip, { color: colors.ink2 }]}>{sync.label}</Text>
            </View>
          }
        />
        {status.state === 'offline' ? (
          <View style={{ paddingVertical: spacing.md }}>
            <Text style={[type.small, { color: colors.ink2 }]}>You are offline. This phone keeps working, and your changes upload when the connection is back.</Text>
          </View>
        ) : null}
        {status.stuck.length > 0 ? (
          <View style={{ paddingVertical: spacing.md, gap: spacing.sm }}>
            {status.stuck.map((change) => (
              <Text key={`${change.tbl}/${change.id}`} style={[type.small, { color: colors.dangerInk }]}>
                {RECORD_NOUN[change.tbl] ?? 'A change'} can’t be uploaded. {change.reason}
              </Text>
            ))}
          </View>
        ) : null}
        {message ? (
          <View style={{ paddingVertical: spacing.md }}>
            <Text style={[type.body, { color: message.error ? colors.dangerInk : colors.accentInk }]} accessibilityRole={message.error ? 'alert' : undefined} accessibilityLiveRegion="polite">
              {message.text}
            </Text>
          </View>
        ) : null}
        <View style={{ paddingVertical: spacing.md }}>
          <Button label="Sync now" variant="soft" haptic="tap" disabled={syncing || busy === 'signOut' || !engine} busy={syncing} onPress={() => void syncHere()} icon={<RefreshCw size={16} strokeWidth={1.8} color={colors.ink} />} />
        </View>
      </Section>
    </>
  )
}

const styles = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, minHeight: 28 },
  dot: { width: 6, height: 6, borderRadius: 3 },
})
