import { FeatureGate } from '../../src/components/FeatureGate'
import { StoriesScreen } from '../../src/stories/StoriesScreen'

export default function Stories() {
  return (
    <FeatureGate id="stories" tab>
      <StoriesScreen />
    </FeatureGate>
  )
}
