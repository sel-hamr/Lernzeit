import type { TopicSummary } from '../protocol'
import { activeTopics, type ActionContext } from './shared'

export async function listTopics(_params: unknown, ctx: ActionContext): Promise<TopicSummary[]> {
  return (await activeTopics(ctx)).map(({ id, name }) => ({ id, name }))
}
