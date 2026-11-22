import { dateKey, formatLongDate } from '@lernzeit/core/time'
import { Placeholder } from '../../src/components/Placeholder'

/** Placeholder until the Today screen arrives: today's date under the title. */
export default function Today() {
  return <Placeholder title="Today" message={formatLongDate(dateKey())} />
}
