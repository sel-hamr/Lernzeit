import type { FeaturePlugin } from '@/app/plugin'

/** The phone's bottom bar, in this order. A turned-off feature is left out, not replaced. */
export const PHONE_TAB_IDS = ['today', 'flashcards', 'stories', 'timer']

export function phoneTabs(features: FeaturePlugin[]): FeaturePlugin[] {
  return PHONE_TAB_IDS.flatMap((id) => features.filter((f) => f.id === id))
}

/** The phone menu's pages: every enabled page that is not on the bottom bar. */
export function menuItems(features: FeaturePlugin[]): FeaturePlugin[] {
  return features.filter((f) => !PHONE_TAB_IDS.includes(f.id))
}
