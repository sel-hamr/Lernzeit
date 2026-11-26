import { FeatureGate } from '../../src/components/FeatureGate'
import { DocReaderPage } from '../../src/docs/DocReader'

export default function DocPage() {
  return (
    <FeatureGate id="docs">
      <DocReaderPage />
    </FeatureGate>
  )
}
