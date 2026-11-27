import type { LernzeitDB } from '@/db/db'
import { setFetch } from '@/sync/api'
import { createTestServer, type TestServer } from './syncServer'

/**
 * For tests that reset or restore a library, which first resets the cloud: answers with an
 * in-memory cloud that refuses pushes and pulls, so the sync that follows fails fast and the data
 * stays in the outbox. Undo it with `setFetch()`. Pass `{ sync: true }` to let sync work.
 */
export function useTestCloud({ sync = false }: { sync?: boolean } = {}): TestServer {
  const server = createTestServer()
  if (!sync) {
    server.beforeRequest = (_method, path) => (path === '/api/sync/push' || path === '/api/sync/pull' ? new Response('{"error":"No sync in this test"}', { status: 503 }) : undefined)
  }
  setFetch(server.fetch)
  return server
}

/** Marks the database as signed in, as `signIn` does. */
export async function signedIn(database: LernzeitDB, merged = true): Promise<LernzeitDB> {
  await database.meta.bulkPut([
    { key: 'account', value: { email: 'owner@lernzeit.test' } },
    ...(merged ? [{ key: 'merged', value: true }] : []),
  ])
  return database
}
