/*
 * The pages the phone knows, in the web's menu order (src/app/plugins.ts), with the words and icons
 * the bars use. Which of them are on comes from the synced settings; which go on the bottom bar and
 * which in the menu is core's rule (@lernzeit/core/nav), the same as the web's phone layout.
 */
import { menuIds, phoneTabIds } from '@lernzeit/core/nav'
import { BookA, BookOpen, CalendarDays, Copy, FileText, House, Kanban, MessageCircleQuestionMark, Timer, type LucideIcon } from 'lucide-react-native'
import { useMemo } from 'react'
import { useLiveQuery } from './store/live'

export interface Feature {
  id: string
  label: string
  /** The bottom bar's word. */
  short: string
  icon: LucideIcon
  /** Today is always on. */
  required?: boolean
}

export const FEATURES: readonly Feature[] = [
  { id: 'today', label: 'Today', short: 'Today', icon: House, required: true },
  { id: 'timer', label: 'Focus timer', short: 'Timer', icon: Timer },
  { id: 'flashcards', label: 'Flashcards', short: 'Cards', icon: Copy },
  { id: 'grammar', label: 'Grammar', short: 'Grammar', icon: BookA },
  { id: 'stories', label: 'Stories', short: 'Stories', icon: BookOpen },
  { id: 'questions', label: 'Questions', short: 'Q&A', icon: MessageCircleQuestionMark },
  { id: 'docs', label: 'Docs', short: 'Docs', icon: FileText },
  { id: 'history', label: 'History', short: 'History', icon: CalendarDays },
  { id: 'board', label: 'Board', short: 'Board', icon: Kanban },
]

const byId = new Map(FEATURES.map((feature) => [feature.id, feature]))
export const featureById = (id: string): Feature | undefined => byId.get(id)

/** The ids of the pages that are on: all but those in the synced settings' `hiddenFeatures`. */
export function enabledFeatureIds(hidden: readonly string[]): string[] {
  return FEATURES.filter((f) => f.required || !hidden.includes(f.id)).map((f) => f.id)
}

const features = (ids: string[]) => ids.flatMap((id) => featureById(id) ?? [])

export function phoneTabFeatures(hidden: readonly string[]): Feature[] {
  return features(phoneTabIds(enabledFeatureIds(hidden)))
}

export function menuFeatures(hidden: readonly string[]): Feature[] {
  return features(menuIds(enabledFeatureIds(hidden)))
}

/** `hiddenFeatures` of the synced `settings` record (live); none until the first sync brings it. */
export function useHiddenFeatures(): string[] {
  const hidden = useLiveQuery(['kv'], (library) => (library.get<{ value?: { hiddenFeatures?: unknown } }>('kv', 'settings')?.value?.hiddenFeatures), [])
  return useMemo(() => (Array.isArray(hidden) ? hidden.filter((id): id is string => typeof id === 'string') : []), [hidden])
}
