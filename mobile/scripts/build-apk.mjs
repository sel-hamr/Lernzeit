#!/usr/bin/env node
/*
 * Builds the signed release APK: loads the signing env (from the environment, or
 * ~/.lernzeit-android/keystore.env, or the file in LERNZEIT_KEYSTORE_ENV), regenerates
 * mobile/android with `expo prebuild --clean`, runs `gradlew assembleRelease`, and copies the APK to
 * mobile/dist/lernzeit-<version>.apk. Run from anywhere: `npm run build:apk -w @lernzeit/mobile`.
 */
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const mobile = join(dirname(fileURLToPath(import.meta.url)), '..')
const KEYS = ['LERNZEIT_KEYSTORE', 'LERNZEIT_KEYSTORE_PASSWORD', 'LERNZEIT_KEY_ALIAS', 'LERNZEIT_KEY_PASSWORD']

function loadSigningEnv() {
  if (KEYS.every((k) => process.env[k])) return
  const file = process.env.LERNZEIT_KEYSTORE_ENV ?? join(homedir(), '.lernzeit-android', 'keystore.env')
  if (!existsSync(file)) fail(`No signing keys: set ${KEYS.join(', ')} or create ${file} (see docs/android.md).`)
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/)
    if (m && KEYS.includes(m[1]) && !process.env[m[1]]) process.env[m[1]] = m[2]
  }
  const missing = KEYS.filter((k) => !process.env[k])
  if (missing.length) fail(`${file} is missing ${missing.join(', ')}.`)
  if (!existsSync(process.env.LERNZEIT_KEYSTORE)) fail(`The keystore ${process.env.LERNZEIT_KEYSTORE} does not exist.`)
}

function run(cmd, args, cwd) {
  console.log(`\n> ${cmd} ${args.join(' ')}`)
  const result = spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' })
  if (result.status !== 0) fail(`${cmd} failed (exit ${result.status}).`)
}

function fail(message) {
  console.error(`\nbuild-apk: ${message}`)
  process.exit(1)
}

loadSigningEnv()
const { version } = JSON.parse(readFileSync(join(mobile, 'package.json'), 'utf8'))
run('npx', ['expo', 'prebuild', '--platform', 'android', '--clean', '--no-install'], mobile)
const android = join(mobile, 'android')
run(join(android, process.platform === 'win32' ? 'gradlew.bat' : 'gradlew'), ['assembleRelease', '--no-daemon'], android)
const apk = join(android, 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk')
if (!existsSync(apk)) fail(`Gradle finished but ${apk} is missing.`)
mkdirSync(join(mobile, 'dist'), { recursive: true })
const out = join(mobile, 'dist', `lernzeit-${version}.apk`)
copyFileSync(apk, out)
console.log(`\nSigned APK: ${out}`)
