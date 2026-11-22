/*
 * One sync at a time in this process, as the web's withLock: the engine runs each sync under it,
 * and a forced sign-out clears the library under it, so a sync in flight can never write its pull
 * back into a library that was just cleared. Plain TS with no imports, so the account service can
 * take it without loading the engine.
 */
let tail: Promise<unknown> = Promise.resolve()
const noop = () => {}

/** Runs `fn` after everything started under the lock before it has finished. */
export function withSyncLock<T>(fn: () => Promise<T> | T): Promise<T> {
  const result = tail.then(fn)
  tail = result.catch(noop)
  return result
}
