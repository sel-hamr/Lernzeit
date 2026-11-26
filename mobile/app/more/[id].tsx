import { useLocalSearchParams } from 'expo-router'
import { SearchX } from 'lucide-react-native'
import type { JSX } from 'react'
import { BoardScreen } from '../../src/board/BoardScreen'
import { FeatureGate } from '../../src/components/FeatureGate'
import { Screen } from '../../src/components/Screen'
import { DocsScreen } from '../../src/docs/DocsScreen'
import { GrammarScreen } from '../../src/grammar/GrammarScreen'
import { QuestionsScreen } from '../../src/questions/QuestionsScreen'
import { EmptyState } from '../../src/ui'

/** The menu's pages: Grammar, Questions, Docs and Board. History has its own route. */
const PAGES: Record<string, () => JSX.Element> = {
  grammar: GrammarScreen,
  questions: QuestionsScreen,
  docs: () => <DocsScreen />,
  board: BoardScreen,
}

export default function MenuPage() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const Page = PAGES[String(id)]
  if (!Page) {
    return (
      <Screen title="Lernzeit">
        <EmptyState icon={SearchX} title="This page is not here" />
      </Screen>
    )
  }
  return (
    <FeatureGate id={String(id)}>
      <Page />
    </FeatureGate>
  )
}
