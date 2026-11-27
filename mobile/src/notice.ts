/*
 * A short message after an action ("Marked as read", "Added 12 starter stories"): Android's own
 * toast, an alert elsewhere. `confirmDelete` asks before something is deleted for good.
 */
import { Alert, Platform, ToastAndroid } from 'react-native'

export function notice(message: string): void {
  try {
    if (Platform.OS === 'android') return ToastAndroid.show(message, ToastAndroid.SHORT)
  } catch {
    // No toast module (a test, a build without it): an alert says it instead.
  }
  Alert.alert(message)
}

export function confirmDelete(title: string, body: string, onDelete: () => void): void {
  Alert.alert(title, body, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: onDelete },
  ])
}
