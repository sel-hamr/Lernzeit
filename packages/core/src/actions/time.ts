import { MAX_STUDY_MINUTES, type LogStudyTimeParams, type SessionSummary } from '../protocol'
import { manualSessions } from '../sessions'
import { MINUTE, parseLocalDateTimeIn } from '../time'
import { findTopic, invalid, localDateTime, type ActionContext } from './shared'

/** Logs study time that happened away from the timer, split at the owner's midnight. */
export async function logStudyTime({ topic, minutes, start, note }: LogStudyTimeParams, ctx: ActionContext): Promise<SessionSummary> {
  if (!(minutes > 0 && minutes <= MAX_STUDY_MINUTES)) throw invalid(`minutes must be more than 0 and at most ${MAX_STUDY_MINUTES}.`)
  const linked = await findTopic(ctx, topic)
  const startMs = start ? parseLocalDateTimeIn(start, ctx.timeZone) : ctx.now - minutes * MINUTE
  if (Number.isNaN(startMs)) throw invalid('start must be a local date and time like 2026-10-15T08:30.')
  const endMs = startMs + minutes * MINUTE
  if (endMs > ctx.now + MINUTE) throw invalid('Study time cannot end in the future.')
  for (const session of manualSessions({ topicId: linked.id, start: startMs, minutes, note }, ctx.newId(), ctx.timeZone)) ctx.store.put('sessions', session)
  return { topic: linked.name, minutes, start: localDateTime(ctx, startMs), end: localDateTime(ctx, endMs) }
}
