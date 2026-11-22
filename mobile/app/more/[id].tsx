import { useLocalSearchParams } from 'expo-router'
import { Placeholder } from '../../src/components/Placeholder'
import { Screen } from '../../src/components/Screen'
import { featureById } from '../../src/features'

/** Grammar, Questions, Docs, History and Board, until their screens arrive. */
export default function MenuPage() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const title = featureById(String(id))?.label ?? 'Page'
  return (
    <Screen title={title}>
      <Placeholder />
    </Screen>
  )
}
