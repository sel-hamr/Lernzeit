import { FeatureGate } from '../../src/components/FeatureGate'
import { QuestionPracticePage } from '../../src/questions/QuestionPractice'

export default function QuestionsPracticePage() {
  return (
    <FeatureGate id="questions">
      <QuestionPracticePage />
    </FeatureGate>
  )
}
