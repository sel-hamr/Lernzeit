import { FeatureGate } from '../../src/components/FeatureGate'
import { StoryReaderPage } from '../../src/stories/StoryReader'

export default function StoryPage() {
  return (
    <FeatureGate id="stories">
      <StoryReaderPage />
    </FeatureGate>
  )
}
