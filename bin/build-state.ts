/**
 * Decides whether `lz` has to build again before it serves `dist/`.
 *
 * Runs with Node's type stripping, outside the Vite build, so it uses only
 * erasable TypeScript and relative imports with extensions.
 */
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/** Everything a build reads, relative to the project root. */
export const BUILD_INPUTS: readonly string[] = [
  'src',
  'public',
  'index.html',
  'vite.config.ts',
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  'tsconfig.app.json',
  'tsconfig.node.json',
]

/** Written last by every build, so its time is when the build finished. */
export const BUILD_OUTPUT = join('dist', 'index.html')

/**
 * The latest modification time in ms of a file, or of a folder and everything in it, or 0 when it
 * is missing. A folder's own time changes when a file in it is added or deleted.
 */
export function newestChange(path: string): number {
  let stats
  try {
    stats = statSync(path)
  } catch {
    return 0
  }
  if (!stats.isDirectory()) return stats.mtimeMs
  let newest = stats.mtimeMs
  for (const entry of readdirSync(path)) newest = Math.max(newest, newestChange(join(path, entry)))
  return newest
}

/** True when there is no build yet, or a build input changed after it. */
export function needsBuild(root: string): boolean {
  const built = newestChange(join(root, BUILD_OUTPUT))
  if (built === 0) return true
  return BUILD_INPUTS.some((input) => newestChange(join(root, input)) > built)
}
