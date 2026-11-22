import { menuIds, phoneTabIds } from '@lernzeit/core/nav'
import type { FeaturePlugin } from '@/app/plugin'

// The selection rule is core's, shared with the Android app; these only map the ids back to plugins.
const byIds = (features: FeaturePlugin[], ids: string[]) => ids.flatMap((id) => features.filter((f) => f.id === id))

/** The phone's bottom bar, in this order. A turned-off feature is left out, not replaced. */
export function phoneTabs(features: FeaturePlugin[]): FeaturePlugin[] {
  return byIds(features, phoneTabIds(features.map((f) => f.id)))
}

/** The phone menu's pages: every enabled page that is not on the bottom bar. */
export function menuItems(features: FeaturePlugin[]): FeaturePlugin[] {
  return byIds(features, menuIds(features.map((f) => f.id)))
}

/** Practising flashcards fills the phone screen: its rating buttons take the bottom bar's place. */
export function hidesBottomBar(pathname: string): boolean {
  return pathname.startsWith('/flashcards/review')
}
