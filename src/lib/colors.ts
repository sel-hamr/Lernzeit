import type { CSSProperties } from 'react'
import type { Priority, TopicColor } from '@lernzeit/core/types'
import { pastelIndex } from '@lernzeit/core/today'

/** Fixed order for new topics; adjacent pairs were checked for colour-blind separation. */
export const TOPIC_COLORS: TopicColor[] = ['sage', 'blue', 'clay', 'teal', 'sand', 'lilac', 'rose', 'stone']

export const TOPIC_COLOR_NAME: Record<TopicColor, string> = {
  sage: 'Sage', blue: 'Blue', clay: 'Clay', sand: 'Sand', rose: 'Rose', teal: 'Teal', lilac: 'Lilac', stone: 'Stone',
}

/**
 * CSS variables for one topic colour set. Use with Tailwind classes such as
 * `bg-(--t-soft)`, `text-(--t-ink)`, `border-(--t-border)`.
 */
export function topicVars(color: TopicColor | undefined): CSSProperties {
  const c = color ?? 'stone'
  return {
    '--t-dot': `var(--t-${c}-dot)`,
    '--t-bar': `var(--t-${c}-bar)`,
    '--t-soft': `var(--t-${c}-soft)`,
    '--t-border': `var(--t-${c}-border)`,
    '--t-ink': `var(--t-${c}-ink)`,
  } as CSSProperties
}

export function dotColor(color: TopicColor | undefined): string {
  return `var(--t-${color ?? 'stone'}-dot)`
}

/** Next unused colour for a new topic. */
export function nextTopicColor(used: TopicColor[]): TopicColor {
  return TOPIC_COLORS.find((c) => !used.includes(c)) ?? TOPIC_COLORS[used.length % TOPIC_COLORS.length]
}

/** Stable pastel background for a card image. */
export function pastelFor(id: string): string {
  return `var(--pastel-${pastelIndex(id)})`
}

export const PRIORITY_LABEL: Record<Priority, string> = { high: 'High', medium: 'Medium', low: 'Low' }
export const PRIORITY_ORDER: Priority[] = ['high', 'medium', 'low']
