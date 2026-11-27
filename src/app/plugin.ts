import type { ComponentType } from 'react'
import type { LucideIcon } from 'lucide-react'

/** One page of a feature, such as /stories or /stories/:storyId. */
export interface PluginRoute {
  /** A react-router path. End it with /* to let the page hold its own <Routes>. */
  path: string
  /** Wrap it in React.lazy() so the feature loads only when it is opened. */
  page: ComponentType
}

/**
 * A feature of Lernzeit: its pages and its place in the menu.
 * Each feature folder exports one from plugin.ts, and src/app/plugins.ts lists them.
 */
export interface FeaturePlugin {
  /** Stable and unique. Settings stores it to remember a feature you turned off. */
  id: string
  /** In the sidebar and in Settings. */
  label: string
  /** Under the icon on the phone's bottom bar (layout/nav.ts says which pages get one). */
  short: string
  icon: LucideIcon
  /** Where the menu link goes. */
  path: string
  routes: PluginRoute[]
  /** Shown under the switch in Settings → Features. */
  description?: string
  /** Shown at the end of its sidebar link, e.g. the running timer. */
  badge?: ComponentType
  /** Cannot be turned off. */
  required?: boolean
}

/** Gives a plugin file its type checks and autocomplete. */
export function definePlugin(plugin: FeaturePlugin): FeaturePlugin {
  return plugin
}
