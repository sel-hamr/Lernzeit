import { Animated, Easing } from 'react-native'
import { TAB_SHIFT_PX, timings } from './springs'

/*
 * How screens change: the native stack's transition per route, and the tab pages' cross-fade.
 * Both run natively (react-native-screens, and React Navigation's native-driven Animated), so a
 * busy JS thread never stutters them.
 */

export type StackAnimation = 'ios_from_right' | 'slide_from_bottom' | 'fade'

/** Full-screen tasks that rise from the bottom like a modal: a practice round or an editor. */
const RISING = new Set(['practice', 'grammar/practice', 'questions/practice', 'card/edit', 'story/edit', 'grammar/edit', 'doc/edit', 'import-csv'])
/** Screens that cross-fade in: search over the tabs, and the switch between signed out and in. */
const FADING = new Set(['search', 'sign-in', '(tabs)'])

/**
 * The stack transition for a route (its file name, as expo-router names it): pages slide in from
 * the right as on iOS, tasks rise from the bottom, search fades. With "remove animations" on,
 * everything fades.
 */
export function stackAnimation(route: string, reduced: boolean): StackAnimation {
  if (reduced || FADING.has(route)) return 'fade'
  if (RISING.has(route)) return 'slide_from_bottom'
  return 'ios_from_right'
}

/** The part of React Navigation's scene props a tab interpolator reads. */
type TabScene = { current: { progress: Animated.Value } }

/** Tab pages: the new one fades in while it slides a few px from the side it came from. */
export function tabShift({ current }: TabScene) {
  return {
    sceneStyle: {
      opacity: current.progress.interpolate({ inputRange: [-1, 0, 1], outputRange: [0, 1, 0] }),
      transform: [{ translateX: current.progress.interpolate({ inputRange: [-1, 0, 1], outputRange: [-TAB_SHIFT_PX, 0, TAB_SHIFT_PX] }) }],
    },
  }
}

/** The tab cross-fade's timing (React Native's own Easing: React Navigation drives it). */
export const tabTransition = { animation: 'timing', config: { duration: timings.tab.duration, easing: Easing.out(Easing.cubic) } } as const

/** The Tabs navigator's options for its page change: a shift and fade, or only a fade with "remove animations" on. */
export function tabSceneOptions(reduced: boolean) {
  return reduced ? ({ animation: 'fade', transitionSpec: tabTransition } as const) : ({ animation: 'shift', sceneStyleInterpolator: tabShift, transitionSpec: tabTransition } as const)
}
