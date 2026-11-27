#!/usr/bin/env node
/**
 * `lz`: starts the production build of Lernzeit from any folder.
 *
 * Builds when the code changed since the last build, then serves `dist/` with
 * `vite preview` on http://localhost:5173 and opens it in the browser.
 * Install it once with `npm link` in the project folder.
 */
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { needsBuild } from './build-state.ts'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const VITE = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url))
/**
 * The dev server's port. The browser keeps data per address, so the build sees the same cards and
 * history as `npm run dev`. The two cannot run at the same time.
 */
const PORT = 5173
const ADDRESS = `http://localhost:${PORT}`

const USAGE = `Usage: lz [--build]
       lz <script> [args]

Starts Lernzeit's production build on ${ADDRESS} and opens it.
Builds first when the code changed since the last build.

  -b, --build   Build again even when nothing changed
  -h, --help    Show this help

lz <script> runs one of the project's npm scripts from any folder,
such as lz dev, lz test or lz lint. Extra words go to the script.`

/** Runs a command in the project folder and resolves with its exit code. */
function run(command: string, args: readonly string[], shell = false): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: ROOT, stdio: 'inherit', shell })
    child.on('error', reject)
    child.on('exit', (code, signal) => resolve(code ?? (signal ? 1 : 0)))
  })
}

/** Quotes a word for the shell unless it is plainly safe. */
const quote = (word: string) => (/^[\w@%+=:,./-]+$/.test(word) ? word : `"${word.replaceAll('"', '\\"')}"`)

/**
 * Runs npm with these words. npm is a .cmd script on Windows, which only runs through a shell,
 * and the shell gets one quoted line because Node does not escape a list of arguments for it.
 */
const npm = (words: readonly string[]) => run(['npm', ...words].map(quote).join(' '), [], true)

/** What serves Lernzeit on the port: the build, the dev server, or nothing. */
async function whatIsRunning(): Promise<'build' | 'dev' | undefined> {
  try {
    const response = await fetch(ADDRESS, { signal: AbortSignal.timeout(1000) })
    const html = await response.text()
    if (!html.includes('<title>Lernzeit</title>')) return undefined
    return html.includes('/@vite/client') ? 'dev' : 'build'
  } catch {
    return undefined
  }
}

function openBrowser(url: string) {
  const [command, args] =
    process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]]
    : process.platform === 'darwin' ? ['open', [url]]
    : ['xdg-open', [url]]
  spawn(command, args, { stdio: 'ignore', detached: true }).unref()
}

async function main(argv: readonly string[]): Promise<number> {
  // Ctrl+C reaches the child too; wait for it to stop instead of leaving it behind.
  process.on('SIGINT', () => {})

  const [script, ...rest] = argv
  if (script && !script.startsWith('-')) return npm(['run', script, '--', ...rest])

  const unknown = argv.filter((arg) => !['-b', '--build', '-h', '--help'].includes(arg))
  if (argv.includes('-h') || argv.includes('--help') || unknown.length > 0) {
    if (unknown.length > 0) console.error(`Unknown option: ${unknown.join(' ')}\n`)
    console.log(USAGE)
    return unknown.length > 0 ? 1 : 0
  }
  const force = argv.includes('-b') || argv.includes('--build')

  const running = await whatIsRunning()
  if (running === 'dev') {
    console.error(`The dev server is running on ${ADDRESS}, which lz uses too.\nStop it with Ctrl+C in its window, then run lz again.`)
    return 1
  }
  if (running === 'build') {
    if (force || needsBuild(ROOT)) {
      const why = force ? 'so it cannot build now' : 'with an older build'
      console.error(`Lernzeit is already running on ${ADDRESS} ${why}.\nStop it with Ctrl+C in its window, then run lz${force ? ' --build' : ''} again.`)
      return 1
    }
    console.log(`Lernzeit is already running. Opening ${ADDRESS}`)
    openBrowser(ADDRESS)
    return 0
  }

  if (force || needsBuild(ROOT)) {
    console.log('Building Lernzeit…')
    const code = await npm(['run', 'build'])
    if (code !== 0) return code
  }

  return run(process.execPath, [VITE, 'preview', '--port', String(PORT), '--strictPort', '--open'])
}

process.exitCode = await main(process.argv.slice(2))
