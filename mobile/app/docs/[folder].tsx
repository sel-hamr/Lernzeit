import { useLocalSearchParams } from 'expo-router'
import { FeatureGate } from '../../src/components/FeatureGate'
import { DocsScreen } from '../../src/docs/DocsScreen'

export default function DocsFolderPage() {
  const { folder } = useLocalSearchParams<{ folder: string }>()
  return (
    <FeatureGate id="docs">
      <DocsScreen key={String(folder)} folderId={String(folder)} />
    </FeatureGate>
  )
}
