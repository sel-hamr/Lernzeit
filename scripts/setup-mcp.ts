#!/usr/bin/env node
/**
 * `npm run mcp:setup`: adds the Lernzeit MCP server to Claude Code and Claude Desktop.
 *
 * Claude Code gets it through `claude mcp add`, and Claude Desktop through its
 * claude_desktop_config.json, next to the servers already there. Both get the
 * same token, which you then paste in Settings → AI connection. Running it
 * again keeps the token, port and origins it set before.
 *
 * Runs with Node's type stripping, outside the Vite build, so it uses only
 * erasable TypeScript and relative imports with extensions.
 */
import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { DEFAULT_PORT } from '../src/bridge/protocol.ts'

const SERVER_PATH = fileURLToPath(new URL('../mcp/src/index.ts', import.meta.url)).replaceAll('\\', '/')
const NAME = 'lernzeit'
const SCOPES = ['user', 'local', 'project']

const USAGE = `Usage: npm run mcp:setup -- [options]

Adds the Lernzeit MCP server to Claude Code and Claude Desktop, with one token for both.
Running it again keeps the token, port and origins from Claude Desktop's config.

  --code              Only Claude Code
  --desktop           Only Claude Desktop
  --token <token>     The token (default: the one set before, or a new one)
  --port <port>       WebSocket port (default: ${DEFAULT_PORT})
  --origins <urls>    Extra page addresses allowed to connect, comma-separated,
                      such as your hosted Lernzeit
  --scope <scope>     Claude Code scope: user, local or project (default: user,
                      so it works from any folder)
  --print             Show what it would add, and change nothing
  -h, --help          Show this help`

export interface SetupOptions {
  code: boolean
  desktop: boolean
  token?: string
  port?: number
  origins?: string
  scope: string
  print: boolean
}

/** The options from the command line; throws a readable message when one is wrong. */
export function setupOptions(args: string[]): SetupOptions {
  const { values } = parseArgs({
    args,
    options: {
      code: { type: 'boolean', default: false },
      desktop: { type: 'boolean', default: false },
      token: { type: 'string' },
      port: { type: 'string' },
      origins: { type: 'string' },
      scope: { type: 'string', default: 'user' },
      print: { type: 'boolean', default: false },
    },
  })
  const port = values.port === undefined ? undefined : Number(values.port)
  if (port !== undefined && (!Number.isInteger(port) || port < 1 || port > 65_535)) throw new Error(`--port must be a port number, got "${values.port}".`)
  if (!SCOPES.includes(values.scope)) throw new Error(`--scope must be ${SCOPES.join(', ')}, got "${values.scope}".`)
  const token = values.token?.trim()
  if (values.token !== undefined && !token) throw new Error('--token is empty.')
  const both = !values.code && !values.desktop
  return {
    code: both || values.code,
    desktop: both || values.desktop,
    token,
    port,
    origins: values.origins?.split(',').map((o) => o.trim().replace(/\/+$/, '')).filter(Boolean).join(','),
    scope: values.scope,
    print: values.print,
  }
}

/** The server's environment: the options, then what was set before, then the defaults. Leaves out what is default. */
export function serverEnv(options: SetupOptions, before: Record<string, string> = {}): Record<string, string> {
  const port = options.port ?? (before.LERNZEIT_PORT ? Number(before.LERNZEIT_PORT) : DEFAULT_PORT)
  const origins = options.origins ?? before.LERNZEIT_ORIGINS
  return {
    LERNZEIT_TOKEN: options.token ?? before.LERNZEIT_TOKEN ?? randomUUID(),
    ...(port !== DEFAULT_PORT && { LERNZEIT_PORT: String(port) }),
    ...(origins && { LERNZEIT_ORIGINS: origins }),
  }
}

export const serverEntry = (env: Record<string, string>, serverPath = SERVER_PATH) => ({ command: 'node', args: [serverPath], env })

/**
 * Where Claude Desktop may keep its config, most likely first. On Windows the
 * Microsoft Store version keeps it in its package folder instead of AppData.
 */
export function desktopConfigPaths(platform: string = process.platform, env: NodeJS.ProcessEnv = process.env, home = homedir()): string[] {
  const file = 'claude_desktop_config.json'
  if (platform === 'darwin') return [join(home, 'Library', 'Application Support', 'Claude', file)]
  if (platform !== 'win32') return [join(env.XDG_CONFIG_HOME ?? join(home, '.config'), 'Claude', file)]
  const appData = env.APPDATA ?? join(home, 'AppData', 'Roaming')
  const packages = join(env.LOCALAPPDATA ?? join(home, 'AppData', 'Local'), 'Packages')
  const store = existsSync(packages) ? readdirSync(packages).filter((name) => name.startsWith('Claude_')) : []
  return [join(appData, 'Claude', file), ...store.map((name) => join(packages, name, 'LocalCache', 'Roaming', 'Claude', file))]
}

/** Claude Desktop's config, parsed. An empty object when the file is missing; throws when it is not a JSON object. */
export function parseDesktopConfig(text: string | undefined): Record<string, unknown> {
  if (!text?.trim()) return {}
  let config: unknown
  try {
    config = JSON.parse(text)
  } catch {
    throw new Error('is not valid JSON. Fix it by hand, or run with --code to set up Claude Code only.')
  }
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('is not a JSON object.')
  const servers = (config as Record<string, unknown>).mcpServers
  if (servers !== undefined && (!servers || typeof servers !== 'object' || Array.isArray(servers))) throw new Error('has an "mcpServers" that is not an object.')
  return config as Record<string, unknown>
}

