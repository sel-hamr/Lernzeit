import { FeatureGate } from '../../src/components/FeatureGate'
import { DocEditorPage } from '../../src/docs/DocEditor'

export default function DocEditPage() {
  return (
    <FeatureGate id="docs">
      <DocEditorPage />
    </FeatureGate>
  )
}
