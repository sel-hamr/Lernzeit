import { FeatureGate } from '../../src/components/FeatureGate'
import { StoryEditorPage } from '../../src/stories/StoryEditor'

export default function StoryEditPage() {
  return (
    <FeatureGate id="stories">
      <StoryEditorPage />
    </FeatureGate>
  )
}
