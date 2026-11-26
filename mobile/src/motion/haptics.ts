import * as Haptics from 'expo-haptics'

/** Off under Jest, so tests never reach the native module. */
const enabled = process.env.NODE_ENV !== 'test'

const quietly = (run: () => Promise<void>) => {
  if (!enabled) return
  try {
    run().catch(() => {})
  } catch {
    // A phone without a vibration motor (or an emulator) just stays still.
  }
}

/** The app's haptics: a light tap on rating, tab change and toggle, success on finishing a goal. */
export const haptics = {
  tap: () => quietly(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  select: () => quietly(() => Haptics.selectionAsync()),
  firm: () => quietly(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  success: () => quietly(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  warning: () => quietly(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
}

export type HapticKind = keyof typeof haptics