/** The environment of the lernzeit entry already in this config, if any. */
export function previousEnv(config: Record<string, unknown>): Record<string, string> {
  const servers = config.mcpServers as Record<string, { env?: Record<string, string> }> | undefined
  return servers?.[NAME]?.env ?? {}
}

/** The config text with the lernzeit entry added or replaced, and every other setting kept. */
export function withServer(config: Record<string, unknown>, entry: ReturnType<typeof serverEntry>): string {
  const servers = { ...(config.mcpServers as Record<string, unknown> | undefined), [NAME]: entry }
  return `${JSON.stringify({ ...config, mcpServers: servers }, null, 2)}\n`
}

/** The arguments for `claude` that add the server. */
export function claudeCodeArgs(entry: ReturnType<typeof serverEntry>, scope: string): string[] {
  const env = Object.entries(entry.env).flatMap(([key, value]) => ['-e', `${key}=${value}`])
  return ['mcp', 'add', NAME, '--scope', scope, ...env, '--', entry.command, ...entry.args]
}

/** Quotes a word for the shell unless it is plainly safe. */
const quote = (word: string) => (/^[\w@%+=:,./-]+$/.test(word) ? word : `"${word.replaceAll('"', '\\"')}"`)

/**
 * Runs `claude` and returns its exit code, or undefined when it is not installed. It can be a .cmd
 * script on Windows, which only runs through a shell, so the shell gets one quoted line.
 */
function claude(args: string[], quiet = false): number | undefined {
  const line = ['claude', ...args].map(quote).join(' ')
  const result = spawnSync(line, { shell: true, stdio: quiet ? 'pipe' : 'inherit' })
  if (result.error) return undefined
  // A shell answers 127 (sh) or 1 with "is not recognized" (cmd) when the command is missing.
  if (result.status === 127 || /not recognized/.test(String(result.stderr ?? ''))) return undefined
  return result.status ?? 1
}

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err))

function main(args: string[]): number {
  if (args.includes('-h') || args.includes('--help')) {
    console.log(USAGE)
    return 0
  }
  let options: SetupOptions
  try {
    options = setupOptions(args)
  } catch (err) {
    console.error(`${errorText(err)}\n\n${USAGE}`)
    return 1
  }

  // Claude Desktop's config holds the settings from last time, so read it first.
  const desktops: { path: string; config: Record<string, unknown> }[] = []
  for (const path of desktopConfigPaths()) {
    if (!existsSync(dirname(path))) continue
    try {
      desktops.push({ path, config: parseDesktopConfig(existsSync(path) ? readFileSync(path, 'utf8') : undefined) })
    } catch (err) {
      console.error(`${path} ${errorText(err)}`)
      return 1
    }
  }
  const before = desktops.map(({ config }) => previousEnv(config)).find((env) => env.LERNZEIT_TOKEN)
  const entry = serverEntry(serverEnv(options, before))

  if (options.print) {
    if (options.code) console.log(`Claude Code:\n\n  ${['claude', ...claudeCodeArgs(entry, options.scope)].map(quote).join(' ')}\n`)
    if (options.desktop) console.log(`Claude Desktop, inside "mcpServers" in claude_desktop_config.json:\n\n${JSON.stringify({ [NAME]: entry }, null, 2)}\n`)
    return 0
  }

  let done = 0
  let failed = 0
  if (options.code) {
    // Remove it first, so running again replaces it instead of failing on the name.
    if (claude(['mcp', 'remove', NAME, '--scope', options.scope], true) === undefined) {
      console.log('Claude Code: not found. Install it, or add the server later with npm run mcp:setup -- --code.')
    } else if (claude(claudeCodeArgs(entry, options.scope)) === 0) {
      console.log(`Claude Code: added "${NAME}" (${options.scope} scope).`)
      done++
    } else {
      console.error('Claude Code: adding the server failed, see above.')
      failed++
    }
  }
  if (options.desktop) {
    if (desktops.length === 0) console.log('Claude Desktop: not found. Install it and open it once, then run this again with --desktop.')
    for (const { path, config } of desktops) {
      writeFileSync(path, withServer(config, entry))
      console.log(`Claude Desktop: added "${NAME}" to ${path}`)
      done++
    }
  }
  if (done === 0) return 1

  const token = entry.env.LERNZEIT_TOKEN
  const same = before?.LERNZEIT_TOKEN === token ? ' (the same as before)' : ''
  const port = entry.env.LERNZEIT_PORT ? `\n   Set Port to ${entry.env.LERNZEIT_PORT}.` : ''
  console.log(`
Token: ${token}${same}

1. Open Lernzeit, then Settings → AI connection.
2. Turn on Connect to AI, type a browser name and paste the token.${port}
3. Restart Claude Desktop, or start a new Claude Code session.
4. Ask: "Which Lernzeit browsers are connected?"`)
  return failed > 0 ? 1 : 0
}

// Run only from the command line, not when the tests import it.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) process.exitCode = main(process.argv.slice(2))
