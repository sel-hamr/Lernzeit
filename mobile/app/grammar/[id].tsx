import { FeatureGate } from '../../src/components/FeatureGate'
import { TopicPage } from '../../src/grammar/TopicScreen'

export default function GrammarTopicPage() {
  return (
    <FeatureGate id="grammar">
      <TopicPage />
    </FeatureGate>
  )
}
