/** A grammar topic's page. */
export function topicPath(id: string): string {
  return `/grammar/${encodeURIComponent(id)}`
}

/** A practice round of one topic. */
export function practicePath(id: string): string {
  return `/grammar/${encodeURIComponent(id)}/practice`
}
