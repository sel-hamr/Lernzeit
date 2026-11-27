import { FeatureGate } from '../../src/components/FeatureGate'
import { GrammarRoundPage } from '../../src/grammar/GrammarRound'

export default function GrammarPracticePage() {
  return (
    <FeatureGate id="grammar">
      <GrammarRoundPage />
    </FeatureGate>
  )
}
