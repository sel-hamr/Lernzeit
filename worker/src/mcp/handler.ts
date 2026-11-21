import { createMcpHandler } from '@modelcontextprotocol/server'
import type { Env } from '../env.ts'
import { buildServer } from './server.ts'

/**
 * Answers one MCP request over streamable HTTP for `ownerId`, whose library the tools use. The
 * caller has already signed the owner in. Stateless: each request gets a fresh server (and so a
 * fresh D1 store per tool call), and both current and 2025-era clients are served.
 */
export function mcpFetch(request: Request, env: Env, ownerId: string): Promise<Response> {
  const handler = createMcpHandler(() => buildServer(env, ownerId), { legacy: 'stateless', onerror: (error) => console.error('Lernzeit MCP error', error) })
  return handler.fetch(request)
}
