import { useMemo } from 'react'
import { getSettings, updateSettings } from '@/db/db'
import { useSettings } from '@/data/hooks'
import type { FeaturePlugin } from './plugin'
import { todayPlugin } from '@/features/today/plugin'
import { timerPlugin } from '@/features/timer/plugin'
import { flashcardsPlugin } from '@/features/flashcards/plugin'
import { grammarPlugin } from '@/features/grammar/plugin'
import { storiesPlugin } from '@/features/stories/plugin'
import { questionsPlugin } from '@/features/questions/plugin'
import { docsPlugin } from '@/features/docs/plugin'
import { historyPlugin } from '@/features/history/plugin'
import { boardPlugin } from '@/features/board/plugin'

/**
 * Every feature, in menu order. To add one, make a folder in src/features with a
 * plugin.ts that calls definePlugin(), and add it here.
 */
export const PLUGINS: FeaturePlugin[] = [todayPlugin, timerPlugin, flashcardsPlugin, grammarPlugin, storiesPlugin, questionsPlugin, docsPlugin, historyPlugin, boardPlugin]

/** The features that are on, in menu order. A feature is on until you turn it off. */
export function useFeatures(): FeaturePlugin[] {
  const { hiddenFeatures } = useSettings()
  return useMemo(() => PLUGINS.filter((p) => p.required || !hiddenFeatures.includes(p.id)), [hiddenFeatures])
}

export async function setFeatureOn(id: string, on: boolean) {
  const { hiddenFeatures } = await getSettings()
  const rest = hiddenFeatures.filter((h) => h !== id)
  await updateSettings({ hiddenFeatures: on ? rest : [...rest, id] })
}
