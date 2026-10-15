import { DEFAULT_PORT, LOCAL_ORIGINS } from './protocol'

/** Set by vite.config.ts in dev; empty in builds, which should not carry a local path. */
declare const __MCP_SERVER_PATH__: string

export const SERVER_PATH = __MCP_SERVER_PATH__ || '<path to Lernzeit>/mcp/src/index.ts'

export interface SetupOptions {
  token: string
  port: number
  /** This page's origin, e.g. http://localhost:5173. */
  origin: string
  serverPath?: string
}

/** A random token, like the one `crypto.randomUUID()` prints in a terminal. */
export function generateToken(): string {
  return crypto.randomUUID()
}

/** The server's environment that matches this browser's settings. */
export function serverEnv({ token, port, origin }: SetupOptions): Record<string, string> {
  return {
    LERNZEIT_TOKEN: token,
    ...(port !== DEFAULT_PORT && { LERNZEIT_PORT: String(port) }),
    ...(!LOCAL_ORIGINS.includes(origin) && { LERNZEIT_ORIGINS: origin }),
  }
}

/** The entry to paste inside "mcpServers" in claude_desktop_config.json. */
export function claudeDesktopEntry(options: SetupOptions): string {
  const entry = { lernzeit: { command: 'node', args: [options.serverPath ?? SERVER_PATH], env: serverEnv(options) } }
  // Drop the outer braces, so it pastes next to the servers already there.
  return JSON.stringify(entry, null, 2)
    .split('\n')
    .slice(1, -1)
    .map((line) => line.slice(2))
    .join('\n')
}

/** The command that adds the server to Claude Code. */
export function claudeCodeCommand(options: SetupOptions): string {
  const env = Object.entries(serverEnv(options)).map(([key, value]) => `-e ${key}=${value}`)
  return ['claude mcp add lernzeit', ...env, '--', 'node', `"${options.serverPath ?? SERVER_PATH}"`].join(' ')
}
