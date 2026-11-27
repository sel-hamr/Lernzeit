/*
 * Local notifications (expo-notifications): the timer's phase ends ring even with the app closed, and
 * the daily reminders. Everything here is best effort: a missing permission or a platform without the
 * module never breaks the screens.
 */
import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'

let ready: Promise<boolean> | undefined

/** Channels, the foreground handler and the permission, asked for once. */
export function setUpNotifications(): Promise<boolean> {
  ready ??= (async () => {
    try {
      Notifications.setNotificationHandler({
        handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
      })
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('timer', { name: 'Focus timer', importance: Notifications.AndroidImportance.HIGH, sound: 'default' })
        await Notifications.setNotificationChannelAsync('timer-silent', { name: 'Focus timer (silent)', importance: Notifications.AndroidImportance.DEFAULT, sound: null })
        await Notifications.setNotificationChannelAsync('reminders', { name: 'Reminders', importance: Notifications.AndroidImportance.DEFAULT })
      }
      const current = await Notifications.getPermissionsAsync()
      if (current.granted) return true
      return (await Notifications.requestPermissionsAsync()).granted
    } catch {
      return false
    }
  })()
  return ready
}

export type Channel = 'timer' | 'timer-silent' | 'reminders'

export async function scheduleAt(identifier: string, at: number, title: string, body: string, channelId: Channel = 'timer'): Promise<void> {
  try {
    if (at <= Date.now() || !(await setUpNotifications())) return
    await Notifications.scheduleNotificationAsync({
      identifier,
      content: { title, body, sound: channelId !== 'timer-silent' },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(at), channelId },
    })
  } catch {
    // Not fatal.
  }
}

export async function cancelMatching(prefix: string): Promise<void> {
  try {
    for (const n of await Notifications.getAllScheduledNotificationsAsync()) if (n.identifier.startsWith(prefix)) await Notifications.cancelScheduledNotificationAsync(n.identifier)
  } catch {
    // Not fatal.
  }
}
