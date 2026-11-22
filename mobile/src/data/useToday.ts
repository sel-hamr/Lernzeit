import { dayKeyAt } from '@lernzeit/core/today'
import { useLiveQuery } from '../store/live'
import { useNow } from '../timer/hooks'

/** Today's date key in the owner's zone (kv/timeZone), read again each minute. */
export function useToday(): string {
  const zone = useLiveQuery(['kv'], (l) => l.get<{ value?: unknown }>('kv', 'timeZone')?.value, [])
  const now = useNow(true, 60_000)
  return dayKeyAt(now, typeof zone === 'string' ? zone : undefined)
}
