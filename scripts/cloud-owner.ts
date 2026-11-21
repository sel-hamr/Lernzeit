#!/usr/bin/env node
/**
 * `npm run cloud:owner`: sets the one owner account of the cloud Worker (there is no sign-up page).
 *
 * Asks for the email and the password (twice, hidden), hashes the password here with the Worker's
 * own `hashPassword`, and writes only the hash to D1 through wrangler. Running it again replaces
 * the owner: use it to change the password. That signs every browser and device out; the synced
 * data stays, since the owner keeps the same id.
 *
 * Runs with Node's type stripping, outside the Vite build, so it uses only erasable TypeScript and
 * relative imports with extensions.
 */
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { createInterface } from 'node:readline'
import { Writable } from 'node:stream'
import { fileURLToPath } from 'node:url'
import { hashPassword, type StoredPassword } from '../worker/src/password.ts'

/** The owner's id in every table. It never changes, so replacing the owner keeps the synced data. */
export const OWNER_ID = 'owner'
const DATABASE = 'lernzeit'
const MIN_PASSWORD_LENGTH = 10
const ROOT = fileURLToPath(new URL('..', import.meta.url))

const USAGE = `Usage: npm run cloud:owner -- [--local]

Sets the email and password of the one Lernzeit cloud account, replacing any
owner set before and signing every browser and device out.

  --local     Write to the local D1 database (.wrangler/) instead of Cloudflare's
  -h, --help  Show this help`

/** The email to store: trimmed and lower-case, as the Worker compares it. Throws when it is not an address. */
export function checkEmail(input: string): string {
  const email = input.trim().toLowerCase()
  const control = [...email].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)
  if (control || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error(`"${input.trim()}" is not an email address.`)
  return email
}

/** Throws when the password is too short or the two typings differ. */
export function checkPassword(password: string, again: string): void {
  if (password.length < MIN_PASSWORD_LENGTH) throw new Error(`The password needs at least ${MIN_PASSWORD_LENGTH} characters.`)
  if (password !== again) throw new Error('The two passwords do not match.')
}

const sqlString = (text: string) => `'${text.replaceAll("'", "''")}'`

/** The SQL that replaces the owner. It holds the hash and salt, never the password. */
export function ownerSql(email: string, stored: StoredPassword, now: number): string {
  const values = [sqlString(OWNER_ID), sqlString(email), sqlString(stored.hash), sqlString(stored.salt), Math.trunc(stored.iterations), Math.trunc(now)]
  return (
    'DELETE FROM auth_tokens;\n' +
    'DELETE FROM owner;\n' +
    `INSERT INTO owner (id, email, pass_hash, pass_salt, iterations, created_at) VALUES (${values.join(', ')});\n`
  )
}

export function wranglerArgs(file: string, local: boolean): string[] {
  return ['d1', 'execute', DATABASE, local ? '--local' : '--remote', '--file', file]
}

/**
 * Asks questions on the terminal, one line each. A hidden question still reads what is typed but
 * stops readline from echoing it.
 */
function terminal() {
  let muted = false
  const output = new Writable({
    write(chunk, encoding, done) {
      if (!muted) process.stdout.write(chunk, encoding)
      done()
    },
  })
  const rl = createInterface({ input: process.stdin, output, terminal: Boolean(process.stdin.isTTY) })
  rl.on('SIGINT', () => {
    process.stdout.write('\n')
    process.exit(130)
  })
  const lines = rl[Symbol.asyncIterator]()
  return {
    async ask(question: string, hidden = false): Promise<string> {
      process.stdout.write(question)
      muted = hidden
      const line = await lines.next()
      muted = false
      if (hidden) process.stdout.write('\n')
      if (line.done) throw new Error('Stopped before every answer was typed.')
      return line.value
    },
    close: () => rl.close(),
  }
}

/** Runs the wrangler installed in this repo with Node, which needs no shell on Windows (as `npx` would). */
function wrangler(args: string[]): number {
  const bin = join(dirname(createRequire(import.meta.url).resolve('wrangler/package.json')), 'bin', 'wrangler.js')
  const result = spawnSync(process.execPath, [bin, ...args], { cwd: ROOT, stdio: 'inherit' })
  if (result.error) throw result.error
  return result.status ?? 1
}

async function main(args: string[]): Promise<number> {
  if (args.includes('-h') || args.includes('--help')) {
    console.log(USAGE)
    return 0
  }
  const unknown = args.filter((arg) => arg !== '--local')
  if (unknown.length) {
    console.error(`Unknown option ${unknown[0]}.\n\n${USAGE}`)
    return 1
  }
  const local = args.includes('--local')

  const io = terminal()
  let email: string
  let password: string
  try {
    if (!process.stdin.isTTY) console.warn('This window cannot hide what you type, so the password will show. PowerShell or Windows Terminal can hide it.')
    email = checkEmail(await io.ask('Email: '))
    for (;;) {
      password = await io.ask(`Password (at least ${MIN_PASSWORD_LENGTH} characters): `, true)
      const again = await io.ask('Password again: ', true)
      try {
        checkPassword(password, again)
        break
      } catch (error) {
        console.error((error as Error).message)
      }
    }
  } finally {
    io.close()
  }

  const stored = await hashPassword(password)
  const dir = mkdtempSync(join(tmpdir(), 'lernzeit-owner-'))
  const file = join(dir, 'owner.sql')
  try {
    writeFileSync(file, ownerSql(email, stored, Date.now()), { mode: 0o600 })
    const status = wrangler(wranglerArgs(file, local))
    if (status !== 0) {
      console.error(`wrangler failed (exit ${status}). Nothing was changed if it stopped before running the SQL.`)
      return status
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
  console.log(`The owner is now ${email}${local ? ' in the local database' : ''}. Every browser and device must sign in again.`)
  return 0
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main(process.argv.slice(2)).then(
    (code) => (process.exitCode = code),
    (error: Error) => {
      console.error(error.message)
      process.exitCode = 1
    },
  )
}
