import { FeatureGate } from '../../src/components/FeatureGate'
import { TopicEditorPage } from '../../src/grammar/TopicEditor'

export default function GrammarEditPage() {
  return (
    <FeatureGate id="grammar">
      <TopicEditorPage />
    </FeatureGate>
  )
}
